"""Coverr stock video source adapter.

Wraps the Coverr API (``api.coverr.co``) behind the unified `StockSource`
protocol. Coverr offers curated, high-quality stock footage (HD and 4K)
under a free commercial-use licence with no attribution required.

Free API tier: 50 requests per hour. Production tier (with Pro/Ultimate
subscription): 2,000 requests per hour. The adapter uses the free tier
by default — no API key required for basic search.

What Coverr is good for
-----------------------
- Modern lifestyle / cinematic B-roll
- Nature, urban, technology, abstract backgrounds
- High production quality (curated library)
- Quick establishing shots and mood-setters
"""
from __future__ import annotations

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

import os
from pathlib import Path
from typing import Any

from .base import Candidate, SearchFilters


_SEARCH_URL = "https://api.coverr.co/videos"
_LICENSE = "Coverr License (free for commercial and personal use, no attribution required)"


class CoverrSource:
    """Coverr video adapter. Satisfies `StockSource`."""

    name = "coverr"
    display_name = "Coverr"
    provider = "coverr"
    priority = 16
    install_instructions = (
        "Coverr works without an API key (free tier, 50 req/hr). "
        "Set COVERR_API_KEY in .env for higher rate limits (Pro tier)."
    )

    def is_available(self) -> bool:
        # Coverr works without an API key (free tier)
        return True

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()
        if kind == "image":
            return []

        headers: dict[str, str] = {}
        api_key = os.environ.get("COVERR_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        params: dict[str, Any] = {
            "query": query,
            "page_size": max(1, min(filters.per_page, 25)),
            "page": max(1, filters.page),
        }

        r = httpx.get(
            _SEARCH_URL,
            headers=headers,
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        hits = data.get("hits", []) or data.get("videos", []) or []

        out: list[Candidate] = []
        for v in hits:
            duration = float(v.get("duration", 0) or 0)
            if filters.min_duration is not None and duration < filters.min_duration:
                continue
            if filters.max_duration is not None and duration > filters.max_duration:
                continue

            # Coverr provides multiple URLs for different qualities
            urls = v.get("urls", {}) or {}
            download_url = (
                urls.get("mp4_download")
                or urls.get("mp4_1080")
                or urls.get("mp4_720")
                or urls.get("mp4_preview")
                or ""
            )
            if not download_url:
                continue

            width = int(v.get("width") or 1920)
            height = int(v.get("height") or 1080)
            if filters.min_width and width < filters.min_width:
                continue

            tags = v.get("tags", "") or ""
            if isinstance(tags, list):
                tags = " ".join(tags)
            title = v.get("title", "") or ""
            source_tags = f"{title} {tags}".strip()

            out.append(
                Candidate(
                    source=self.name,
                    source_id=str(v.get("id") or v.get("slug", "")),
                    source_url=v.get("url", "") or f"https://coverr.co/videos/{v.get('slug', '')}",
                    download_url=download_url,
                    kind="video",
                    width=width,
                    height=height,
                    duration=duration,
                    creator=v.get("creator", {}).get("name", "") if isinstance(v.get("creator"), dict) else "",
                    license=_LICENSE,
                    source_tags=source_tags,
                    thumbnail_url=urls.get("poster") or urls.get("thumbnail") or "",
                    extra={
                        "slug": v.get("slug"),
                        "category": v.get("category"),
                    },
                )
            )
        return out

    def download(self, candidate: Candidate, out_path: Path) -> Path:
        import httpx

        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        with httpx.get(
            candidate.download_url, stream=True, timeout=120
        ) as r:
            r.raise_for_status()
            with open(out_path, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    if chunk:
                        f.write(chunk)
        return out_path


class CoverrVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "coverr"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "coverr"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.API
    
    dependencies = []
    install_instructions = ""
    
    capabilities = ["search", "download"]
    best_for = ["stock footage search and download"]
    not_good_for: list[str] = []
    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=512, vram_mb=0, disk_mb=100, network_required=True)
    
    def get_status(self) -> ToolStatus:
        try:
            source = CoverrSource()
            return ToolStatus.AVAILABLE if source.is_available() else ToolStatus.UNAVAILABLE
        except Exception:
            return ToolStatus.UNAVAILABLE
    
    def estimate_cost(self, inputs: dict) -> float:
        return 0.0
    
    def estimate_runtime(self, inputs: dict) -> float:
        return 10.0
    
    def execute(self, inputs: dict) -> ToolResult:
        """
        Execute search or download operation.
        
        Operations:
        - search: Search for stock media by query
        - download: Download a specific candidate by source_id
        """
        operation = inputs.get("operation", "search")
        source = CoverrSource()
        
        if operation == "search":
            query = inputs.get("query", "")
            filters = SearchFilters(
                kind=inputs.get("kind", "video"),
                per_page=inputs.get("per_page", 20),
                page=inputs.get("page", 1),
            )
            if "min_duration" in inputs:
                filters.min_duration = inputs["min_duration"]
            if "max_duration" in inputs:
                filters.max_duration = inputs["max_duration"]
            if "orientation" in inputs:
                filters.orientation = inputs["orientation"]
            if "min_width" in inputs:
                filters.min_width = inputs["min_width"]
            
            try:
                results = source.search(query, filters)
                return ToolResult(
                    success=True,
                    data={
                        "operation": "search",
                        "query": query,
                        "results": [r.__dict__ for r in results],
                        "count": len(results),
                        "source": self.name,
                    }
                )
            except Exception as e:
                return ToolResult(success=False, error=f"Search failed: {e}")
        
        elif operation == "download":
            candidate_dict = inputs.get("candidate")
            output_path = Path(inputs.get("output_path", "download.mp4"))
            if candidate_dict:
                from .base import Candidate
                cand = Candidate(**candidate_dict)
            else:
                return ToolResult(success=False, error="download requires 'candidate' dict")
            
            try:
                result_path = source.download(cand, output_path)
                return ToolResult(
                    success=True,
                    data={
                        "operation": "download",
                        "output": str(result_path),
                        "source": self.name,
                    },
                    artifacts=[str(result_path)],
                )
            except Exception as e:
                return ToolResult(success=False, error=f"Download failed: {e}")
        
        return ToolResult(success=False, error=f"Unknown operation: {operation}")
