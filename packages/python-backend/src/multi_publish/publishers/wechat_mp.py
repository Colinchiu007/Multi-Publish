"""
微信公众号发布器

使用微信官方 API 发布文章到公众号。

前提条件：
1. 企业认证公众号（个人号无法使用 API）
2. 已获取 AppID 和 AppSecret
3. 已配置 IP 白名单

API 文档：https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html

发布模式：
- draft: 仅保存为草稿（所有公众号都支持）
- publish: 正式发布到公众号（需要企业认证公众号）
"""

import time
from dataclasses import dataclass
from typing import Any

import httpx
from loguru import logger

from multi_publish.models import PlatformType, PublishResult
from multi_publish.publishers.base import BasePublisher, PublisherConfig


@dataclass
class WeChatPublisherConfig(PublisherConfig):
    """微信公众号发布器配置"""
    app_id: str = ""
    app_secret: str = ""
    ip_white_list: list[str] | None = None  # 可选，API 需要


@dataclass
class WeChatArticle:
    """公众号文章"""
    title: str
    author: str = ""
    digest: str = ""  # 摘要
    content: str = ""
    content_source_url: str = ""  # 原文链接
    cover_url: str = ""  # 封面图 URL
    content_style: dict[str, Any] | None = None  # 自定义样式


class WeChatPublisher(BasePublisher):
    """
    微信公众号发布器

    使用微信官方 API 发布文章。
    流程：获取 access_token → 上传素材（图片）→ 新建草稿 → 发布
    """

    def __init__(self, config: WeChatPublisherConfig):
        self.config = config
        self._access_token: str = ""
        self._token_expires_at: float = 0
        self._http: httpx.AsyncClient | None = None

    @property
    def platform(self) -> PlatformType:
        return PlatformType.WECHAT_MP

    async def initialize(self):
        """初始化 HTTP 客户端"""
        self._http = httpx.AsyncClient(timeout=30.0)
        logger.info(f"微信公众号发布器初始化完成: {self.config.app_id}")

    async def _get_access_token(self) -> str:
        """
        获取 access_token

        缓存机制：token 有效期 7200 秒，提前 300 秒刷新
        """
        now = time.time()
        if self._access_token and now < self._token_expires_at:
            return self._access_token

        # 检查配置
        if not self.config.app_id or not self.config.app_secret:
            raise ValueError("微信公众号 AppID 或 AppSecret 未配置")

        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": self.config.app_id,
            "secret": self.config.app_secret,
        }

        response = await self._http.get(url, params=params)
        data = response.json()

        if "access_token" not in data:
            error_msg = data.get("errmsg", "未知错误")
            raise RuntimeError(f"获取 access_token 失败: {error_msg}")

        self._access_token = data["access_token"]
        expires_in = data.get("expires_in", 7200)
        self._token_expires_at = now + expires_in - 300  # 提前 5 分钟刷新

        logger.info(f"access_token 获取成功，有效期 {expires_in} 秒")
        return self._access_token

    async def _upload_image(self, image_path: str) -> str:
        """
        上传封面图到微信素材库

        Args:
            image_path: 本地图片路径

        Returns:
            素材 ID（media_id）
        """
        import os

        token = await self._get_access_token()
        url = f"https://api.weixin.qq.com/cgi-bin/media/upload?access_token={token}&type=image"

        file_size = os.path.getsize(image_path)
        if file_size > 2 * 1024 * 1024:  # 2MB 限制
            raise ValueError("封面图大小不能超过 2MB")

        with open(image_path, "rb") as f:
            files = {"media": (os.path.basename(image_path), f, "image/jpeg")}
            response = await self._http.post(url, files=files)

        data = response.json()
        if "media_id" not in data:
            error_msg = data.get("errmsg", "未知错误")
            raise RuntimeError(f"上传图片失败: {error_msg}")

        return data["media_id"]

    async def _create_draft(self, article: WeChatArticle) -> str:
        """
        新建草稿

        Args:
            article: 文章对象

        Returns:
            草稿 ID（media_id）
        """
        token = await self._get_access_token()

        # 构建文章数据
        articles_data = {
            "articles": [
                {
                    "title": article.title,
                    "author": article.author,
                    "digest": article.digest or article.title[:120],
                    "content": article.content,
                    "content_source_url": article.content_source_url,
                    "cover": article.cover_url,
                    "show_cover_pic": 1 if article.cover_url else 0,
                }
            ]
        }

        url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
        response = await self._http.post(url, json=articles_data)
        data = response.json()

        if "media_id" not in data:
            error_msg = data.get("errmsg", "未知错误")
            raise RuntimeError(f"新建草稿失败: {error_msg}")

        return data["media_id"]

    async def _publish_draft(self, media_id: str, index: int = 0) -> dict:
        """
        发布草稿到公众号（正式发布）

        使用 cgi-bin/publish 接口，将草稿发布到公众号。
        注意：此接口需要企业认证公众号才有权限。

        Args:
            media_id: 草稿 ID
            index: 发布位置（通常 0）

        Returns:
            发布结果（包含 article_url）
        """
        token = await self._get_access_token()

        # 使用 publish 接口正式发布
        publish_data = {
            "media_id": media_id,
            "index": index,
        }

        url = f"https://api.weixin.qq.com/cgi-bin/publish?access_token={token}"
        response = await self._http.post(url, json=publish_data)
        data = response.json()

        if "errmsg" in data and data["errmsg"] != "ok":
            error_msg = data.get("errmsg", "未知错误")
            # 检查是否是权限问题
            if "invalid permission" in error_msg or "permission" in error_msg:
                raise RuntimeError(
                    f"发布失败：权限不足。需要企业认证公众号才有 publish 接口权限。"
                    f"错误: {error_msg}"
                )
            raise RuntimeError(f"发布草稿失败: {error_msg}")

        # 发布成功，返回文章 URL
        if "article_url" in data:
            logger.info(f"文章发布成功: {data['article_url']}")
            return {
                "success": True,
                "article_url": data["article_url"],
                "cover_url": data.get("cover_url", ""),
            }

        return {"success": True, "message": "发布成功"}

    async def publish(
        self,
        title: str,
        content: str,
        cover_image: str | None = None,
        author: str = "",
        digest: str = "",
        draft: bool = False,
        **kwargs,
    ) -> PublishResult:
        """
        发布公众号文章

        Args:
            title: 文章标题
            content: 文章内容（HTML 格式，微信 API 需要 HTML）
            cover_image: 封面图本地路径
            author: 作者名
            digest: 摘要
            draft: 是否仅保存为草稿（不发布）
                - True: 仅保存为草稿（所有公众号支持）
                - False: 正式发布（需要企业认证公众号）
            **kwargs: 其他参数

        Returns:
            PublishResult
        """
        start_time = time.time()

        try:
            # 1. 上传封面图（如果有）
            cover_media_id = None
            if cover_image:
                cover_media_id = await self._upload_image(cover_image)
                logger.info(f"封面图上传成功: {cover_media_id}")

            # 2. 创建草稿
            article = WeChatArticle(
                title=title,
                author=author,
                digest=digest,
                content=content,
                cover_url=cover_media_id or "",
            )
            draft_id = await self._create_draft(article)
            logger.info(f"草稿创建成功: {draft_id}")

            if draft:
                # 草稿模式：仅保存，不发布
                duration = time.time() - start_time
                return PublishResult(
                    success=True,
                    platform=self.platform.value,
                    article_id=draft_id,
                    url=None,
                    duration=duration,
                )

            # 3. 正式发布
            try:
                publish_result = await self._publish_draft(draft_id)
                duration = time.time() - start_time
                return PublishResult(
                    success=True,
                    platform=self.platform.value,
                    article_id=draft_id,
                    url=publish_result.get("article_url"),
                    duration=duration,
                )
            except RuntimeError as e:
                # 正式发布失败，返回草稿信息
                duration = time.time() - start_time
                return PublishResult(
                    success=True,
                    platform=self.platform.value,
                    article_id=draft_id,
                    url=None,
                    error=str(e),
                    duration=duration,
                )

        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"微信公众号发布失败: {e}")
            return PublishResult(
                success=False,
                platform=self.platform.value,
                error=str(e),
                duration=duration,
            )

    async def validate(self) -> dict:
        """验证账号配置（测试 access_token）"""
        try:
            token = await self._get_access_token()
            return {
                "valid": True,
                "message": "认证成功",
                "token_preview": token[:20] + "...",
            }
        except Exception as e:
            return {
                "valid": False,
                "message": str(e),
            }

    async def check_auth(self) -> bool:
        """检查微信 API 认证状态"""
        try:
            token = await self._get_access_token()
            return bool(token)
        except Exception as e:
            logger.warning(f"微信公众号认证检查失败: {e}")
            return False

    async def close(self):
        """关闭 HTTP 客户端"""
        if self._http:
            await self._http.aclose()
            self._http = None
        self._access_token = ""
        logger.info("微信公众号发布器已关闭")
