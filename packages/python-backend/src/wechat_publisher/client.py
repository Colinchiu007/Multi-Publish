"""
WeChat Official Account Publisher Client

Core client for interacting with WeChat Official Account API.
"""

import logging
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx

from .exceptions import (
    WeChatAPIError,
    WeChatAuthError,
    WeChatConfigError,
    WeChatDraftError,
    WeChatError,
    WeChatNetworkError,
    WeChatPublishError,
    WeChatRateLimitError,
    WeChatUploadError,
    raise_for_error_code,
)
from .models import Article, Draft, PublishResult, PublishStatus
from .utils import (
    is_valid_image_file,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# WeChat API Base URL
WECHAT_API_BASE = "https://api.weixin.qq.com"


class WechatPublisher:
    """
    WeChat Official Account Publisher Client.

    Handles authentication, media upload, draft creation, and article publishing.
    """

    def __init__(
        self,
        appid: str | None = None,
        secret: str | None = None,
        access_token: str | None = None,
        auto_refresh_token: bool = True,
        max_retries: int = 3,
        timeout: int = 30,
    ):
        """
        Initialize WeChat Publisher.

        Args:
            appid: WeChat Official Account AppID (or set WECHAT_APPID env var)
            secret: WeChat Official Account AppSecret (or set WECHAT_APPSECRET env var)
            access_token: Existing access token (will auto-refresh if expired)
            auto_refresh_token: Whether to auto-refresh expired tokens
            max_retries: Maximum retry attempts for failed requests
            timeout: HTTP request timeout in seconds
        """
        # Load credentials
        self.appid = appid or self._get_env("WECHAT_APPID")
        self.secret = secret or self._get_env("WECHAT_APPSECRET")

        if not self.appid or not self.secret:
            raise WeChatConfigError(
                "WECHAT_APPID and WECHAT_APPSECRET must be provided or set as environment variables"
            )

        # HTTP client
        self._client = httpx.Client(timeout=timeout)
        self.max_retries = max_retries
        self.timeout = timeout

        # Token management
        self._access_token: str | None = access_token
        self._token_expires_at: datetime | None = None
        self.auto_refresh_token = auto_refresh_token

        # API base URL
        self.api_base = WECHAT_API_BASE

        logger.info(f"WechatPublisher initialized for appid: {self.appid[:8]}...")

    def _get_env(self, key: str) -> str | None:
        """Get environment variable."""
        import os

        return os.getenv(key)

    @property
    def access_token(self) -> str:
        """
        Get valid access token, refreshing if needed.

        Returns:
            Valid access token

        Raises:
            WeChatAuthError: If unable to get access token
        """
        if self._is_token_valid():
            return self._access_token  # type: ignore

        if not self.auto_refresh_token:
            raise WeChatAuthError("Access token expired and auto_refresh_token is disabled")

        logger.info("Access token expired, refreshing...")
        self._refresh_access_token()
        return self._access_token  # type: ignore

    def _is_token_valid(self) -> bool:
        """Check if current access token is valid."""
        if not self._access_token or not self._token_expires_at:
            return False

        # Add 5-minute buffer before expiration
        buffer_time = timedelta(minutes=5)
        return datetime.now() < (self._token_expires_at - buffer_time)

    def _refresh_access_token(self) -> None:
        """Refresh access token."""
        url = f"{self.api_base}/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": self.appid,
            "secret": self.secret,
        }

        try:
            response = self._client.get(url, params=params)
            response.raise_for_status()
            data = response.json()

            # Check for error
            if "errcode" in data and data["errcode"] != 0:
                raise_for_error_code(data["errcode"], data.get("errmsg", ""))

            self._access_token = data["access_token"]
            # Token valid for 7200 seconds (2 hours), we'll set 1.5 hours
            self._token_expires_at = datetime.now() + timedelta(seconds=5400)

            logger.info("Access token refreshed successfully")

        except httpx.HTTPError as e:
            raise WeChatNetworkError(f"Failed to refresh access token: {e}") from e
        except WeChatAuthError:
            raise
        except Exception as e:
            raise WeChatAuthError(f"Unexpected error refreshing token: {e}") from e

    def _make_request(
        self,
        method: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        data: Any | None = None,
        files: dict[str, Any] | None = None,
        json_data: dict[str, Any] | None = None,
        retry_count: int = 0,
    ) -> dict[str, Any]:
        """
        Make authenticated request to WeChat API with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., /cgi-bin/draft/add)
            params: Query parameters
            data: Request body (for form data)
            files: Files to upload
            json_data: JSON request body
            retry_count: Current retry attempt

        Returns:
            Response data as dictionary

        Raises:
            WeChatAPIError: For API errors
            WeChatNetworkError: For network errors
            WeChatRateLimitError: For rate limiting
        """
        # Ensure access token is valid
        if params is None:
            params = {}
        params["access_token"] = self.access_token

        url = f"{self.api_base}{endpoint}"

        try:
            if method.upper() == "GET":
                response = self._client.get(url, params=params)
            elif method.upper() == "POST":
                if files:
                    # Multipart form upload
                    response = self._client.post(url, params=params, data=data, files=files)
                elif json_data:
                    response = self._client.post(url, params=params, json=json_data)
                else:
                    response = self._client.post(url, params=params, data=data)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            response.raise_for_status()
            result = response.json()

            # Check for WeChat API error
            if "errcode" in result and result["errcode"] != 0:
                error_code = result["errcode"]
                error_msg = result.get("errmsg", "")

                # Handle token expiration
                if error_code in [40001, 42001, 42003]:
                    if self.auto_refresh_token and retry_count < self.max_retries:
                        logger.warning(f"Token error detected, refreshing... (retry {retry_count + 1})")
                        self._refresh_access_token()
                        return self._make_request(method, endpoint, params, data, files, json_data, retry_count + 1)

                # Handle rate limiting
                if error_code == 45009:
                    if retry_count < self.max_retries:
                        retry_after = 5 * (retry_count + 1)  # Exponential backoff
                        logger.warning(f"Rate limited, retrying after {retry_after}s...")
                        time.sleep(retry_after)
                        return self._make_request(method, endpoint, params, data, files, json_data, retry_count + 1)
                    else:
                        raise WeChatRateLimitError(
                            f"Rate limit exceeded after {self.max_retries} retries",
                            error_code=error_code,
                            error_info=result,
                        )

                # Handle upload errors with retry
                if error_code in [41005, 41006, 45006] and retry_count < self.max_retries:
                    logger.warning(f"Upload error, retrying... (retry {retry_count + 1})")
                    time.sleep(2 * (retry_count + 1))
                return self._make_request(method, endpoint, params, data, files, json_data, retry_count + 1)

                # Raise appropriate error
                raise_for_error_code(error_code, error_msg)

            return result

        except httpx.HTTPStatusError as e:
            if retry_count < self.max_retries:
                logger.warning(f"HTTP error {e.response.status_code}, retrying...")
                time.sleep(3 * (retry_count + 1))
                return self._make_request(method, endpoint, params, data, files, json_data, retry_count + 1)
            raise WeChatNetworkError(f"HTTP error: {e}") from e
        except httpx.HTTPError as e:
            if retry_count < self.max_retries:
                logger.warning(f"Network error, retrying... ({retry_count + 1}/{self.max_retries})")
                time.sleep(2**retry_count)
                return self._make_request(method, endpoint, params, data, files, json_data, retry_count + 1)
            raise WeChatNetworkError(f"Network error after {self.max_retries} retries: {e}") from e

        except WeChatAPIError:
            raise
        except WeChatError:
            # Propagate other WeChat-specific errors (RateLimit, Auth, Network, etc.)
            # unchanged so callers can branch on type. Without this, a
            # WeChatRateLimitError raised inside a recursive _make_request
            # call would be caught by the broad `except Exception` below
            # and re-wrapped as a generic WeChatAPIError, losing the
            # original error type.
            raise
        except Exception as e:
            raise WeChatAPIError(f"Unexpected error: {e}") from e

    def upload_cover(
        self,
        image_path: Path | None = None,
        image_url: str | None = None,
    ) -> str:
        """
        Upload cover image and get thumb_media_id.

        Args:
            image_path: Local path to cover image
            image_url: URL of cover image (will download first)

        Returns:
            thumb_media_id for use in articles

        Raises:
            WeChatUploadError: If upload fails
        """
        if image_url and not image_path:
            # Download image from URL
            image_path = self._download_image(image_url)

        if not image_path or not image_path.exists():
            raise WeChatUploadError("Image file not found")

        if not is_valid_image_file(image_path):
            raise WeChatUploadError(f"Invalid image file: {image_path}")

        # Upload to WeChat
        url = f"{self.api_base}/cgi-bin/material/add_material"
        params = {"access_token": self.access_token, "type": "image"}

        for attempt in range(self.max_retries):
            try:
                with open(image_path, "rb") as f:
                    files = {"media": (image_path.name, f, "image/jpeg")}
                    response = self._client.post(url, params=params, files=files)
                    response.raise_for_status()
                    result = response.json()

                    if "errcode" in result and result["errcode"] != 0:
                        error_code = result["errcode"]
                        error_msg = result.get("errmsg", "")

                        if error_code in [41005, 41006] and attempt < self.max_retries - 1:
                            logger.warning(f"Upload failed, retrying... (attempt {attempt + 1})")
                            time.sleep(2**attempt)
                            continue

                        raise_for_error_code(error_code, error_msg)

                    media_id = result.get("media_id")
                    if not media_id:
                        raise WeChatUploadError("Upload succeeded but no media_id returned")

                    logger.info(f"Cover image uploaded: {media_id}")
                    return media_id

            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise WeChatUploadError(f"Failed to upload cover image: {e}") from e
                logger.warning(f"Upload attempt {attempt + 1} failed: {e}")
                time.sleep(2**attempt)

        raise WeChatUploadError("Upload failed after all retries")

    def upload_image(self, image_path: Path) -> str:
        """
        Upload image for use in article content (returns URL).

        Args:
            image_path: Local path to image

        Returns:
            Image URL for use in HTML content

        Raises:
            WeChatUploadError: If upload fails
        """
        if not image_path.exists():
            raise WeChatUploadError(f"Image file not found: {image_path}")

        url = f"{self.api_base}/cgi-bin/media/uploadimg"
        params = {"access_token": self.access_token}

        try:
            with open(image_path, "rb") as f:
                files = {"media": (image_path.name, f, "image/jpeg")}
                response = self._client.post(url, params=params, files=files)
                response.raise_for_status()
                result = response.json()

                if "errcode" in result and result["errcode"] != 0:
                    raise_for_error_code(result["errcode"], result.get("errmsg", ""))

                image_url = result.get("url")
                if not image_url:
                    raise WeChatUploadError("Upload succeeded but no URL returned")

                logger.info(f"Image uploaded: {image_url}")
                return image_url

        except Exception as e:
            raise WeChatUploadError(f"Failed to upload image: {e}") from e

    def _download_image(self, url: str) -> Path:
        """
        Download image from URL to temp file.

        Args:
            url: Image URL

        Returns:
            Path to downloaded image
        """
        response = self._client.get(url)
        response.raise_for_status()

        # Get file extension from URL or content-type
        ext = ".jpg"
        if "." in url.split("/")[-1]:
            ext = "." + url.split("/")[-1].split(".")[-1][:4]

        # Save to temp file
        temp_dir = Path(tempfile.gettempdir()) / "wechat_publisher"
        temp_dir.mkdir(exist_ok=True)
        temp_file = temp_dir / f"cover_{int(time.time())}{ext}"

        with open(temp_file, "wb") as f:
            f.write(response.content)

        return temp_file

    def create_draft(self, article: Article) -> Draft:
        """
        Create a draft article.

        Args:
            article: Article object to create draft from

        Returns:
            Draft object with media_id

        Raises:
            WeChatDraftError: If draft creation fails
        """
        endpoint = "/cgi-bin/draft/add"

        # Prepare articles array (WeChat supports multiple articles per draft)
        articles_data = [article.to_api_dict()]

        data = {"articles": articles_data}

        try:
            result = self._make_request("POST", endpoint, json_data=data)

            media_id = result.get("media_id")
            if not media_id:
                raise WeChatDraftError("Draft created but no media_id returned")

            logger.info(f"Draft created: {media_id}")
            return Draft.from_api_response(result, article)

        except Exception as e:
            raise WeChatDraftError(f"Failed to create draft: {e}") from e

    def publish(
        self,
        article: Article | None = None,
        draft_id: str | None = None,
        publish_type: str = "free",
    ) -> PublishResult:
        """
        Publish article to WeChat Official Account.

        Args:
            article: Article object to publish (if not using draft)
            draft_id: Draft media_id to publish (if using draft)
            publish_type: "free" for free publish, "mass" for mass send (requires certification)

        Returns:
            PublishResult object

        Raises:
            WeChatPublishError: If publishing fails
        """
        if not article and not draft_id:
            raise WeChatPublishError("Either article or draft_id must be provided")

        # If article provided, create draft first
        if article and not draft_id:
            draft = self.create_draft(article)
            draft_id = draft.media_id

        # Publish based on type
        if publish_type == "free":
            return self._free_publish(draft_id)
        elif publish_type == "mass":
            return self._mass_publish(draft_id)
        else:
            raise WeChatPublishError(f"Unsupported publish_type: {publish_type}")

    def _free_publish(self, draft_id: str) -> PublishResult:
        """
        Free publish (publish one article).

        Args:
            draft_id: Draft media_id

        Returns:
            PublishResult object
        """
        endpoint = "/cgi-bin/freepublish/submit"
        data = {"media_id": draft_id}

        try:
            result = self._make_request("POST", endpoint, json_data=data)

            publish_id = result.get("publish_id")

            logger.info(f"Article submitted for publishing: {publish_id}")

            return PublishResult.success_result(
                publish_id=publish_id,
                media_id=draft_id,
                data=result,
            )

        except Exception as e:
            logger.error(f"Free publish failed: {e}")
            return PublishResult.error_result(
                error_code=getattr(e, "error_code", -1),
                error_message=str(e),
            )

    def _mass_publish(self, draft_id: str) -> PublishResult:
        """
        Mass publish (群发).

        Note: Requires WeChat Official Account certification.

        Args:
            draft_id: Draft media_id

        Returns:
            PublishResult object
        """
        endpoint = "/cgi-bin/message/mass/sendall"

        # Mass send configuration
        data = {
            "filter": {"is_to_all": True},
            "msgtype": "mpnews",
            "mpnews": {"media_id": draft_id},
        }

        try:
            result = self._make_request("POST", endpoint, json_data=data)

            msg_id = result.get("msg_id")
            _ = result.get("msg_data_id")

            logger.info(f"Mass publish submitted: msg_id={msg_id}")

            return PublishResult.success_result(
                article_id=msg_id,
                media_id=draft_id,
                data=result,
            )

        except Exception as e:
            logger.error(f"Mass publish failed: {e}")
            return PublishResult.error_result(
                error_code=getattr(e, "error_code", -1),
                error_message=str(e),
            )

    def get_publish_status(self, publish_id: str) -> PublishStatus:
        """
        Get publish status.

        Args:
            publish_id: Publish job ID

        Returns:
            PublishStatus object
        """
        endpoint = "/cgi-bin/freepublish/get"
        data = {"publish_id": publish_id}

        try:
            result = self._make_request("POST", endpoint, json_data=data)

            status = result.get("publish_status", 0)
            article_id = result.get("article_id")
            article_url = result.get("article_url")

            return PublishStatus(
                publish_id=publish_id,
                status=status,
                article_id=article_id,
                article_url=article_url,
                publish_time=datetime.now(),
            )

        except Exception as e:
            logger.error(f"Failed to get publish status: {e}")
            return PublishStatus(
                publish_id=publish_id,
                status=2,  # Failed
                fail_reason=str(e),
            )

    def delete_draft(self, media_id: str) -> bool:
        """
        Delete a draft.

        Args:
            media_id: Draft media_id to delete

        Returns:
            True if successful
        """
        endpoint = "/cgi-bin/draft/delete"
        data = {"media_id": media_id}

        try:
            self._make_request("POST", endpoint, json_data=data)
            logger.info(f"Draft deleted: {media_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete draft: {e}")
            return False

    def update_draft(self, media_id: str, article: Article, index: int = 0) -> bool:
        """
        Update an existing draft.

        Args:
            media_id: Draft media_id to update
            article: New article content
            index: Article index in draft (0 for single article)

        Returns:
            True if successful
        """
        endpoint = "/cgi-bin/draft/update"
        data = {
            "media_id": media_id,
            "index": index,
            "articles": article.to_api_dict(),
        }

        try:
            self._make_request("POST", endpoint, json_data=data)
            logger.info(f"Draft updated: {media_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to update draft: {e}")
            return False

    def publish_url(self, article_url: str) -> PublishResult:
        """
        Publish an existing article by URL (for reprinting).

        Args:
            article_url: URL of existing WeChat article

        Returns:
            PublishResult object
        """
        # Note: WeChat doesn't have a direct "reprint by URL" API
        # This is a placeholder for future implementation or manual process
        raise NotImplementedError(
            "Publishing by URL is not directly supported by WeChat API. "
            "Please use the `publish()` method with an Article object."
        )

    def close(self) -> None:
        """Close HTTP client and release resources."""
        self._client.close()
        logger.info("WechatPublisher closed")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
