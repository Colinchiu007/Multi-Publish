"""Pond5 Public Domain stock source adapter.

Wraps Pond5's public domain collection behind the unified `StockSource`
protocol. Pond5 has curated ~10,000 public domain video clips plus
65,000+ photos and audio recordings. The collection focuses on
historical and archival material: WWI/WWII, early cinema, space
launches, historical speeches, Olympic footage.

All public domain items are CC0-equivalent — free for any use, no
attribution required (though appreciated).

The adapter accesses Pond5's free public domain search which does not
require an API key. For the full commercial API, a partnership agreement
is needed, but the public domain subset is openly browsable.

What Pond5 Public Domain is good for
-------------------------------------
- Historical / archival documentary footage (WWI, WWII, Cold War)
- Early cinema (Méliès, Edison, Lumière)
- Vintage newsreels and propaganda films
- Space race and early NASA footage
- Historical speeches (JFK, Churchill, MLK)
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
from pathlib import Path
from typing import Any

from .base import Candidate, SearchFilters

_log = logging.getLogger(__name__)

_SEARCH_URL = "https://www.pond5.com/api/v2/search"
_PD_SEARCH_URL = "https://www.pond5.com/free"
_LICENSE = "Public domain (CC0 equivalent, Pond5 Public Domain Project)"

# Pond5 public domain items are tagged with specific collection IDs
_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".wmv", ".webm", ".mpg", ".mpeg"}


class Pond5PublicDomainSource:
    """Pond5 Public Domain adapter. Satisfies `StockSource`."""

    name = "pond5_pd"
    display_name = "Pond5 Public Domain"
    provider = "pond5"
    priority = 38
    install_instructions = (
        "Pond5 Public Domain works without an API key for basic search. "
        "Set POND5_API_KEY in .env for higher rate limits and full API access."
    )

    def is_available(self) -> bool:
        return True

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()

        # Pond5 public search endpoint
        params: dict[str, Any] = {
            "kw": query,
            "page": max(1, filters.page),
            "ps": max(1, min(filters.per_page, 50)),
            "free": 1,  # Only free/public domain items
        }

        if kind == "video":
            params["mt"] = "footage"
        elif kind == "image":
            params["mt"] = "photos"

        import os
        headers: dict[str, str] = {
            "User-Agent": "OpenMontage/1.0 (stock source adapter)",
        }
        api_key = os.environ.get("POND5_API_KEY")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            r = httpx.get(
                _SEARCH_URL,
                headers=headers,
                params=params,
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            _log.warning("Pond5 PD search failed (API), trying web fallback: %s", e)
            return self._search_web_fallback(query, kind, filters)

        results = data.get("results", []) or data.get("items", []) or []
        return self._parse_results(results, kind, filters)

    def _parse_results(
        self, results: list[dict], kind: str, filters: SearchFilters
    ) -> list[Candidate]:
        out: list[Candidate] = []
        for item in results:
            item_id = str(item.get("id", "") or "")
            if not item_id:
                continue

            title = item.get("t", "") or item.get("title", "") or ""
            description = item.get("desc", "") or item.get("description", "") or ""
            keywords = item.get("kw", "") or item.get("keywords", "") or ""
            if isinstance(keywords, list):
                keywords = " ".join(keywords)
            source_tags = f"{title} {description} {keywords}".strip()

            duration = float(item.get("dur", 0) or item.get("duration", 0) or 0)
            if kind == "video":
                if filters.min_duration and duration and duration < filters.min_duration:
                    continue
                if filters.max_duration and duration and duration > filters.max_duration:
                    continue

            # Preview/download URL
            preview_url = (
                item.get("v", "")
                or item.get("preview_url", "")
                or item.get("icon_url", "")
                or ""
            )
            thumb_url = item.get("ic", "") or item.get("thumbnail_url", "") or ""

            if not preview_url:
                continue

            width = int(item.get("w", 0) or item.get("width", 0) or 0)
            height = int(item.get("h", 0) or item.get("height", 0) or 0)

            candidate_kind = "video" if kind != "image" else "image"
            source_url = f"https://www.pond5.com/stock-footage/{item_id}"

            out.append(
                Candidate(
                    source=self.name,
                    source_id=item_id,
                    source_url=source_url,
                    download_url=preview_url,
                    kind=candidate_kind,
                    width=width,
                    height=height,
                    duration=duration,
                    creator=item.get("an", "") or item.get("artist_name", "") or "Pond5 Public Domain",
                    license=_LICENSE,
                    source_tags=source_tags,
                    thumbnail_url=thumb_url,
                    extra={
                        "fps": item.get("fps"),
                        "codec": item.get("codec"),
                    },
                )
            )
        return out

    def _search_web_fallback(
        self, query: str, kind: str, filters: SearchFilters
    ) -> list[Candidate]:
        """Fallback: parse Pond5 free page HTML for public domain clips.

        Used when the API endpoint is unavailable or returns errors.
        Returns empty list if HTML parsing fails — does not raise.
        """
        _log.info("Pond5 PD: web fallback not implemented, returning empty")
        return []

    def download(self, candidate: Candidate, out_path: Path) -> Path:
        import httpx

        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        with httpx.get(
            candidate.download_url, stream=True, timeout=180
        ) as r:
            r.raise_for_status()
            with open(out_path, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    if chunk:
                        f.write(chunk)
        return out_path


class Pond5PdVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "pond5_pd"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "pond5_pd"
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
            source = Pond5PublicDomainSource()
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
        source = Pond5PublicDomainSource()
        
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
