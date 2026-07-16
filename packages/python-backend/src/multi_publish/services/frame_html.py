# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""HTML-based Frame Generator Service.

Renders HTML templates to frame images using Playwright. Migrated from
Pixelle-Video (Apache 2.0) to Multi-Publish.

Features:
- Jinja2-style variable substitution with DSL: ``{{ param:type=default }}``
- HTML sanitization: all values HTML-escaped to prevent XSS
- Playwright async screenshot capture
- Template parameter parsing (text, number, color, bool types)
"""
from __future__ import annotations

import asyncio
import html
import os
import re
import uuid
from pathlib import Path
from typing import Any, Optional

from loguru import logger

from playwright.async_api import async_playwright

# ─── Module-level constants ────────────────────────────────

# Templates directory: python-backend/templates/
# __file__ = src/multi_publish/services/frame_html.py → parent^4 = python-backend/
TEMPLATES_DIR = Path(__file__).parent.parent.parent.parent / "templates"

# Preset parameter names (not parsed as custom params)
_PRESET_PARAMS = {"title", "content", "image_path", "index"}

# Parameter DSL pattern: {{ param:type=default }} (supports optional whitespace)
_PARAM_PATTERN = r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-z]+))?(?:=([^}]+))?\s*\}\}"

# Size pattern: matches "WxH" where W and H are digits
_SIZE_PATTERN = re.compile(r"(\d+)x(\d+)")

_VALID_TYPES = {"text", "number", "color", "bool"}


# ─── Utility functions ─────────────────────────────────────


def parse_template_size(template_path: str) -> Optional[tuple[int, int]]:
    """Parse ``WxH`` size from a template path or size string.

    Returns ``(width, height)`` or ``None`` if no match.
    """
    match = _SIZE_PATTERN.search(template_path)
    if match:
        return int(match.group(1)), int(match.group(2))
    return None


def get_template_type(template_path: str) -> str:
    """Determine template type from filename prefix.

    - ``static_*.html`` → ``"static"``
    - ``image_*.html``  → ``"image"``
    - ``video_*.html``  → ``"video"``
    - ``default.html`` or no prefix → ``"image"``
    """
    name = Path(template_path).stem.lower()
    if name.startswith("static_"):
        return "static"
    if name.startswith("image_"):
        return "image"
    if name.startswith("video_"):
        return "video"
    return "image"


def resolve_template_path(template_name: str) -> Path:
    """Resolve a template name (e.g. ``"1080x1920/default"``) to a full path.

    Falls back to ``default.html`` if the specified template doesn't exist.

    Raises:
        FileNotFoundError: If the size directory doesn't exist.
    """
    if template_name.endswith(".html"):
        template_name = template_name[:-5]

    parts = template_name.split("/", 1)
    if len(parts) != 2:
        raise FileNotFoundError(
            f"Invalid template name format: '{template_name}'. Expected 'WxH/name'."
        )

    size, name = parts
    size_dir = TEMPLATES_DIR / size
    if not size_dir.exists():
        raise FileNotFoundError(f"Template size directory not found: {size}")

    candidate = size_dir / f"{name}.html"
    if candidate.exists():
        return candidate

    default_path = size_dir / "default.html"
    if default_path.exists():
        logger.debug(f"Template '{name}' not found in {size}, falling back to default.html")
        return default_path

    raise FileNotFoundError(f"No template found in {size}")


# ─── HTMLFrameGenerator ────────────────────────────────────


class HTMLFrameGenerator:
    """HTML-based frame generator.

    Renders HTML templates to frame images with variable substitution.
    Uses Playwright for headless browser rendering. All variable values
    are HTML-escaped to prevent script injection (XSS).
    """

    _browser = None
    _playwright = None
    _browser_loop = None

    def __init__(self, template_path: str):
        """Initialize with path to HTML template file."""
        self.template_path = template_path
        self.template = self._load_template(template_path)

        size = parse_template_size(template_path)
        if size is None:
            raise ValueError(f"Could not parse size from template path: {template_path}")
        self.width, self.height = size

        logger.debug(f"Loaded HTML template: {template_path} (size: {self.width}x{self.height})")

    def _load_template(self, template_path: str) -> str:
        """Load HTML template from file."""
        path = Path(template_path)
        if not path.exists():
            raise FileNotFoundError(f"Template not found: {template_path}")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        logger.debug(f"Template loaded: {len(content)} chars")
        return content

    # ─── Parameter parsing ────────────────────────────────

    def parse_template_parameters(self) -> dict[str, dict[str, Any]]:
        """Parse custom parameters from HTML template.

        Supports DSL syntax: ``{{param:type=default}}``.
        Preset params (``title``, ``content``, ``image_path``, ``index``) excluded.

        Returns dict: ``{name: {"type": str, "default": Any, "label": str}}``.
        """
        params: dict[str, dict[str, Any]] = {}

        for match in re.finditer(_PARAM_PATTERN, self.template):
            param_name = match.group(1)
            param_type = match.group(2) or "text"
            default_value = match.group(3)

            if param_name in _PRESET_PARAMS:
                continue
            if param_name in params:
                continue

            if param_type not in _VALID_TYPES:
                logger.warning(f"Unknown type '{param_type}' for '{param_name}', defaulting to 'text'")
                param_type = "text"

            params[param_name] = {
                "type": param_type,
                "default": self._parse_default_value(param_type, default_value),
                "label": param_name,
            }

        if params:
            logger.debug(f"Parsed {len(params)} custom parameter(s): {list(params.keys())}")
        return params

    def _parse_default_value(self, param_type: str, value_str: Optional[str]) -> Any:
        """Parse default value based on parameter type."""
        if value_str is None:
            return {"text": "", "number": 0, "color": "#000000", "bool": False}.get(param_type, "")

        if param_type == "number":
            try:
                return float(value_str) if "." in value_str else int(value_str)
            except ValueError:
                logger.warning(f"Invalid number value '{value_str}', using 0")
                return 0

        if param_type == "bool":
            return value_str.lower() in {"true", "1", "yes", "on"}

        if param_type == "color":
            return value_str if value_str.startswith("#") else f"#{value_str}"

        return value_str  # text

    # ─── Variable substitution ────────────────────────────

    def _replace_parameters(self, html_content: str, values: dict[str, Any]) -> str:
        """Replace parameter placeholders with HTML-escaped values.

        All values are HTML-escaped to prevent XSS. Supports DSL syntax.
        If value provided → use it (escaped). Otherwise → use default (escaped).
        If no default → empty string.
        """

        def replacer(match: re.Match) -> str:
            param_name = match.group(1)
            default_value_str = match.group(3)

            if param_name in values:
                value = values[param_name]
                if isinstance(value, bool):
                    return "true" if value else "false"
                if value is None:
                    return ""
                return html.escape(str(value), quote=True)

            if default_value_str is not None:
                return html.escape(default_value_str, quote=True)

            return ""

        return re.sub(_PARAM_PATTERN, replacer, html_content)

    # ─── Media size ────────────────────────────────────────

    def _parse_media_size_from_meta(self) -> tuple[Optional[int], Optional[int]]:
        """Parse media size from template meta tags. Returns (w, h) or (None, None)."""
        width_meta = re.search(
            r'<meta\s+name=["\']template:media-width["\']\s+content=["\'](\d+)["\']',
            self.template, re.IGNORECASE,
        )
        height_meta = re.search(
            r'<meta\s+name=["\']template:media-height["\']\s+content=["\'](\d+)["\']',
            self.template, re.IGNORECASE,
        )
        if width_meta and height_meta:
            w, h = int(width_meta.group(1)), int(height_meta.group(1))
            if w > 0 and h > 0:
                return w, h
        return None, None

    def get_media_size(self) -> tuple[int, int]:
        """Get media size from template meta tags. Falls back to (1024, 1024)."""
        media_width, media_height = self._parse_media_size_from_meta()
        if media_width and media_height:
            return media_width, media_height
        logger.warning(f"No media size meta tags in {self.template_path}, using 1024x1024")
        return 1024, 1024

    # ─── Playwright browser management ─────────────────────

    @classmethod
    async def _ensure_browser(cls):
        """Lazily initialize a shared Playwright browser instance."""
        current_loop = asyncio.get_running_loop()
        browser_usable = (
            cls._browser is not None
            and cls._browser_loop is current_loop
            and cls._browser.is_connected()
        )
        if not browser_usable:
            if cls._browser is not None and cls._browser_loop is not current_loop:
                logger.warning("Cross-loop Playwright browser reuse; recreating for current loop")
            cls._browser = None
            cls._playwright = None

            cls._playwright = await async_playwright().start()
            cls._browser = await cls._playwright.chromium.launch(
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions"]
            )
            cls._browser_loop = current_loop
            logger.debug("Initialized Playwright Chromium browser")
        return cls._browser

    @classmethod
    async def _reset_browser(cls):
        """Best-effort reset for stale or broken Playwright connections."""
        if cls._browser:
            try:
                if cls._browser.is_connected():
                    await asyncio.wait_for(cls._browser.close(), timeout=5)
            except Exception as e:
                logger.debug(f"Ignoring error closing stale browser: {e}")
            finally:
                cls._browser = None
        if cls._playwright:
            try:
                await asyncio.wait_for(cls._playwright.stop(), timeout=5)
            except Exception as e:
                logger.debug(f"Ignoring error stopping stale Playwright: {e}")
            finally:
                cls._playwright = None
                cls._browser_loop = None

    @classmethod
    async def close_browser(cls):
        """Shutdown the shared browser instance (call on app teardown)."""
        if cls._browser:
            try:
                await cls._browser.close()
            except Exception as e:
                logger.debug(f"Ignoring error closing browser: {e}")
            cls._browser = None
            cls._browser_loop = None
        if cls._playwright:
            try:
                await cls._playwright.stop()
            except Exception as e:
                logger.debug(f"Ignoring error stopping Playwright: {e}")
            cls._playwright = None
            logger.debug("Playwright browser closed")

    # ─── Frame generation ──────────────────────────────────

    async def generate_frame(
        self,
        title: str,
        content: str,
        image_path: str = "",
        ext: Optional[dict[str, Any]] = None,
        output_path: Optional[str] = None,
    ) -> str:
        """Generate a frame image from HTML template.

        All variable values are HTML-escaped to prevent XSS.

        Args:
            title: Frame title text.
            content: Frame content/narration text.
            image_path: Path to image (relative, absolute, HTTP URL, or empty).
            ext: Additional parameters (custom params, index, etc.).
            output_path: Custom output path (auto-generated if None).

        Returns:
            Path to generated frame image (PNG).
        """
        # Convert local image path to file:// URI
        if image_path and not image_path.startswith(("http://", "https://", "data:", "file://")):
            img = Path(image_path)
            if not img.is_absolute():
                img = Path.cwd() / image_path
            if not img.exists():
                logger.warning(f"Image file not found: {img}")
            else:
                image_path = img.as_uri()

        # Build context with all variables
        context: dict[str, Any] = {"title": title, "content": content, "image_path": image_path}
        if ext:
            context.update(ext)

        # Render HTML with variable substitution (values are HTML-escaped)
        rendered_html = self._replace_parameters(self.template, context)

        # Determine output path
        if output_path is None:
            output_path = str(Path.cwd() / f"frame_{uuid.uuid4().hex[:16]}.png")
        else:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

        logger.debug(f"Rendering HTML to {output_path} (size: {self.width}x{self.height})")

        page = None
        try:
            try:
                browser = await self._ensure_browser()
                page = await browser.new_page(
                    viewport={"width": self.width, "height": self.height},
                    device_scale_factor=1,
                )
            except Exception as e:
                logger.warning(f"Playwright browser failed, restarting once: {e}")
                await self._reset_browser()
                browser = await self._ensure_browser()
                page = await browser.new_page(
                    viewport={"width": self.width, "height": self.height},
                    device_scale_factor=1,
                )

            await page.set_content(rendered_html, wait_until="networkidle")
            await page.screenshot(path=output_path, type="png")

            logger.debug(f"Frame saved to: {output_path}")
            return output_path

        finally:
            if page:
                try:
                    await page.close()
                except Exception as e:
                    logger.debug(f"Ignoring error closing page: {e}")
