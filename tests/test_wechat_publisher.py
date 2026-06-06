"""
TESTS for wechat_publisher

运行：pytest test_wechat_publisher.py -v
"""

from __future__ import annotations

from pathlib import Path
import sys
import time

# 加入 src 目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from wechat_publisher import (
    Article,
    PublishResult,
    WechatError,
    WechatAuthError,
    WechatPublisher,
    publish_to_wechat,
)


# ---------------------------------------------------------------------------
# Mock helpers（不调用真实 API）
# ---------------------------------------------------------------------------

class MockClient:
    """模拟 httpx.Client，不发起真实网络请求"""

    def __init__(self, *a, **kw):
        self.base_url = ""
        self.timeout = 30
        self.headers = {}

    def get(self, url, **kw):
        return MockResponse(url)

    def post(self, url, **kw):
        return MockResponse(url, json_data=kw.get("json"))

    def close(self):
        pass


class MockResponse:
    def __init__(self, url, json_data=None):
        self._url = url
        self._json = json_data

    def json(self):
        # 模拟 token 接口
        if "token" in self._url:
            return {"access_token": "mock_token_123", "expires_in": 7200}
        # 模拟 draft.add 接口
        if "draft/add" in self._url:
            return {"media_id": "mock_media_id_456"}
        # 模拟 freepublish/submit 接口
        if "freepublish/submit" in self._url:
            return {"publish_id": "mock_publish_id_789", "msg": "success"}
        # 模拟 freepublish/get 接口
        if "freepublish/get" in self._url:
            return {
                "publish_id": "mock_publish_id_789",
                "publish_status": 0,
                "article_url": "https://mp.weixin.qq.com/s/mock",
            }
        # 模拟上传图片接口
        if "add_material" in self._url or "uploadimg" in self._url:
            return {"media_id": "mock_thumb_id", "url": "https://example.com/mock.jpg"}
        # 默认成功
        return {"errcode": 0, "errmsg": "ok"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_article_creation():
    art = Article(title="测试标题", content="<p>正文</p>", thumb_media_id="thumb_123")
    assert art.title == "测试标题"
    assert art.content == "<p>正文</p>"
    assert art.thumb_media_id == "thumb_123"
    assert art.author == ""
    assert art.digest == ""


def test_publish_result():
    r = PublishResult(success=True, publish_id="pub_123", article_url="https://...")
    assert r.success is True
    assert r.publish_id == "pub_123"

    r2 = PublishResult(success=False, errcode=40001, errmsg="invalid appid")
    assert r2.success is False
    assert r2.errcode == 40001


def test_wechat_publisher_init():
    pub = WechatPublisher(appid="test_appid", secret="test_secret")
    assert pub.appid == "test_appid"
    assert pub.secret == "test_secret"
    assert pub.timeout == 30

    pub2 = WechatPublisher(timeout=60)
    assert pub2.timeout == 60


def test_build_article_dict():
    """测试 _build_article_dict 输出符合微信 API 格式"""
    pub = WechatPublisher(appid="test", secret="test")
    art = Article(
        title="测试",
        content="<p>内容</p>",
        thumb_media_id="thumb_1",
        author="作者A",
        digest="摘要",
        content_source_url="https://example.com",
    )
    d = pub._build_article_dict(art)
    assert d["title"] == "测试"
    assert d["author"] == "作者A"
    assert d["thumb_media_id"] == "thumb_1"
    assert d["content"] == "<p>内容</p>"
    assert d["digest"] == "摘要"
    assert d["content_source_url"] == "https://example.com"


def test_call_api_error_handling():
    """测试 API 错误码抛出异常"""
    import types

    pub = WechatPublisher(appid="test", secret="test")
    pub._client = MockClient()

    # 模拟 token 获取失败（AppID 错误）
    original_get = pub._get_access_token

    # 强制注入一个错误的 token 响应
    class BadMockClient(MockClient):
        def get(self, url, **kw):
            if "token" in url:
                return types.SimpleNamespace(
                    json=lambda: {"errcode": 40001, "errmsg": "invalid appid"}
                )
            return super().get(url, **kw)

    pub._client = BadMockClient()
    try:
        pub._get_access_token()
        assert False, "应该抛出 WechatAuthError"
    except Exception as e:
        assert "40001" in str(e) or "invalid" in str(e).lower()


def test_publish_flow_mock(monkeypatch):
    """完整发布流程（mock 网络请求）"""
    pub = WechatPublisher(appid="test", secret="test")
    pub._client = MockClient()
    pub.TOKEN_CACHE["test"] = ("mock_token", time.time() + 7000)

    art = Article(
        title="Mock 标题",
        content="<p>Mock 正文</p>",
        thumb_media_id="mock_thumb",
    )

    # monkeypatch _get_access_token
    monkeypatch.setattr(pub, "_get_access_token", lambda: "mock_token")

    result = pub.publish(art, wait_publish=False)
    assert result.success is True
    assert result.publish_id == "mock_publish_id_789"


def test_upload_image_not_found():
    pub = WechatPublisher()
    try:
        pub.upload_image("/nonexistent/path.jpg")
        assert False, "应该抛出 FileNotFoundError"
    except FileNotFoundError:
        pass


def test_get_publish_status_mock(monkeypatch):
    pub = WechatPublisher(appid="test", secret="test")
    pub._client = MockClient()
    monkeypatch.setattr(pub, "_get_access_token", lambda: "mock_token")

    status = pub.get_publish_status("mock_publish_id_789")
    assert status["publish_status"] == 0
    assert "article_url" in status


# ---------------------------------------------------------------------------
# Integration example（PROJECT-001 调用示例）
# ---------------------------------------------------------------------------

def example_project_001_integration():
    """PROJECT-001（热文采集改写）集成示例

    流程：采集 RSS → AI 改写 → 发布微信公众号
    """
    # 假设这些变量已从 PROJECT-001 获取
    title = "AI 改写后的热文标题"
    content_html = "<h1>正文标题</h1><p>这是 AI 改写后的正文...</p>"
    cover_image = "/path/to/cover.jpg"  # 本地封面图路径

    # 方式一：使用 convenience function（最简单）
    from wechat_publisher import publish_to_wechat

    result = publish_to_wechat(
        title=title,
        content_html=content_html,
        cover_image_path=cover_image,
        appid="your_appid",
        secret="your_secret",
        author="QClaw",
        digest="本文由 AI 自动改写生成",
        source_url="https://example.com/original",
    )

    if result.success:
        print(f"✅ 发布成功！publish_id={result.publish_id}")
        print(f"文章 URL（需调用 get_publish_status 获取）：{result.article_url}")
    else:
        print(f"❌ 发布失败：[{result.errcode}] {result.errmsg}")

    # 方式二：使用 WechatPublisher 类（更多控制）
    from wechat_publisher import WechatPublisher, Article

    publisher = WechatPublisher(appid="your_appid", secret="your_secret")

    # 1. 上传封面图
    thumb_media_id = publisher.upload_image(cover_image)

    # 2. 构建 Article
    article = Article(
        title=title,
        content=content_html,
        thumb_media_id=thumb_media_id,
        author="QClaw",
        digest="AI 自动改写",
    )

    # 3. 发布（不等待完成）
    result = publisher.publish(article, wait_publish=False)
    print(f"publish_id: {result.publish_id}")

    # 4. 轮询发布状态
    import time

    while True:
        status = publisher.get_publish_status(result.publish_id)
        if status.get("publish_status") == 0:
            print(f"✅ 发布完成！URL: {status['article_url']}")
            break
        time.sleep(3)


if __name__ == "__main__":
    # 运行简单测试
    test_article_creation()
    test_publish_result()
    test_wechat_publisher_init()
    test_build_article_dict()
    print("✅ 基础测试通过（未测试网络请求）")
    print("\n--- 集成示例（需真实 AppID/Secret）---")
    print("参见 example_project_001_integration() 函数")
