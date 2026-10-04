"""小红书发布器（RPA / DOM 轨）

使用 Playwright 自动化浏览器把图文/视频保存进小红书创作平台。

设计要点（rpa-xiaohongshu-dom-hardening）：
- 验收目标为「存入真实草稿箱」，成功判定来自正面确认信号（ResponseMonitor 捕获
  草稿保存端点响应，或草稿箱回查命中），绝不盲 sleep 后无条件报成功、绝不伪造 url。
- 草稿意图 fail-closed：找不到草稿入口一律报错并阻止任何公开发布点击。
- 发布步骤逻辑与真实浏览器启动解耦（_execute_flow 接收注入的 page + monitor），
  可在假对象下单测核心分支。
- 合规红线：运行时不请求任何外部签名/求签服务（*.refpub.cn / *.yixiaoer.cn）。

实现参照 douyin.py 的「先查 API 响应、再 URL、再 DOM」三级回退确认范式。
"""

from __future__ import annotations

import asyncio
import os

from loguru import logger

from multi_publish.models import PlatformType, PublishPhase, PublishResult
from multi_publish.publishers.base import BasePublisher, PublisherConfig, ResponseMonitor, wait_until
from multi_publish.publishers.legacy_auth_policy import require_legacy_plaintext_auth

# 逻辑控件 → 主选择器（保持字符串，兼容既有选择器存在性断言）。
DEFAULT_SELECTORS = {
    "login_qrcode": '[class*="qrcode"]',
    "login_success_indicator": '[class*="creator-home"]',
    "upload_page_url": "https://creator.xiaohongshu.com/publish/publish",
    "upload_input": 'input[type="file"]',
    "title_input": '[class*="title"] input, [placeholder*="标题"]',
    "content_textarea": '[class*="content"] textarea, [class*="desc"] textarea, [placeholder*="正文"]',
    "publish_button": 'button:has-text("发布"), button:has-text("发布笔记")',
    "tag_input": '[class*="tag"] input, [placeholder*="标签"]',
    "cover_upload": '[class*="cover"]',
    "cover_input": 'input[type="file"]',
    "upload_progress": '[class*="progress"]',
    "upload_complete": '[class*="upload-success"]',
    "draft_button": 'button:has-text("草稿")',
}

# 逻辑控件 → 多候选回退链（Tier2 取证后回填更稳的具体值）。命中即停止。
# 与 DEFAULT_SELECTORS 并存：解析时先取回退链，无回退链则回退 DEFAULT_SELECTORS 单值。
SELECTOR_FALLBACKS: dict[str, list[str]] = {
    "title_input": [
        '[placeholder*="标题"]',
        'input[placeholder*="输入标题"]',
        '[class*="title"] input',
        '[class*="title"] [contenteditable="true"]',
    ],
    "content_textarea": [
        '[class*="editor"] [contenteditable="true"]',
        '[contenteditable="true"][class*="desc"]',
        '[class*="content"] textarea',
        '[class*="content"] [contenteditable="true"]',
        '[placeholder*="正文"]',
    ],
    "draft_button": [
        'button:has-text("存草稿")',
        'button:has-text("保存草稿")',
        '[class*="draft"]',
        'button:has-text("草稿")',
    ],
    "publish_button": [
        'button:has-text("发布笔记")',
        'div[role="button"]:has-text("发布")',
        'button:has-text("发布")',
    ],
    "upload_complete": [
        '[class*="upload-success"]',
        '[class*="upload"] [class*="success"]',
        '[class*="preview"] img',
    ],
}

# Tier2 活体取证回填项（当前为占位，未取证前确认通道保守返回未确认）：
# 草稿保存成功的 XHR 端点子串（命中后经响应体判定 code==0/success==true）。
DRAFT_SAVE_RESPONSE_PATTERNS: list[str] = []
# 草稿保存成功的响应体判定字段（code==0 或 success==true 视为成功）。
CONFIRM_TIMEOUT_S = 20.0
# 草稿箱回查兜底：导航地址 + 条目匹配选择器（Tier2 取证回填）。
DRAFT_BOX_URL = "https://creator.xiaohongshu.com/publish/publish?draft=true"
DRAFT_BOX_ITEM_SELECTOR = '[class*="draft"] [class*="title"]'
# 风控/验证弹层选择器（Tier2 取证回填），命中即判 risk_blocked 并停止。
RISK_OVERLAY_SELECTOR = ""

CREATOR_URL = "https://creator.xiaohongshu.com/"

# 机器可读错误码前缀，便于上层 outcomeOfResult 归一（risk/login 绝不降级换号）。
CODE_LOGIN_EXPIRED = "XHS_LOGIN_EXPIRED"
CODE_RISK_BLOCKED = "XHS_RISK_BLOCKED"
CODE_DRAFT_ENTRY_MISSING = "XHS_DRAFT_ENTRY_MISSING"
CODE_UPLOAD_FAILED = "XHS_UPLOAD_FAILED"
CODE_TITLE_FAILED = "XHS_TITLE_FAILED"
CODE_UNCONFIRMED = "XHS_UNCONFIRMED"

# 脆弱等待改造：固定 sleep 换成条件轮询 + 具名上限。
NAVIGATE_READY_TIMEOUT_S = 10.0
NAVIGATE_READY_POLL_INTERVAL_S = 0.5
UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0
UPLOAD_FALLBACK_POLL_INTERVAL_S = 0.5


def _coded(code: str, message: str) -> str:
    """把机器可读码拼进 error 字符串，保留人类可读信息。"""
    return f"[{code}] {message}"


class XiaoHongShuPublisher(BasePublisher):
    """小红书发布器（RPA / DOM 轨）"""

    def __init__(self, config: PublisherConfig, account_id: str | None = None):
        super().__init__(config, account_id=account_id)
        self._configure_account_storage()
        self._browser = None
        self._context = None
        self._page = None
        self._playwright = None
        self._playwright_app = None
        self.selectors = dict(DEFAULT_SELECTORS)
        self.selector_fallbacks = dict(SELECTOR_FALLBACKS)
        self.creator_url = CREATOR_URL
        self._login_timeout = 120
        self._publish_timeout = 300
        self._upload_wait_timeout = 600

    @property
    def platform(self) -> PlatformType:
        return PlatformType.XIAOHONGSHU

    async def initialize(self):
        pass

    async def _ensure_browser(self):
        if self._page:
            return
        from playwright.async_api import async_playwright

        self._playwright_app = await async_playwright().start()
        self._context = await self._playwright_app.chromium.launch_persistent_context(
            user_data_dir=self._get_browser_data_dir(),
            headless=self.config.headless,
            viewport={"width": 1280, "height": 800},
        )
        self._page = await self._context.new_page()
        await self._restore_auth_data()

    async def login(self) -> bool:
        """打开浏览器等待用户扫码登录"""
        await self._ensure_browser()
        logger.info("小红书：请扫码登录")
        await self._page.goto(self.creator_url, wait_until="domcontentloaded")
        for _ in range(self._login_timeout):
            await asyncio.sleep(1)
            if self.creator_url.rstrip("/") in self._page.url:
                logger.success("小红书登录成功")
                await self._save_auth_data()
                return True
        logger.warning("小红书登录超时")
        return False

    async def check_auth(self) -> bool:
        try:
            await self._ensure_browser()
            if not self._page:
                return False
            await self._page.goto(self.creator_url, wait_until="domcontentloaded")
            await asyncio.sleep(2)
            if "/login" in self._page.url:
                return False
            return True
        except Exception:
            return False

    async def publish(
        self,
        title: str,
        content: str = "",
        media_paths: list[str] | None = None,
        cover_path: str | None = None,
        tags: list[str] | None = None,
        draft: bool = False,
        **kwargs,
    ) -> PublishResult:
        logger.info(f"[小红书] 开始发布: {title}")
        if not title:
            return PublishResult(success=False, platform="xiaohongshu", error="标题不能为空")
        await self._report_progress(PublishPhase.PREPARING, "准备发布...", 5)
        try:
            return await self._do_publish_rpa(
                title=title,
                content=content,
                media_paths=media_paths or [],
                cover_path=cover_path,
                tags=tags or [],
                draft=draft,
            )
        except Exception as e:
            logger.error(f"[小红书] 发布失败: {e}")
            return PublishResult(success=False, platform="xiaohongshu", error=_coded(CODE_UNCONFIRMED, f"发布异常: {e}"))

    async def _do_publish_rpa(
        self,
        title: str,
        content: str,
        media_paths: list[str],
        cover_path: str | None,
        tags: list[str],
        draft: bool,
    ) -> PublishResult:
        """启动真实浏览器 + 恢复登录态，再委托可桩的 _execute_flow。"""
        await self._report_progress(PublishPhase.AUTHENTICATING, "启动浏览器...", 10)
        from playwright.async_api import async_playwright

        self._playwright_app = await async_playwright().start()
        self._context = await self._playwright_app.chromium.launch_persistent_context(
            user_data_dir=self._get_browser_data_dir(),
            headless=self.config.headless,
            viewport={"width": 1280, "height": 800},
        )
        self._page = await self._context.new_page()

        await self._report_progress(PublishPhase.AUTHENTICATING, "恢复登录态...", 15)
        auth_ok = await self._restore_auth_data()
        if not auth_ok:
            return PublishResult(
                success=False,
                platform="xiaohongshu",
                error=_coded(CODE_LOGIN_EXPIRED, "认证数据不存在或已过期，请先登录"),
            )
        return await self._execute_flow(
            self._page,
            ResponseMonitor(self._page),
            title=title,
            content=content,
            media_paths=media_paths,
            cover_path=cover_path,
            tags=tags,
            draft=draft,
        )

    async def _execute_flow(
        self,
        page,
        monitor,
        *,
        title: str,
        content: str,
        media_paths: list[str],
        cover_path: str | None,
        tags: list[str],
        draft: bool,
    ) -> PublishResult:
        """发布编排核心：接收注入的 page + monitor，无真实浏览器亦可单测。"""
        await self._report_progress(PublishPhase.PREPARING, "导航到上传页...", 20)
        await page.goto(self.selectors["upload_page_url"], wait_until="domcontentloaded")

        if self._is_login_redirect(getattr(page, "url", "")):
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_LOGIN_EXPIRED, "认证已过期，请重新登录"),
            )

        # 注册 XHR 监听（草稿保存确认，抗 UI 改版）
        try:
            if DRAFT_SAVE_RESPONSE_PATTERNS:
                monitor.watch_patterns(list(DRAFT_SAVE_RESPONSE_PATTERNS))
        except Exception as e:  # 监听失败降级为回查兜底，不阻断
            logger.warning(f"ResponseMonitor 注册失败（降级为回查兜底）: {e}")

        # 风控弹层：命中即停止，绝不绕过
        if await self._risk_present(page):
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_RISK_BLOCKED, "检测到风控/验证弹层，已停止"),
            )

        # 上传媒体（若有）
        await self._report_progress(PublishPhase.UPLOADING, "上传媒体文件...", 30)
        if media_paths:
            try:
                file_input, _ = await self._resolve_visible(page, "upload_input")
                if file_input is not None:
                    await file_input.set_input_files(media_paths)
            except Exception as e:
                return PublishResult(
                    success=False, platform="xiaohongshu",
                    error=_coded(CODE_UPLOAD_FAILED, f"媒体上传失败: {e}"),
                )
        await self._await_editor_ready(page)

        # 标题（必填，失败即终止）
        await self._report_progress(PublishPhase.PUBLISHING, "填写标题...", 70)
        if not await self._set_field(page, "title_input", title):
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_TITLE_FAILED, "填写标题失败（选择器未命中或控件不可写）"),
            )

        # 正文 / 标签 / 封面：尽力而为，失败不影响草稿保存
        if content:
            await self._set_field(page, "content_textarea", content)
        if tags:
            await self._add_tags(page, tags)
        if cover_path and os.path.exists(cover_path):
            await self._set_cover(page, cover_path)

        # 触发保存 + 确认
        await self._report_progress(PublishPhase.PUBLISHING, "保存草稿...", 90)
        if draft:
            return await self._save_as_draft(page, monitor, title)
        return await self._publish_public(page, monitor, title)

    # ── 保存与确认 ────────────────────────────────────────────
    async def _save_as_draft(self, page, monitor, title: str) -> PublishResult:
        """草稿 fail-closed：找不到草稿入口绝不 fallthrough 到公开发布。"""
        draft_btn, _ = await self._resolve_visible(page, "draft_button")
        if draft_btn is None:
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_DRAFT_ENTRY_MISSING, "未找到草稿保存入口，已阻止公开发布"),
            )
        await draft_btn.click()
        return await self._confirm_saved(page, monitor, title, kind="草稿")

    async def _publish_public(self, page, monitor, title: str) -> PublishResult:
        """真实公开发布（非默认验收路径），同样确认才报成功。"""
        publish_btn, _ = await self._resolve_visible(page, "publish_button")
        if publish_btn is None:
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_UNCONFIRMED, "未找到发布按钮，未执行公开发布"),
            )
        await publish_btn.click()
        return await self._confirm_saved(page, monitor, title, kind="发布")

    async def _confirm_saved(self, page, monitor, title: str, *, kind: str) -> PublishResult:
        """确认才成功：优先 XHR 响应，回退 URL 跳转，再回退草稿箱回查；均无 → 未确认失败。"""
        confirmed, url = False, None

        # 1) XHR 响应（最稳）
        if DRAFT_SAVE_RESPONSE_PATTERNS:
            data = await monitor.wait_for_response(timeout=CONFIRM_TIMEOUT_S, predicate=self._resp_success)
            if data is not None and self._resp_success(data):
                confirmed = True
                url = self._extract_url(data)
            elif data is not None:
                logger.warning(f"[小红书] 捕获到 {kind} 响应但非成功码: {data}")

        # 2) URL 跳转兜底（仅认显式 success 跳转；存草稿停在 SPA 编辑页不算确认）
        if not confirmed:
            cur = getattr(page, "url", "") or ""
            if "publish/success" in cur or cur.rstrip("/").endswith("/success"):
                confirmed = True
                url = url or cur

        # 3) 草稿箱回查兜底
        if not confirmed:
            confirmed = await self._recheck_draft_box(page, title)
            if confirmed:
                url = url or DRAFT_BOX_URL

        await self._report_progress(PublishPhase.DONE, f"{kind}完成" if confirmed else f"{kind}未确认", 100)

        if not confirmed:
            logger.warning(f"[小红书] {kind} 无正面确认，按失败上报（不伪造成功）: {title}")
            return PublishResult(
                success=False, platform="xiaohongshu",
                error=_coded(CODE_UNCONFIRMED, f"{kind} 未获正面确认（无成功响应/URL 跳转/草稿箱回查命中）"),
            )
        logger.success(f"[小红书] {kind} 确认成功: {url}")
        return PublishResult(success=True, platform="xiaohongshu", url=url or DRAFT_BOX_URL)

    @staticmethod
    def _resp_success(data) -> bool:
        if not isinstance(data, dict):
            return False
        if data.get("code") == 0:
            return True
        if data.get("success") is True:
            return True
        return False

    @staticmethod
    def _extract_url(data) -> str | None:
        if not isinstance(data, dict):
            return None
        inner = data.get("data") or {}
        for key in ("draft_id", "note_id", "id", "url"):
            val = inner.get(key) if isinstance(inner, dict) else None
            if val:
                if key in ("draft_id", "note_id", "id"):
                    return f"{DRAFT_BOX_URL.rstrip('/')}?{key}={val}"
                return str(val)
        return None

    async def _recheck_draft_box(self, page, title: str) -> bool:
        """导航草稿箱，匹配本次标题。Tier2 取证前 DRAFT_BOX_ITEM_SELECTOR 可能不命中 → False。"""
        if not title:
            return False
        try:
            await page.goto(DRAFT_BOX_URL, wait_until="domcontentloaded")
            items = page.locator(DRAFT_BOX_ITEM_SELECTOR)
            count = await items.count()
            for i in range(count):
                txt = await items.nth(i).inner_text()
                if title[:12] and title[:12] in (txt or ""):
                    return True
            return False
        except Exception as e:
            logger.debug(f"草稿箱回查失败: {e}")
            return False

    # ── 选择器 / 填写辅助 ──────────────────────────────────────
    def _candidates_for(self, key: str) -> list[str]:
        chain = self.selector_fallbacks.get(key)
        if chain:
            return list(chain)
        single = self.selectors.get(key)
        return [single] if single else []

    async def _resolve_visible(self, page, key: str):
        """按候选回退链解析首个可见 locator，返回 (locator, selector) 或 (None, None)。"""
        for sel in self._candidates_for(key):
            try:
                loc = page.locator(sel).first
                if await loc.is_visible():
                    return loc, sel
            except Exception:
                continue
        return None, None

    async def _set_field(self, page, key: str, text: str) -> bool:
        """标题/正文填写：优先原生 fill，contenteditable 回退 evaluate + dispatch 事件。"""
        loc, _ = await self._resolve_visible(page, key)
        if loc is None:
            return False
        try:
            await loc.click()
        except Exception:
            pass
        try:
            await loc.fill(text)
            return True
        except Exception:
            # contenteditable div 等非原生输入：直接设值并派发 input/change
            try:
                await loc.evaluate(
                    "(el, t) => { el.textContent = t;"
                    " el.dispatchEvent(new Event('input', { bubbles: true }));"
                    " el.dispatchEvent(new Event('change', { bubbles: true })); }",
                    text,
                )
                return True
            except Exception as e:
                logger.warning(f"[小红书] 字段 {key} 填写失败: {e}")
                return False

    async def _add_tags(self, page, tags: list[str]) -> None:
        """逐个 type + 尽力选下拉首个候选（修覆盖式 fill 只留最后一个）。"""
        loc, _ = await self._resolve_visible(page, "tag_input")
        if loc is None:
            logger.debug("未找到标签输入框，跳过标签")
            return
        for tag in tags[:5]:
            try:
                await loc.click()
                await loc.type(tag, delay=50)
                # 尽力接受首个下拉建议（Tier2 取证精确化），失败仅忽略该标签
                sugg, _ = await self._resolve_visible(page, "tag_suggestion")
                if sugg is not None:
                    await sugg.click()
                else:
                    await loc.press("Enter")
            except Exception as e:
                logger.debug(f"[小红书] 标签 {tag} 添加失败（不影响草稿保存）: {e}")

    async def _set_cover(self, page, cover_path: str) -> None:
        try:
            btn, _ = await self._resolve_visible(page, "cover_upload")
            if btn is None:
                return
            await btn.click()
            await asyncio.sleep(2)
            inp, _ = await self._resolve_visible(page, "cover_input")
            if inp is not None:
                await inp.set_input_files(cover_path)
        except Exception as e:
            logger.warning(f"封面上传失败（不影响发布）: {e}")

    async def _await_editor_ready(self, page) -> None:
        """上传完成标志未命中时，轮询编辑器就绪（标题框可见），上限沿用原 30s。"""
        ready = await wait_until(
            lambda: self._title_visible(page),
            timeout_s=UPLOAD_FALLBACK_WAIT_TIMEOUT_S,
            interval_s=UPLOAD_FALLBACK_POLL_INTERVAL_S,
        )
        if not ready:
            logger.warning(
                f"编辑器在 {UPLOAD_FALLBACK_WAIT_TIMEOUT_S}s 内未就绪（站点结构变化或上传未完成），继续尝试填写"
            )

    async def _title_visible(self, page) -> bool:
        loc, _ = await self._resolve_visible(page, "title_input")
        return loc is not None

    async def _risk_present(self, page) -> bool:
        if not RISK_OVERLAY_SELECTOR:
            return False
        try:
            return await page.locator(RISK_OVERLAY_SELECTOR).count() > 0
        except Exception:
            return False

    @staticmethod
    def _is_login_redirect(url: str) -> bool:
        return isinstance(url, str) and "/login" in url

    # ── 认证持久化 ─────────────────────────────────────────────
    async def _save_auth_data(self):
        require_legacy_plaintext_auth()
        if not self._context or not self._page:
            return
        try:
            cookies = await self._context.cookies()
            local_storage = await self._page.evaluate("JSON.stringify(localStorage)")
            import json

            data = {
                "cookies": cookies,
                "local_storage": json.loads(local_storage) if local_storage else {},
                "captured_at": __import__("time").time(),
            }
            os.makedirs(os.path.dirname(self._auth_data_path), exist_ok=True)
            with open(self._auth_data_path, "w", encoding="utf-8") as f:
                json.dump(data, f)
            logger.info("认证数据已保存")
        except Exception as e:
            logger.warning(f"保存认证数据失败: {e}")

    async def _restore_auth_data(self) -> bool:
        require_legacy_plaintext_auth()
        import json

        if not os.path.exists(self._auth_data_path):
            if not os.path.exists(self._cookie_path):
                return False
            return await self._restore_cookies_legacy()
        try:
            with open(self._auth_data_path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("cookies"):
                await self._context.add_cookies(data["cookies"])
            if data.get("local_storage") and self._page:
                for key, value in data["local_storage"].items():
                    try:
                        await self._page.evaluate("localStorage.setItem(arguments[0], arguments[1])", key, value)
                    except Exception:
                        pass
            logger.info("认证数据已恢复")
            return True
        except Exception as e:
            logger.warning(f"恢复认证数据失败: {e}")
            return False

    async def _restore_cookies_legacy(self) -> bool:
        require_legacy_plaintext_auth()
        import json

        try:
            with open(self._cookie_path, encoding="utf-8") as f:
                cookies = json.load(f)
            await self._context.add_cookies(cookies)
            logger.info("Cookie 已恢复（旧格式）")
            return True
        except Exception as e:
            logger.warning(f"恢复 Cookie 失败: {e}")
            return False

    async def close(self):
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        self._context = None
        self._page = None
        try:
            if self._playwright_app:
                await self._playwright_app.stop()
        except Exception:
            pass
        self._playwright_app = None
        logger.info("小红书发布器已关闭")
