"""
Multi-Publish API Client for platform-orchestrator

?? HTTP ?? api-publish-engine ???????
"""

import json
from typing import Any, Dict, List, Optional
import httpx


class PublishApiClient:
    """Multi-Publish API ????? platform-orchestrator ???"""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: float = 120.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers=self._build_headers(),
        )

    def _build_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def health(self) -> Dict[str, Any]:
        resp = await self._client.get("/api/v1/health")
        resp.raise_for_status()
        return resp.json()

    async def list_platforms(self) -> List[str]:
        resp = await self._client.get("/api/v1/platforms")
        resp.raise_for_status()
        data = resp.json()
        return data.get("platforms", [])

    async def publish(
        self,
        platform: str,
        title: str = "",
        content: str = "",
        tags: Optional[List[str]] = None,
        cookie: str = "",
        images: Optional[List[str]] = None,
        video: Optional[str] = None,
    ) -> Dict[str, Any]:
        body = {
            "platform": platform,
            "title": title,
            "content": content,
            "tags": tags or [],
            "cookie": cookie,
        }
        if images:
            body["images"] = images
        if video:
            body["video"] = video
        resp = await self._client.post("/api/v1/publish", json=body)
        resp.raise_for_status()
        return resp.json()

    async def batch_publish(
        self,
        platforms: List[str],
        title: str = "",
        content: str = "",
        tags: Optional[List[str]] = None,
        cookie: str = "",
    ) -> List[Dict[str, Any]]:
        body = {
            "platforms": platforms,
            "title": title,
            "content": content,
            "tags": tags or [],
            "cookie": cookie,
        }
        resp = await self._client.post("/api/v1/batch-publish", json=body)
        resp.raise_for_status()
        return resp.json()

    async def schedule_publish(
        self,
        platforms: List[str],
        scheduled_at: str,
        title: str = "",
        content: str = "",
        tags: Optional[List[str]] = None,
        cookie: str = "",
    ) -> Dict[str, Any]:
        body = {
            "platforms": platforms,
            "scheduledAt": scheduled_at,
            "title": title,
            "content": content,
            "tags": tags or [],
            "cookie": cookie,
        }
        resp = await self._client.post("/api/v1/schedule", json=body)
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self._client.aclose()
