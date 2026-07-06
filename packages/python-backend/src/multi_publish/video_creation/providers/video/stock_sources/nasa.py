"""NASA Image and Video Library adapter.

Wraps ``images-api.nasa.gov`` behind the `StockSource` protocol. NASA's
catalogue is the best free source of space, mission, Earth-observation,
and scientific-visualisation footage and stills. Everything on
images.nasa.gov is free to use (public domain / NASA-created), with the
caveat that third-party material occasionally sneaks in via partner
missions — we record that caveat in the licence field and trust the
user to vet before publishing.

No API key required. An optional `NASA_API_KEY` increases rate limits
but is not part of this adapter's availability check — the default
`DEMO_KEY` path handles typical corpus-building loads.

Fetch pattern
-------------
Like `archive_org`, this is a two-stage fetch. The search endpoint
returns items with an `href` pointing at a per-item asset manifest (a
plain JSON array of file URLs). We follow that manifest to pick the
best rendition and build a `Candidate` with a ready-to-use
`download_url`. One extra HTTP call per hit.

What NASA is good for
---------------------
- space missions, rockets, astronauts,
- Earth observation (weather, city lights, glaciers, hurricanes),
- planetary-science animation,
- historical aeronautics (NACA, shuttle era),
- any "tiny human on a big planet" interstitial.

What it is *not* good for: most documentary subjects that live on
Earth at human scale. For a "walking home" montage this adapter will
contribute atmosphere shots at best (sunrise over Earth, city lights
from orbit) — the core material comes from Pexels and Archive.org.
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
import re
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, urlparse, urlunparse

from .base import Candidate, SearchFilters


_SEARCH_URL = "https://images-api.nasa.gov/search"
_UNSAFE_ID_CHARS = re.compile(r"[^A-Za-z0-9._\-]+")


class NasaSource:
    """Adapter for images.nasa.gov.

    Satisfies `StockSource`. Stateless, no required credentials.
    """

    name = "nasa"
    display_name = "NASA"
    provider = "nasa"
    priority = 30
    install_instructions = (
        "No setup required. NASA media search works without an API key; "
        "NASA_API_KEY is optional for higher rate limits."
    )

    def is_available(self) -> bool:
        # The public API is unauthenticated; as long as the network is
        # reachable we're available. `NASA_API_KEY` is optional and
        # only affects rate limiting.
        return True

    # ------------------------------------------------------------------
    # Public protocol
    # ------------------------------------------------------------------

    def search(self, query: str, filters: SearchFilters) -> list[Candidate]:
        """Search NASA's media library for images and/or videos.

        Routes by `filters.kind`:
            "video"  → `media_type=video`
            "image"  → `media_type=image`
            "any"    → both (NASA accepts repeated ``media_type`` params)
        """
        import httpx  # lazy

        kind = (filters.kind or "video").lower()
        media_types: list[str] = []
        if kind in ("video", "any"):
            media_types.append("video")
        if kind in ("image", "any"):
            media_types.append("image")
        if not media_types:
            return []

        params: list[tuple[str, str]] = [("q", query)]
        for mt in media_types:
            params.append(("media_type", mt))
        # NASA uses `page_size` (max 100) and `page` (1-indexed).
        params.append(("page_size", str(max(1, min(filters.per_page, 100)))))
        params.append(("page", str(max(1, filters.page))))

        r = httpx.get(_SEARCH_URL, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        items = ((data.get("collection") or {}).get("items") or [])

        out: list[Candidate] = []
        for item in items:
            cand = self._hydrate_candidate(item, filters)
            if cand is not None:
                out.append(cand)
        return out

    def download(self, candidate: Candidate, out_path: Path) -> Path:
        """Stream the candidate's file to `out_path`.

        Same pattern as the other adapters.
        """
        import httpx  # lazy

        if not candidate.download_url:
            raise ValueError(
                f"Candidate {candidate.clip_id} has no download_url"
            )

        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        with httpx.get(
            candidate.download_url, stream=True, timeout=300
        ) as r:
            r.raise_for_status()
            with open(out_path, "wb") as f:
                for chunk in r.iter_bytes(1 << 16):
                    if chunk:
                        f.write(chunk)
        return out_path

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _hydrate_candidate(
        self, item: dict, filters: SearchFilters
    ) -> Optional[Candidate]:
        """Turn a search-result item into a Candidate with a download URL.

        Fetches the per-item asset manifest (``item['href']`` is a
        plain JSON array of file URLs) and picks the best rendition.
        Returns None if the manifest is empty or no playable file
        exists.
        """
        import httpx  # lazy

        data_list = item.get("data") or []
        if not data_list:
            return None
        meta = data_list[0]

        nasa_id = meta.get("nasa_id")
        media_type = (meta.get("media_type") or "").lower()
        if not nasa_id or media_type not in ("video", "image"):
            return None

        asset_href = item.get("href")
        if not asset_href:
            return None

        try:
            r = httpx.get(asset_href, timeout=30)
            r.raise_for_status()
            file_urls = r.json()
        except Exception:
            return None

        if not isinstance(file_urls, list) or not file_urls:
            return None

        if media_type == "video":
            download_url = _pick_video_url(file_urls)
        else:
            download_url = _pick_image_url(file_urls)
        if not download_url:
            return None
        # NASA asset URLs sometimes contain unencoded spaces and other
        # characters (especially older items whose nasa_id is a title).
        # URL-encode the path component so `requests.get` handles them.
        download_url = _encode_url_path(download_url)

        # NASA doesn't give us dimensions or duration on the search
        # result. Width/height default to 0 and the corpus builder is
        # expected to probe post-download. Duration is 0 for both
        # images and (unfortunately) videos.
        width = 0
        height = 0
        duration = 0.0

        # Filters that need dims/duration can't apply here. Skipping
        # them is the honest thing — "unknown" should not be rejected.

        title = (meta.get("title") or "").strip()
        description = (meta.get("description") or "").strip()
        keywords = meta.get("keywords") or []
        if isinstance(keywords, list):
            kw_text = " ".join(str(k) for k in keywords if k)
        else:
            kw_text = str(keywords)
        source_tags = " ".join(
            s for s in (title, description, kw_text) if s
        ).strip()
        if len(source_tags) > 500:
            source_tags = source_tags[:500]

        # Thumbnail: NASA exposes a "preview" link in item["links"]
        thumbnail_url = ""
        for link in item.get("links") or []:
            if (link or {}).get("rel") == "preview":
                thumbnail_url = link.get("href", "") or ""
                break

        creator = (meta.get("photographer") or meta.get("center") or "").strip()

        safe_id = _sanitize_source_id(nasa_id)
        return Candidate(
            source=self.name,
            source_id=safe_id,
            source_url=f"https://images.nasa.gov/details/{quote(nasa_id, safe='')}",
            download_url=download_url,
            kind=media_type,
            width=width,
            height=height,
            duration=duration,
            creator=creator,
            license="NASA Media Usage Guidelines (public domain with caveats)",
            source_tags=source_tags,
            thumbnail_url=thumbnail_url,
            extra={
                "center": meta.get("center"),
                "date_created": meta.get("date_created"),
                "secondary_creator": meta.get("secondary_creator"),
            },
        )


# ----------------------------------------------------------------------
# Module-level helpers
# ----------------------------------------------------------------------


def _pick_video_url(file_urls: list[str]) -> str:
    """Pick the best video rendition from a NASA asset manifest.

    NASA file URLs follow a ``<nasa_id>~<tag>.<ext>`` naming convention
    where tag is one of: ``orig``, ``large``, ``medium``, ``small``,
    ``preview``, ``thumb``. Preference order (best quality first):
    orig → large → medium → small. We skip previews and thumbnails.
    """
    priority = ("orig", "large", "medium", "small")
    buckets: dict[str, list[str]] = {p: [] for p in priority}
    for url in file_urls:
        lower = url.lower()
        if not lower.endswith((".mp4", ".mov", ".m4v")):
            continue
        for p in priority:
            if f"~{p}." in lower:
                buckets[p].append(url)
                break
    for p in priority:
        if buckets[p]:
            return buckets[p][0]
    # Fallback: any mp4 at all
    for url in file_urls:
        if url.lower().endswith(".mp4"):
            return url
    return ""


def _pick_image_url(file_urls: list[str]) -> str:
    """Pick the best image rendition from a NASA asset manifest.

    Same pattern as videos but for .jpg/.png/.tif. Prefer ``orig``,
    fall back to ``large``. We skip ``thumb`` and ``small`` because
    they're too low-res for CLIP embedding quality.
    """
    priority = ("orig", "large", "medium")
    buckets: dict[str, list[str]] = {p: [] for p in priority}
    for url in file_urls:
        lower = url.lower()
        if not lower.endswith((".jpg", ".jpeg", ".png", ".tif", ".tiff")):
            continue
        for p in priority:
            if f"~{p}." in lower:
                buckets[p].append(url)
                break
    for p in priority:
        if buckets[p]:
            return buckets[p][0]
    # Fallback: any jpg/png
    for url in file_urls:
        if url.lower().endswith((".jpg", ".jpeg", ".png")):
            return url
    return ""


def _sanitize_source_id(raw: str) -> str:
    """Collapse arbitrary NASA nasa_ids into a filesystem-safe token.

    Some older items use their title as the nasa_id, which means the
    raw string contains spaces, apostrophes, en-dashes, and other
    characters that break file paths and command-line tooling. We
    replace anything outside ``[A-Za-z0-9._-]`` with an underscore,
    collapse runs, and strip edges. Length is capped at 120 chars so
    the resulting clip_id stays well under filesystem limits.
    """
    if not raw:
        return "unknown"
    cleaned = _UNSAFE_ID_CHARS.sub("_", raw.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_.")
    if not cleaned:
        return "unknown"
    return cleaned[:120]


def _encode_url_path(url: str) -> str:
    """URL-encode the path component of a URL, leaving the host alone.

    NASA occasionally returns asset URLs whose path literally contains
    spaces and unicode — those will 400 if passed unquoted to
    ``requests.get``. We use ``urllib.parse`` to surgically re-encode
    only the path segment without double-encoding the scheme/host.
    """
    try:
        parts = urlparse(url)
    except Exception:
        return url
    safe_path = quote(parts.path, safe="/")
    return urlunparse(parts._replace(path=safe_path))


class NasaVideo(BaseTool):
    """Stock media source adapter wrapped as a BaseTool."""
    name = "nasa"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "stock_video"
    provider = "nasa"
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
            source = NasaSource()
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
        source = NasaSource()
        
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
