"""Videvo stock video source adapter.

Wraps the Videvo API behind the unified `StockSource` protocol. Videvo
offers 90,000+ free video clips (HD and 4K) plus a larger premium
library. Free clips use either the Videvo Attribution License (credit
required) or Creative Commons 3.0 (CC BY 3.0).

Videvo API: Announced at https://www.videvo.net/blog/announcing-the-new-api/.
Requires an API key for access. Unlimited requests claimed.

What Videvo is good for
-----------------------
- Large free video library (90K+ clips)
- Nature, aerial, city, abstract, time-lapses
- Modern HD/4K footage
- Complements Pexels with a different contributor base
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

import logging
import os
from pathlib import Path
from typing import Any

from .base import Candidate, SearchFilters

_log = logging.getLogger(__name__)

_API_URL = "https://api.videvo.net/v1/search"
_LICENSE_ATTR = "Videvo Attribution License (free, attribution required)"
_LICENSE_CC = "Creative Commons 3.0 (CC BY 3.0, attribution required)"


class VidevoSource:
    """Videvo video adapter. Satisfies `StockSource`."""

    name = "videvo"
    display_name = "Videvo"
    provider = "videvo"
    priority = 22
    install_instructions = (
        "Set VIDEVO_API_KEY in .env to enable Videvo stock search "
        "(get API access at https://www.videvo.net/api/)."
    )

    def is_available(self) -> bool:
        return bool(os.environ.get("VIDEVO_API_KEY"))

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()
        if kind == "image":
            return []

        api_key = os.environ.get("VIDEVO_API_KEY")
        if not api_key:
            return []

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        params: dict[str, Any] = {
            "query": query,
            "page": max(1, filters.page),
            "per_page": max(1, min(filters.per_page, 50)),
            "license_type": "free",  # Only free clips
        }

        if filters.orientation:
            params["orientation"] = filters.orientation

        try:
            r = httpx.get(
                _API_URL,
                headers=headers,
                params=params,
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            _log.warning("Videvo search failed: %s", e)
            return []

        hits = data.get("data", []) or data.get("results", []) or data.get("clips", []) or []
        out: list[Candidate] = []

        for v in hits:
            duration = float(v.get("duration", 0) or 0)
            if filters.min_duration is not None and duration < filters.min_duration:
                continue
            if filters.max_duration is not None and duration > filters.max_duration:
                continue

            # Get best download URL
            download_url = (
                v.get("download_url", "")
                or v.get("url_hd", "")
                or v.get("url_sd", "")
                or v.get("preview_url", "")
                or ""
            )
            if not download_url:
                continue

            width = int(v.get("width") or 0)
            height = int(v.get("height") or 0)
            if filters.min_width and width and width < filters.min_width:
                continue

            # Tags
            title = v.get("title", "") or ""
            tags = v.get("tags", "") or v.get("keywords", "") or ""
            if isinstance(tags, list):
                tags = " ".join(tags)
            source_tags = f"{title} {tags}".strip()

            # License type
            lic_type = (v.get("license_type", "") or "").lower()
            lic = _LICENSE_CC if "creative commons" in lic_type or "cc" in lic_type else _LICENSE_ATTR

            clip_id = str(v.get("id", "") or "")
            source_url = v.get("page_url", "") or v.get("url", "") or f"https://www.videvo.net/video/{clip_id}/"

            out.append(
                Candidate(
                    source=self.name,
                    source_id=clip_id,
                    source_url=source_url,
                    download_url=download_url,
                    kind="video",
                    width=width,
                    height=height,
                    duration=duration,
                    creator=v.get("author", "") or v.get("contributor", "") or "",
                    license=lic,
                    source_tags=source_tags,
                    thumbnail_url=v.get("thumbnail_url", "") or v.get("poster_url", "") or "",
                    extra={
                        "fps": v.get("fps"),
                        "resolution": v.get("resolution"),
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


class VidevoVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "videvo"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "videvo"
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
            source = VidevoSource()
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
        source = VidevoSource()
        
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
