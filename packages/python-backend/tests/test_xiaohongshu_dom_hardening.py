"""小红书 DOM/RPA 轨加固单测（rpa-xiaohongshu-dom-hardening PR-1）。

用注入的假 page + 假 monitor 覆盖发布编排的核心分支，零真实浏览器：
- 草稿 fail-closed：找不到草稿入口绝不 fallthrough 点发布。
- 确认才成功：XHR 响应命中才成功且带真实 url；无正面确认绝不报成功。
- 选择器多候选回退；contenteditable 走 dispatch；标签逐个 type 不覆盖。
- 登录过期 / 风控弹层归一到对应错误码。
"""

from __future__ import annotations

import pytest

from multi_publish.models import PlatformType
from multi_publish.publishers import xiaohongshu as xhs
from multi_publish.publishers.base import PublisherConfig
from multi_publish.publishers.xiaohongshu import XiaoHongShuPublisher


class FakeLocator:
    def __init__(self, page, sel, index=None):
        self._page = page
        self._sel = sel
        self._index = index

    @property
    def first(self):
        return self

    async def is_visible(self):
        return self._sel in self._page.visible

    async def count(self):
        return self._page.count_for(self._sel)

    def nth(self, i):
        return FakeLocator(self._page, self._sel, i)

    async def inner_text(self):
        texts = self._page.item_texts.get(self._sel, [])
        if self._index is not None and self._index < len(texts):
            return texts[self._index]
        return texts[0] if texts else ""

    async def click(self, *a, **k):
        self._page.clicked.append(self._sel)

    async def fill(self, text):
        if self._sel in self._page.not_fillable:
            raise AssertionError("Element is not an <input> (simulate contenteditable)")
        self._page.filled.setdefault(self._sel, []).append(text)

    async def type(self, text, delay=0):
        self._page.typed.append((self._sel, text))

    async def press(self, key):
        self._page.pressed.append(key)

    async def set_input_files(self, paths):
        self._page.uploaded.append(paths)

    async def evaluate(self, js, arg=None):
        self._page.evaluated.append((self._sel, arg))


class FakePage:
    def __init__(self):
        self.visible: set[str] = set()
        self.counts: dict[str, int] = {}
        self.not_fillable: set[str] = set()
        self.item_texts: dict[str, list[str]] = {}
        self.url = "https://creator.xiaohongshu.com/publish/publish"
        self.navigations: list[str] = []
        self.clicked: list[str] = []
        self.filled: dict[str, list[str]] = {}
        self.typed: list[tuple[str, str]] = []
        self.pressed: list[str] = []
        self.uploaded: list = []
        self.evaluated: list[tuple[str, str]] = []

    async def goto(self, url, **k):
        self.navigations.append(url)

    def locator(self, sel):
        return FakeLocator(self, sel)

    def count_for(self, sel):
        if sel in self.item_texts:
            return len(self.item_texts[sel])
        if sel in self.counts:
            return self.counts[sel]
        return 1 if sel in self.visible else 0


class FakeMonitor:
    def __init__(self, responses=None):
        self.responses = responses or []
        self.watched: list[str] = []

    def watch_patterns(self, patterns):
        self.watched = list(patterns)

    async def wait_for_response(self, timeout=30.0, predicate=None):
        for r in self.responses:
            data = r.get("data")
            if predicate is None or predicate(data):
                return data
        return None

    def stop(self):
        pass


TITLE_SEL = '[placeholder*="标题"]'  # title_input 回退链首个候选
DRAFT_SEL = 'button:has-text("存草稿")'  # draft_button 回退链首个候选
PUBLISH_SEL = 'button:has-text("发布")'


@pytest.fixture
def publisher(tmp_path) -> XiaoHongShuPublisher:
    return XiaoHongShuPublisher(
        PublisherConfig(platform=PlatformType.XIAOHONGSHU, data_dir=str(tmp_path), headless=True)
    )


def _base_page():
    p = FakePage()
    p.visible.add(TITLE_SEL)  # 标题可解析可填
    return p


async def _flow(pub, page, monitor, **kw):
    params = dict(title="测试标题", content="正文", media_paths=[], cover_path=None, tags=[], draft=True)
    params.update(kw)
    return await pub._execute_flow(page, monitor, **params)


class TestDraftFailClosed:
    @pytest.mark.asyncio
    async def test_missing_draft_entry_blocks_public_publish(self, publisher, monkeypatch):
        monkeypatch.setattr(xhs, "DRAFT_SAVE_RESPONSE_PATTERNS", [], raising=False)
        page = _base_page()
        page.visible.add(PUBLISH_SEL)  # 发布按钮存在，但草稿入口缺失
        result = await _flow(publisher, page, FakeMonitor(), draft=True)
        assert result.success is False
        assert xhs.CODE_DRAFT_ENTRY_MISSING in (result.error or "")
        # 关键红线：绝不能点击公开发布按钮
        assert PUBLISH_SEL not in page.clicked


class TestConfirmBeforeSuccess:
    @pytest.mark.asyncio
    async def test_response_confirms_and_sets_real_url(self, publisher, monkeypatch):
        monkeypatch.setattr(xhs, "DRAFT_SAVE_RESPONSE_PATTERNS", ["/draft/save"], raising=False)
        page = _base_page()
        page.visible.add(DRAFT_SEL)
        monitor = FakeMonitor(responses=[{"url": "/draft/save", "data": {"code": 0, "data": {"draft_id": "D123"}}}])
        result = await _flow(publisher, page, monitor, draft=True)
        assert result.success is True
        assert "D123" in (result.url or "")
        assert DRAFT_SEL in page.clicked

    @pytest.mark.asyncio
    async def test_no_confirmation_reports_failure_not_blind_success(self, publisher, monkeypatch):
        monkeypatch.setattr(xhs, "DRAFT_SAVE_RESPONSE_PATTERNS", [], raising=False)
        page = _base_page()
        page.visible.add(DRAFT_SEL)
        page.item_texts[xhs.DRAFT_BOX_ITEM_SELECTOR] = []  # 草稿箱回查无命中
        result = await _flow(publisher, page, FakeMonitor(), draft=True)
        assert result.success is False
        assert xhs.CODE_UNCONFIRMED in (result.error or "")


class TestSelectorFallbackAndRichFill:
    @pytest.mark.asyncio
    async def test_fallback_hits_later_candidate(self, publisher):
        page = FakePage()
        second = 'input[placeholder*="输入标题"]'  # title_input 回退链第 2 候选
        page.visible.add(second)
        ok = await publisher._set_field(page, "title_input", "内容标题")
        assert ok is True
        assert page.filled.get(second) == ["内容标题"]

    @pytest.mark.asyncio
    async def test_contenteditable_uses_dispatch_path(self, publisher):
        page = FakePage()
        ce = '[class*="editor"] [contenteditable="true"]'  # content_textarea 首候选
        page.visible.add(ce)
        page.not_fillable.add(ce)  # 模拟 contenteditable：fill 抛错
        ok = await publisher._set_field(page, "content_textarea", "富文本正文")
        assert ok is True
        assert (ce, "富文本正文") in page.evaluated

    @pytest.mark.asyncio
    async def test_tags_use_type_not_overwrite_fill(self, publisher):
        page = _base_page()
        tag_sel = publisher.selectors["tag_input"]
        page.visible.add(tag_sel)
        await publisher._add_tags(page, ["标签A", "标签B"])
        typed_tags = [t for _, t in page.typed]
        assert typed_tags == ["标签A", "标签B"]
        assert tag_sel not in page.filled  # 未用覆盖式 fill


class TestErrorNormalization:
    @pytest.mark.asyncio
    async def test_login_redirect_maps_login_expired(self, publisher):
        page = _base_page()
        page.url = "https://creator.xiaohongshu.com/login"
        result = await _flow(publisher, page, FakeMonitor(), draft=True)
        assert result.success is False
        assert xhs.CODE_LOGIN_EXPIRED in (result.error or "")

    @pytest.mark.asyncio
    async def test_risk_overlay_maps_risk_blocked(self, publisher, monkeypatch):
        monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", '[class*="verify"]', raising=False)
        page = _base_page()
        page.counts['[class*="verify"]'] = 1
        result = await _flow(publisher, page, FakeMonitor(), draft=True)
        assert result.success is False
        assert xhs.CODE_RISK_BLOCKED in (result.error or "")


class TestRegression:
    @pytest.mark.asyncio
    async def test_empty_title_short_circuit(self, publisher):
        result = await publisher.publish("", "")
        assert result.success is False
        assert "标题不能为空" in result.error
