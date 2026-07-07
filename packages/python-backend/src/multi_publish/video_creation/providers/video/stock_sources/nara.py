"""U.S. National Archives (NARA) stock source adapter.

Wraps the NARA Catalog API (``catalog.archives.gov/api/v2``) behind the
unified `StockSource` protocol. NARA holds billions of records including
significant film and video holdings — all U.S. federal government work
and therefore public domain.

No API key required for basic searching. For higher rate limits, email
Catalog_API@nara.gov to request a key. Rate limit: ~10,000 queries per
month per API key.

Fetch pattern
-------------
Two-stage like NASA. The search endpoint returns metadata records. Each
record may contain digital objects (files) in ``objects``. We follow
those to find downloadable video files.

What NARA is good for
---------------------
- U.S. historical footage (military, presidential, space, civil rights)
- WWII, Cold War, Apollo era footage
- Government program footage and newsreels
- Any "march of history" documentary sequence
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

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

from .base import Candidate, SearchFilters

_log = logging.getLogger(__name__)

_SEARCH_URL = "https://catalog.archives.gov/api/v2/search"
_LICENSE = "Public domain (U.S. federal government work)"


class NARASource:
    """U.S. National Archives adapter. Satisfies `StockSource`."""

    name = "nara"
    display_name = "U.S. National Archives"
    provider = "nara"
    priority = 35
    install_instructions = (
        "NARA works without an API key. "
        "Set NARA_API_KEY in .env for higher rate limits."
    )

    def is_available(self) -> bool:
        # NARA is always available (no key required)
        return True

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()

        params: dict[str, Any] = {
            "q": query,
            "rows": max(1, min(filters.per_page, 50)),
            "offset": (max(1, filters.page) - 1) * filters.per_page,
        }

        # Filter by type if possible
        if kind == "video":
            params["type"] = "moving-image"
        elif kind == "image":
            params["type"] = "still-image"

        headers: dict[str, str] = {}
        api_key = os.environ.get("NARA_API_KEY")
        if api_key:
            headers["x-api-key"] = api_key

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
            _log.warning("NARA search failed: %s", e)
            return []

        results = data.get("results", []) or []
        out: list[Candidate] = []

        for item in results:
            candidates = self._extract_candidates(item, kind, filters)
            out.extend(candidates)

        return out

    def _extract_candidates(
        self, item: dict, kind: str, filters: SearchFilters
    ) -> list[Candidate]:
        """Extract downloadable candidates from a NARA catalog record."""
        naid = str(item.get("naId", "") or "")
        if not naid:
            return []

        title = item.get("title", "") or ""
        description = item.get("scopeAndContentNote", "") or ""
        source_tags = f"{title} {description}".strip()
        source_url = f"https://catalog.archives.gov/id/{naid}"

        # Look for digital objects
        objects = item.get("objects", []) or []
        if not objects:
            # Try alternate field names
            digital = item.get("digitalObjects", []) or []
            objects = digital

        out: list[Candidate] = []
        for obj in objects:
            file_url = obj.get("url") or obj.get("fileUrl") or ""
            if not file_url:
                continue

            # Determine kind from mime type or file extension
            mime = (obj.get("mimeType", "") or "").lower()
            ext = file_url.rsplit(".", 1)[-1].lower() if "." in file_url else ""

            is_video = (
                "video" in mime
                or ext in ("mp4", "mov", "avi", "wmv", "mkv", "webm")
            )
            is_image = (
                "image" in mime
                or ext in ("jpg", "jpeg", "png", "tif", "tiff", "gif")
            )

            if kind == "video" and not is_video:
                continue
            if kind == "image" and not is_image:
                continue
            if not is_video and not is_image:
                continue

            candidate_kind = "video" if is_video else "image"
            width = int(obj.get("width") or 0)
            height = int(obj.get("height") or 0)
            duration = float(obj.get("duration") or 0)

            # Duration filters (client-side)
            if candidate_kind == "video":
                if filters.min_duration and duration and duration < filters.min_duration:
                    continue
                if filters.max_duration and duration and duration > filters.max_duration:
                    continue

            out.append(
                Candidate(
                    source=self.name,
                    source_id=f"{naid}_{obj.get('objectId', len(out))}",
                    source_url=source_url,
                    download_url=file_url,
                    kind=candidate_kind,
                    width=width,
                    height=height,
                    duration=duration,
                    creator="U.S. National Archives",
                    license=_LICENSE,
                    source_tags=source_tags,
                    thumbnail_url=obj.get("thumbnailUrl", "") or "",
                    extra={
                        "naId": naid,
                        "mime": mime,
                        "fileSize": obj.get("fileSize"),
                    },
                )
            )

        return out

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


class NaraVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "nara"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "nara"
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
            source = NARASource()
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
        source = NARASource()

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
