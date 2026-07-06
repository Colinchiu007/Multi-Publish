"""Pixabay Video stock source adapter.

Wraps the Pixabay Video API (``pixabay.com/api/videos/``) behind the
unified `StockSource` protocol. Pixabay has a large community-contributed
video library (hundreds of thousands of clips) with a CC0-like licence
that allows free commercial use without attribution.

Uses the same ``PIXABAY_API_KEY`` as the Pixabay Music tool — if you've
already set it for music search, this adapter is automatically available.

Rate limit: 100 requests per 60 seconds (free tier). The adapter trusts
the API to enforce this and does not self-throttle.

What Pixabay Video is good for
------------------------------
- Broad general-purpose footage: nature, people, technology, food, city
- Modern, community-contributed clips (skews recent / lifestyle)
- Quick gap-fills when Pexels doesn't cover a query
- Available up to 1080p (some clips have 4K)
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
from typing import Any, Optional

from .base import Candidate, SearchFilters


_API_URL = "https://pixabay.com/api/videos/"
_LICENSE = "Pixabay Content License (free, no attribution required)"


class PixabayVideoSource:
    """Pixabay Video adapter. Satisfies `StockSource`."""

    name = "pixabay_video"
    display_name = "Pixabay Video"
    provider = "pixabay"
    priority = 15
    install_instructions = (
        "Set PIXABAY_API_KEY in .env to enable Pixabay Video search "
        "(free key at https://pixabay.com/api/docs/)."
    )

    def is_available(self) -> bool:
        return bool(os.environ.get("PIXABAY_API_KEY"))

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()
        if kind == "image":
            return []  # video-only adapter

        params: dict[str, Any] = {
            "key": os.environ["PIXABAY_API_KEY"],
            "q": query,
            "per_page": max(3, min(filters.per_page, 200)),
            "page": max(1, filters.page),
            "safesearch": "true",
        }
        if filters.min_duration is not None:
            params["min_duration"] = int(filters.min_duration)
        if filters.max_duration is not None:
            params["max_duration"] = int(filters.max_duration)

        r = httpx.get(_API_URL, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        hits = data.get("hits", []) or []

        out: list[Candidate] = []
        for h in hits:
            videos = h.get("videos", {})
            rend = _pick_rendition(videos, min_width=filters.min_width or 0)
            if rend is None:
                continue

            duration = float(h.get("duration", 0) or 0)
            tags = h.get("tags", "") or ""

            out.append(
                Candidate(
                    source=self.name,
                    source_id=str(h.get("id")),
                    source_url=h.get("pageURL", "") or "",
                    download_url=rend["url"],
                    kind="video",
                    width=rend["width"],
                    height=rend["height"],
                    duration=duration,
                    creator=h.get("user", "") or "",
                    license=_LICENSE,
                    source_tags=tags,
                    thumbnail_url=(
                        h.get("userImageURL", "")
                        or videos.get("tiny", {}).get("thumbnail", "")
                        or ""
                    ),
                    extra={
                        "views": h.get("views"),
                        "downloads": h.get("downloads"),
                        "rendition_size": rend.get("size"),
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


def _pick_rendition(
    videos: dict[str, Any],
    min_width: int = 0,
) -> Optional[dict[str, Any]]:
    """Pick the best rendition from Pixabay's nested video dict.

    Pixabay returns renditions keyed by quality tier:
    large (1920), medium (1280), small (960), tiny (640).
    We pick the largest that's at most 1920px wide.
    """
    preference = ["large", "medium", "small", "tiny"]
    for tier in preference:
        rend = videos.get(tier)
        if not rend or not rend.get("url"):
            continue
        w = int(rend.get("width") or 0)
        h = int(rend.get("height") or 0)
        if w >= min_width:
            return {"url": rend["url"], "width": w, "height": h, "size": rend.get("size")}
    return None


class PixabayVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "pixabay"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "pixabay"
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
            source = PixabayVideoSource()
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
        source = PixabayVideoSource()
        
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
