"""Library of Congress stock source adapter.

Wraps the loc.gov JSON API behind the unified `StockSource` protocol.
The Library of Congress holds 25+ digital collections of film and video
materials including early cinema, newsreels, documentaries, and cultural
recordings. Many items are public domain (pre-1928 or U.S. government).

No API key required. Rate limiting is polite-crawl based.

Fetch pattern
-------------
Two-stage. The search endpoint (``loc.gov/search``) returns items with
links to detail pages. The detail page JSON contains downloadable
resources including video files. Items are filtered by ``original-format``
to target film/video content.

What Library of Congress is good for
------------------------------------
- Early American cinema (pre-1928, public domain)
- Historical newsreels and documentaries
- Cultural recordings, folk traditions
- Government and civic footage
"""
from __future__ import annotations

import logging
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

_SEARCH_URL = "https://www.loc.gov/search/"
_LICENSE_PD = "Public domain (Library of Congress)"
_LICENSE_CHECK = "Rights status varies — verify per item (Library of Congress)"

# Video-related format filters for the LoC API
_VIDEO_FORMATS = ["film/video", "motion picture"]


class LibraryOfCongressSource:
    """Library of Congress adapter. Satisfies `StockSource`."""

    name = "loc"
    display_name = "Library of Congress"
    provider = "loc"
    priority = 40
    install_instructions = (
        "Library of Congress works without an API key. "
        "No setup needed."
    )

    def is_available(self) -> bool:
        return True

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx

        kind = (filters.kind or "video").lower()

        params: dict[str, Any] = {
            "q": query,
            "fo": "json",
            "c": max(1, min(filters.per_page, 50)),
            "sp": max(1, filters.page),
        }

        # Filter by format
        if kind == "video":
            params["fa"] = "original-format:film/video"
        elif kind == "image":
            params["fa"] = "original-format:photo, print, drawing"

        try:
            r = httpx.get(
                _SEARCH_URL,
                params=params,
                timeout=30,
                headers={"Accept": "application/json"},
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            _log.warning("Library of Congress search failed: %s", e)
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
        """Extract downloadable candidates from a LoC search result."""
        item_id = item.get("id", "") or ""
        if not item_id:
            return []

        title = item.get("title", "") or ""
        description = ""
        desc_list = item.get("description", [])
        if isinstance(desc_list, list) and desc_list:
            description = desc_list[0] if isinstance(desc_list[0], str) else ""
        elif isinstance(desc_list, str):
            description = desc_list

        subjects = item.get("subject", []) or []
        if isinstance(subjects, list):
            subjects = " ".join(s for s in subjects if isinstance(s, str))
        source_tags = f"{title} {description} {subjects}".strip()

        source_url = item_id if item_id.startswith("http") else f"https://www.loc.gov{item_id}"

        # Determine rights
        rights = item.get("rights", []) or []
        if isinstance(rights, list):
            rights_str = " ".join(r for r in rights if isinstance(r, str)).lower()
        else:
            rights_str = str(rights).lower()
        lic = _LICENSE_PD if "public domain" in rights_str or "no known" in rights_str else _LICENSE_CHECK

        # Look for downloadable resources
        resources = item.get("resources", []) or []
        # Also check the item's direct links
        image_url = ""
        if isinstance(item.get("image_url"), list):
            urls = item["image_url"]
            image_url = urls[0] if urls else ""
        elif isinstance(item.get("image_url"), str):
            image_url = item["image_url"]

        out: list[Candidate] = []

        # Try resources first
        for res in resources:
            if not isinstance(res, dict):
                continue
            files = res.get("files", []) or []
            for file_group in files:
                if not isinstance(file_group, list):
                    continue
                for f in file_group:
                    if not isinstance(f, dict):
                        continue
                    url = f.get("url", "") or ""
                    mime = (f.get("mimetype", "") or "").lower()
                    if not url:
                        continue

                    is_video = "video" in mime or any(
                        url.lower().endswith(ext)
                        for ext in (".mp4", ".mov", ".avi", ".webm")
                    )
                    is_image = "image" in mime or any(
                        url.lower().endswith(ext)
                        for ext in (".jpg", ".jpeg", ".png", ".tif")
                    )

                    if kind == "video" and not is_video:
                        continue
                    if kind == "image" and not is_image:
                        continue
                    if not is_video and not is_image:
                        continue

                    full_url = url if url.startswith("http") else f"https://www.loc.gov{url}"

                    out.append(
                        Candidate(
                            source=self.name,
                            source_id=f"loc_{hash(full_url) & 0xFFFFFFFF:08x}",
                            source_url=source_url,
                            download_url=full_url,
                            kind="video" if is_video else "image",
                            width=int(f.get("width") or 0),
                            height=int(f.get("height") or 0),
                            duration=0.0,  # LoC doesn't expose duration in search
                            creator="Library of Congress",
                            license=lic,
                            source_tags=source_tags,
                            thumbnail_url=image_url,
                            extra={
                                "item_id": item_id,
                                "mime": mime,
                            },
                        )
                    )

        # If no resources found but we have an image_url for image kind
        if not out and kind in ("image", "any") and image_url:
            full_url = image_url if image_url.startswith("http") else f"https://www.loc.gov{image_url}"
            out.append(
                Candidate(
                    source=self.name,
                    source_id=f"loc_{hash(full_url) & 0xFFFFFFFF:08x}",
                    source_url=source_url,
                    download_url=full_url,
                    kind="image",
                    width=0,
                    height=0,
                    duration=0.0,
                    creator="Library of Congress",
                    license=lic,
                    source_tags=source_tags,
                    thumbnail_url=image_url,
                    extra={"item_id": item_id},
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


class LocVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "loc"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "loc"
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
            source = LibraryOfCongressSource()
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
        source = LibraryOfCongressSource()

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
