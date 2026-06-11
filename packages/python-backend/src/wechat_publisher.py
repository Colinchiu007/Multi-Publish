"""
WechatPublisher - 微信公众号独立发布模块

供 PROJECT-001（热文采集改写）、PROJECT-002（MoneyPrinterTurbo SaaS）、
PROJECT-003（多平台一键发布）共用。

环境变量：
  WECHAT_APPID     - 微信公众号 AppID
  WECHAT_APPSECRET - 微信公众号 AppSecret
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wechat_publisher")

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class WechatError(Exception):
    """微信 API 通用异常"""

    def __init__(self, errcode: int, errmsg: str) -> None:
        self.errcode = errcode
        self.errmsg = errmsg
        super().__init__(f"[{errcode}] {errmsg}")


class WechatAuthError(WechatError):
    """认证失败（AppID/AppSecret 错误）"""


class WechatPublishError(WechatError):
    """发布失败"""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@dataclass
class Article:
    """微信公众号图文素材"""

    title: str
    content: str          # HTML 正文
    thumb_media_id: str   # 封面图 media_id（先上传获取）
    author: str = ""
    digest: str = ""      # 摘要（为空则取正文前 54 字）
    content_source_url: str = ""   # 原文链接
    need_open_comment: int = 0   # 是否打开评论（0/1）
    only_fans_can_comment: int = 0


@dataclass
class PublishResult:
    """发布结果"""

    success: bool
    publish_id: Optional[str] = None   # 发布任务 ID
    article_url: Optional[str] = None   # 文章 URL（需通过 get_publish_status 获取）
    errcode: Optional[int] = None
    errmsg: Optional[str] = None


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

class WechatPublisher:
    """微信公众号发布客户端

    Usage::
        publisher = WechatPublisher(appid="xxx", secret="xxx")
        article = Article(
            title="标题",
            content="<p>正文</p>",
            thumb_media_id="MEDIA_ID",
        )
        result = publisher.publish(article)
        print(result.publish_id)
    """

    BASE_URL = "https://api.weixin.qq.com"
    TOKEN_CACHE: dict[str, tuple[str, float]] = {}   # appid -> (token, expires_at)

    def __init__(
        self,
        appid: Optional[str] = None,
        secret: Optional[str] = None,
        timeout: int = 30,
    ) -> None:
        self.appid = appid or ""
        self.secret = secret or ""
        self.timeout = timeout
        self._client = httpx.Client(
            base_url=self.BASE_URL,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    # -- public API ----------------------------------------------------------

    def publish(self, article: Article, wait_publish: bool = False) -> PublishResult:
        """完整发布流程：创建草稿 → 发布 → （可选）等待发布完成

        Args:
            article: Article 对象
            wait_publish: 是否等待发布完成（最长等待 60 秒）

        Returns:
            PublishResult
        """
        # 1. 创建草稿
        draft_result = self.add_draft(article)
        if not draft_result.get("media_id"):
            return PublishResult(
                success=False,
                errcode=-1,
                errmsg="创建草稿失败：未返回 media_id",
            )

        media_id = draft_result["media_id"]

        # 2. 发布（免费发布接口）
        publish_result = self._call_api(
            "POST",
            "/cgi-bin/freepublish/submit",
            json={"media_id": media_id},
        )

        if "publish_id" not in publish_result:
            return PublishResult(
                success=False,
                errcode=publish_result.get("errcode", -1),
                errmsg=publish_result.get("errmsg", "发布失败"),
            )

        publish_id = str(publish_result["publish_id"])

        # 3. 等待发布完成（可选）
        article_url = None
        if wait_publish:
            article_url = self._wait_publish(publish_id)

        return PublishResult(
            success=True,
            publish_id=publish_id,
            article_url=article_url,
        )

    def add_draft(self, article: Article) -> dict:
        """添加草稿（draft.add）

        Returns:
            {"media_id": "xxx"}
        """
        articles = [self._build_article_dict(article)]
        payload = {"articles": articles}

        result = self._call_api("POST", "/cgi-bin/draft/add", json=payload)
        return result

    def upload_image(self, image_path: str | Path) -> str:
        """上传图片，获取 thumb_media_id（用于封面图）

        Args:
            image_path: 本地图片路径（推荐 900x500 像素，JPG/PNG）

        Returns:
            media_id（封面图 ID）
        """
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"图片文件不存在：{image_path}")

        url = f"{self.BASE_URL}/cgi-bin/material/add_material?access_token={self._get_access_token()}&type=image"

        with open(path, "rb") as f:
            files = {"media": (path.name, f, "image/jpeg")}
            resp = httpx.post(url, files=files, timeout=self.timeout)

        data = resp.json()
        if data.get("errcode", 0) != 0:
            raise WechatPublishError(data["errcode"], data["errmsg"])

        # 返回 media_id（封面图用）或 url（正文图用）
        return data.get("media_id") or data.get("url")

    def upload_image_for_content(self, image_path: str | Path) -> str:
        """上传图片到正文素材（返回 URL，用于插入 HTML 正文）

        Returns:
            图片 URL（可在 <img src="..."> 中使用）
        """
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"图片文件不存在：{image_path}")

        url = f"{self.BASE_URL}/cgi-bin/media/uploadimg?access_token={self._get_access_token()}"

        with open(path, "rb") as f:
            files = {"media": (path.name, f, "image/jpeg")}
            resp = httpx.post(url, files=files, timeout=self.timeout)

        data = resp.json()
        if data.get("errcode", 0) != 0:
            raise WechatPublishError(data["errcode"], data["errmsg"])

        return data["url"]

    def get_publish_status(self, publish_id: str) -> dict:
        """获取发布状态

        Returns:
            {
                "publish_id": "xxx",
                "publish_status": 0,  # 0=发布成功，others=失败
                "article_url": "xxx",   # 文章 URL（发布成功后有值）
                "fail_idx": []
            }
        """
        payload = {"publish_id": publish_id}
        result = self._call_api("POST", "/cgi-bin/freepublish/get", json=payload)
        return result

    # -- private ------------------------------------------------------------

    def _get_access_token(self) -> str:
        """获取 access_token（带内存缓存，自动刷新）"""
        now = time.time()
        cached = self.TOKEN_CACHE.get(self.appid)

        if cached:
            token, expires_at = cached
            if now < expires_at - 60:   # 提前 60 秒刷新
                return token

        url = f"/cgi-bin/token?grant_type=client_credential&appid={self.appid}&secret={self.secret}"
        resp = self._client.get(url)
        data = resp.json()

        if "errcode" in data and data["errcode"] != 0:
            if data["errcode"] in (40001, 40002, 40003):
                raise WechatAuthError(data["errcode"], data["errmsg"])
            raise WechatError(data["errcode"], data["errmsg"])

        token = data["access_token"]
        expires_in = data.get("expires_in", 7200)
        expires_at = now + expires_in

        self.TOKEN_CACHE[self.appid] = (token, expires_at)
        logger.info(f"access_token 已刷新，过期时间：{time.ctime(expires_at)}")
        return token

    def _call_api(self, method: str, path: str, **kwargs) -> dict:
        """统一 API 调用（自动附加 access_token）"""
        token = self._get_access_token()
        url = f"{path}?access_token={token}" if "?" not in path else f"{path}&access_token={token}"

        if method.upper() == "GET":
            resp = self._client.get(url, **kwargs)
        else:
            resp = self._client.post(url, **kwargs)

        data = resp.json()

        if "errcode" in data and data["errcode"] != 0:
            # 常见错误码处理
            if data["errcode"] == 40001:
                # access_token 无效，清除缓存重试一次
                if self.appid in self.TOKEN_CACHE:
                    del self.TOKEN_CACHE[self.appid]
                logger.warning("access_token 无效，已清除缓存，重试...")
                return self._call_api(method, path, **kwargs)

            raise WechatError(data["errcode"], data["errmsg"])

        return data

    def _build_article_dict(self, article: Article) -> dict:
        """构建微信 API 所需的 articles 字段"""
        return {
            "title": article.title,
            "author": article.author,
            "digest": article.digest,
            "content": article.content,
            "content_source_url": article.content_source_url,
            "thumb_media_id": article.thumb_media_id,
            "need_open_comment": article.need_open_comment,
            "only_fans_can_comment": article.only_fans_can_comment,
        }

    def _wait_publish(self, publish_id: str, timeout: int = 60) -> Optional[str]:
        """等待发布完成，返回 article_url"""
        start = time.time()
        while time.time() - start < timeout:
            status = self.get_publish_status(publish_id)
            if status.get("publish_status") == 0:   # 发布成功
                return status.get("article_url")
            time.sleep(3)
        return None

    def __del__(self) -> None:
        self._client.close()


# ---------------------------------------------------------------------------
# Convenience functions（供 PROJECT-001 快速调用）
# ---------------------------------------------------------------------------

def publish_to_wechat(
    title: str,
    content_html: str,
    cover_image_path: str | Path,
    appid: Optional[str] = None,
    secret: Optional[str] = None,
    author: str = "",
    digest: str = "",
    source_url: str = "",
) -> PublishResult:
    """一键发布到微信公众号（ convenience function）

    Usage::
        from wechat_publisher import publish_to_wechat

        result = publish_to_wechat(
            title="热文标题",
            content_html="<p>正文...</p>",
            cover_image_path="./cover.jpg",
            appid="xxx",
            secret="xxx",
        )
        print(result.publish_id)
    """
    publisher = WechatPublisher(appid=appid, secret=secret)

    # 1. 上传封面图
    thumb_media_id = publisher.upload_image(cover_image_path)

    # 2. 构建 Article
    article = Article(
        title=title,
        content=content_html,
        thumb_media_id=thumb_media_id,
        author=author,
        digest=digest,
        content_source_url=source_url,
    )

    # 3. 发布
    return publisher.publish(article, wait_publish=False)
