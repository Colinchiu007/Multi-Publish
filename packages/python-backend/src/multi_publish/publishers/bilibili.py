"""B站发布器（RPA 模式）

使用 Playwright 自动化浏览器发布视频到 B站创作中心。
实现参照 douyin.py 的 _do_publish_legacy RPA 流程。
"""

from __future__ import annotations

import asyncio
import os

from loguru import logger

from multi_publish.models import PlatformType, PublishPhase, PublishResult
from multi_publish.publishers.base import BasePublisher, PublisherConfig

DEFAULT_SELECTORS = {
    "login_qrcode": '[class*="qrcode"]',
    "login_success_indicator": '[class*="member-center"]',
    "upload_page_url": "https://member.bilibili.com/platform/upload/video",
    "upload_input": 'input[type="file"]',
    "title_input": '[class*="title"] input, [placeholder*="标题"]',
    "description_textarea": '[class*="description"] textarea, [placeholder*="简介"]',
    "publish_button": 'button:has-text("发布"), button:has-text("投稿")',
    "tag_input": '[class*="tag"] input, [placeholder*="标签"]',
    "cover_upload": '[class*="cover"]',
    "cover_input": 'input[type="file"]',
    "upload_progress": '[class*="progress"]',
    "upload_complete": '[class*="upload-success"]',
    "draft_button": 'button:has-text("草稿")',
}

CREATOR_URL = "https://member.bilibili.com/platform/upload/video"


class BilibiliPublisher(BasePublisher):
    """B站视频发布器（RPA 模式）"""

    def __init__(self, config: PublisherConfig, account_id: str | None = None):
        super().__init__(config, account_id=account_id)
        self._browser = None
        self._context = None
        self._page = None
        self._playwright = None
        self.selectors = dict(DEFAULT_SELECTORS)
        self.creator_url = CREATOR_URL
        self._login_timeout = 120
        self._publish_timeout = 300
        self._upload_wait_timeout = 600
        self._auth_data_path = os.path.join(config.data_dir, f"auth_{self.platform.value}.json")
        self._cookie_path = os.path.join(config.data_dir, f"cookies_{self.platform.value}.json")

    @property
    def platform(self) -> PlatformType:
        return PlatformType.BILIBILI

    async def initialize(self):
        pass

    async def _ensure_browser(self):
        if self._page:
            return
        from playwright.async_api import async_playwright
        self._playwright_app = await async_playwright().start()
        self._context = await self._playwright_app.chromium.launch_persistent_context(
            user_data_dir=os.path.join(self.config.data_dir, "browser_data"),
            headless=self.config.headless,
            viewport={"width": 1280, "height": 800},
        )
        self._page = await self._context.new_page()
        await self._restore_auth_data()

    async def login(self) -> bool:
        """打开浏览器等待用户扫码登录"""
        await self._ensure_browser()
        logger.info("B站：请扫码登录")
        await self._page.goto(self.creator_url, wait_until="domcontentloaded")
        for _ in range(self._login_timeout):
            await asyncio.sleep(1)
            if "member.bilibili.com" in self._page.url:
                logger.success("B站登录成功")
                await self._save_auth_data()
                return True
        logger.warning("B站登录超时")
        return False

    async def check_auth(self) -> bool:
        try:
            await self._ensure_browser()
            if not self._page:
                return False
            await self._page.goto(self.creator_url, wait_until="domcontentloaded")
            await asyncio.sleep(2)
            if "/login" in self._page.url or "passport" in self._page.url:
                return False
            return True
        except Exception:
            return False

    async def publish(self, title: str, content: str = "", media_paths=None, cover_path=None, tags=None, draft=False, **kwargs) -> PublishResult:
        """发布视频到 B站"""
        logger.info(f"[B站] 开始发布: {title}")
        if not title:
            return PublishResult(success=False, platform="bilibili", error="标题不能为空")
        await self._report_progress(PublishPhase.PREPARING, "准备发布...", 5)
        try:
            return await self._do_publish_rpa(
                title=title, content=content,
                media_paths=media_paths or [],
                cover_path=cover_path, tags=tags or [], draft=draft,
            )
        except Exception as e:
            logger.error(f"[B站] 发布失败: {e}")
            return PublishResult(success=False, platform="bilibili", error=f"发布失败: {e}")

    async def _do_publish_rpa(self, title, content, media_paths, cover_path, tags, draft):
        """RPA 发布核心流程"""
        await self._report_progress(PublishPhase.AUTHENTICATING, "启动浏览器...", 10)
        from playwright.async_api import async_playwright
        self._playwright_app = await async_playwright().start()
        self._context = await self._playwright_app.chromium.launch_persistent_context(
            user_data_dir=os.path.join(self.config.data_dir, "browser_data"),
            headless=self.config.headless,
            viewport={"width": 1280, "height": 800},
        )
        self._page = await self._context.new_page()

        await self._report_progress(PublishPhase.AUTHENTICATING, "恢复登录态...", 15)
        auth_ok = await self._restore_auth_data()
        if not auth_ok:
            return PublishResult(success=False, platform="bilibili", error="认证数据不存在或已过期，请先登录")

        await self._report_progress(PublishPhase.PREPARING, "导航到上传页...", 20)
        await self._page.goto(self.selectors["upload_page_url"], wait_until="domcontentloaded")
        await asyncio.sleep(3)

        if "/login" in self._page.url or "passport" in self._page.url:
            return PublishResult(success=False, platform="bilibili", error="认证已过期，请重新登录")

        await self._report_progress(PublishPhase.UPLOADING, "上传视频...", 30)
        try:
            file_input = self._page.locator(self.selectors["upload_input"]).first
            if media_paths:
                await file_input.set_input_files(media_paths)
        except Exception as e:
            return PublishResult(success=False, platform="bilibili", error=f"视频上传失败: {e}")

        await self._report_progress(PublishPhase.UPLOADING, "等待上传完成...", 50)
        try:
            await self._page.wait_for_selector(self.selectors["upload_complete"], timeout=self._upload_wait_timeout * 1000)
        except Exception:
            logger.warning("未检测到上传完成标志，等待 30 秒...")
            await asyncio.sleep(30)

        await self._report_progress(PublishPhase.PUBLISHING, "填写标题...", 70)
        try:
            await self._page.locator(self.selectors["title_input"]).first.fill(title)
        except Exception as e:
            return PublishResult(success=False, platform="bilibili", error=f"填写标题失败: {e}")

        if cover_path and os.path.exists(cover_path):
            try:
                await self._page.locator(self.selectors["cover_upload"]).first.click()
                await asyncio.sleep(2)
                await self._page.locator(self.selectors["cover_input"]).first.set_input_files(cover_path)
                logger.info("封面图已上传")
            except Exception as e:
                logger.warning(f"封面上传失败（不影响发布）: {e}")

        if tags:
            try:
                tag_input = self._page.locator(self.selectors["tag_input"]).first
                for tag in tags[:5]:
                    await tag_input.fill(tag)
                    await asyncio.sleep(0.5)
            except Exception as e:
                logger.warning(f"标签添加失败（不影响发布）: {e}")

        if content:
            try:
                desc = self._page.locator(self.selectors["description_textarea"]).first
                if await desc.count() > 0:
                    await desc.fill(content)
            except Exception as e:
                logger.warning(f"简介填写失败（不影响发布）: {e}")

        await self._report_progress(PublishPhase.PUBLISHING, "点击发布...", 90)
        if draft:
            draft_btn = self._page.locator(self.selectors["draft_button"])
            if await draft_btn.count() > 0:
                await draft_btn.first.click()
            else:
                await self._page.locator(self.selectors["publish_button"]).first.click()
        else:
            await self._page.locator(self.selectors["publish_button"]).first.click(timeout=10000)

        await asyncio.sleep(5)
        await self._report_progress(PublishPhase.DONE, "发布完成", 100)
        logger.info(f"[B站] RPA 发布完成: {title}")
        return PublishResult(success=True, platform="bilibili", url="https://www.bilibili.com/")

    async def _save_auth_data(self):
        if not self._context or not self._page:
            return
        try:
            cookies = await self._context.cookies()
            ls = await self._page.evaluate("JSON.stringify(localStorage)")
            import json
            data = {"cookies": cookies, "local_storage": json.loads(ls) if ls else {}, "captured_at": __import__("time").time()}
            os.makedirs(os.path.dirname(self._auth_data_path), exist_ok=True)
            with open(self._auth_data_path, "w", encoding="utf-8") as f:
                json.dump(data, f)
            logger.info("认证数据已保存")
        except Exception as e:
            logger.warning(f"保存认证数据失败: {e}")

    async def _restore_auth_data(self) -> bool:
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
                for k, v in data["local_storage"].items():
                    try:
                        await self._page.evaluate("localStorage.setItem(arguments[0], arguments[1])", k, v)
                    except Exception:
                        pass
            logger.info("认证数据已恢复")
            return True
        except Exception as e:
            logger.warning(f"恢复认证数据失败: {e}")
            return False

    async def _restore_cookies_legacy(self) -> bool:
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
        logger.info("B站发布器已关闭")
