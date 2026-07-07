"""Mixkit (by Envato) stock video source adapter.

Scrapes the Mixkit website (``mixkit.co``) for free stock video clips.
Mixkit offers curated, high-quality footage (HD and 4K) under a free
licence with no attribution required. The library is smaller than
Pixabay/Pexels but has higher average quality due to Envato's curation.

No API available — this adapter scrapes Mixkit search pages.

What Mixkit is good for
-----------------------
- High-quality curated B-roll (nature, business, technology, lifestyle)
- Clean, modern footage with consistent quality
- No-attribution-needed clips for quick gap-fills
- Nature and landscape establishing shots
"""
from __future__ import annotations

import logging
from pathlib import Path

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

_SEARCH_URL = "https://mixkit.co/free-stock-video/"
_LICENSE = "Mixkit License (free for commercial and personal use, no attribution required)"


class MixkitSource:
    """Mixkit video adapter. Satisfies `StockSource`."""

    name = "mixkit"
    display_name = "Mixkit"
    provider = "envato"
    priority = 19
    install_instructions = (
        "Mixkit works without an API key. Scrapes the Mixkit website. "
        "Requires beautifulsoup4: pip install beautifulsoup4"
    )

    def is_available(self) -> bool:
        try:
            import bs4  # noqa: F401
            return True
        except ImportError:
            return False

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        import httpx
        from bs4 import BeautifulSoup

        kind = (filters.kind or "video").lower()
        if kind == "image":
            return []

        # Mixkit search URL pattern
        slug = query.lower().replace(" ", "-")
        search_url = f"https://mixkit.co/free-stock-video/{slug}/"

        try:
            r = httpx.get(
                search_url,
                timeout=30,
                headers={"User-Agent": "OpenMontage/1.0"},
            )
            r.raise_for_status()
        except Exception as e:
            _log.warning("Mixkit search failed: %s", e)
            return []

        soup = BeautifulSoup(r.text, "html.parser")
        out: list[Candidate] = []

        # Mixkit lists video cards with preview videos and download links
        cards = soup.select(".item-grid__item, .video-item, article, [class*='VideoCard']")
        for card in cards[:filters.per_page]:
            link_el = card.select_one("a[href]")
            if not link_el:
                continue

            href = link_el.get("href", "")
            if not href:
                continue
            if not href.startswith("http"):
                href = f"https://mixkit.co{href}"

            # Skip non-video links
            if "/free-stock-video/" not in href and "/video/" not in href:
                continue

            title = ""
            title_el = card.select_one("h3, h2, .title, [class*='title']")
            if title_el:
                title = title_el.get_text(strip=True)
            if not title:
                title = link_el.get_text(strip=True)

            # Thumbnail
            thumb = ""
            img_el = card.select_one("img")
            if img_el:
                thumb = img_el.get("src", "") or img_el.get("data-src", "") or ""

            # Video preview
            video_el = card.select_one("video source[src], video[src]")
            preview_url = ""
            if video_el:
                preview_url = video_el.get("src", "") or ""

            # Extract ID from URL
            clip_id = href.rstrip("/").rsplit("/", 1)[-1] if href else ""

            out.append(
                Candidate(
                    source=self.name,
                    source_id=f"mixkit_{clip_id}",
                    source_url=href,
                    download_url=href,  # Resolved in download()
                    kind="video",
                    width=0,
                    height=0,
                    duration=0.0,
                    creator="Mixkit",
                    license=_LICENSE,
                    source_tags=f"{title} {query}",
                    thumbnail_url=thumb,
                    extra={
                        "detail_url": href,
                        "preview_url": preview_url,
                    },
                )
            )

        return out

    def download(self, candidate: Candidate, out_path: Path) -> Path:
        """Download by resolving the detail page for the actual download URL."""
        import httpx
        from bs4 import BeautifulSoup

        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        detail_url = candidate.extra.get("detail_url", candidate.download_url)

        # Direct media URL
        if any(detail_url.lower().endswith(ext) for ext in (".mp4", ".mov", ".webm")):
            return self._stream_download(detail_url, out_path)

        try:
            r = httpx.get(
                detail_url, timeout=30,
                headers={"User-Agent": "OpenMontage/1.0"},
            )
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")

            download_url = None

            # Look for download button/link
            for a in soup.select("a[href]"):
                href = a.get("href", "")
                text = (a.get_text(strip=True) or "").lower()
                classes = " ".join(a.get("class", []))
                if "download" in text or "download" in classes:
                    if href and any(ext in href.lower() for ext in [".mp4", ".mov", ".webm"]):
                        download_url = href
                        break
                    elif href and "/download/" in href:
                        download_url = href
                        break

            # Look for video source tags
            if not download_url:
                for source in soup.select("video source[src]"):
                    src = source.get("src", "")
                    if src and any(ext in src.lower() for ext in [".mp4", ".mov"]):
                        download_url = src
                        break

            # Look for data attributes with video URLs
            if not download_url:
                for el in soup.select("[data-video-url], [data-download-url], [data-src]"):
                    url = el.get("data-video-url") or el.get("data-download-url") or el.get("data-src") or ""
                    if url and any(ext in url.lower() for ext in [".mp4", ".mov"]):
                        download_url = url
                        break

            if not download_url:
                raise ValueError(f"Could not find download URL on Mixkit page: {detail_url}")

            if not download_url.startswith("http"):
                download_url = f"https://mixkit.co{download_url}"

            return self._stream_download(download_url, out_path)

        except Exception as e:
            raise RuntimeError(f"Mixkit download failed for {detail_url}: {e}") from e

    def _stream_download(self, url: str, out_path: Path) -> Path:
        import httpx

        with httpx.get(
            url, stream=True, timeout=120,
            headers={"User-Agent": "OpenMontage/1.0"},
        ) as r:
            r.raise_for_status()
            with open(out_path, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    if chunk:
                        f.write(chunk)
        return out_path


class MixkitVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "mixkit"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "mixkit"
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
            source = MixkitSource()
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
        source = MixkitSource()

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
