"""Diagram generation tool using Mermaid CLI, Cairo/Pillow, or Graphviz.

Adapted from OpenMontage tools/graphics/diagram_gen.py.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolStability,
    ToolStatus,
    ToolTier,
)


class DiagramGen(BaseTool):
    name = "diagram_gen"
    version = "0.1.0"
    tier = ToolTier.CORE
    capability = "graphics"
    provider = "mermaid"
    stability = ToolStability.EXPERIMENTAL
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC

    dependencies = []
    install_instructions = (
        "For Mermaid diagrams:\n"
        "  npm install -g @mermaid-js/mermaid-cli\n"
        "For Pillow-based diagrams (fallback):\n"
        "  pip install Pillow"
    )

    capabilities = ["generate_mermaid", "generate_flowchart", "generate_box_diagram"]
    best_for = [
        "technical architecture diagrams",
        "flowcharts and sequence diagrams",
        "quick visual mockups of component relationships",
    ]
    not_good_for = [
        "complex custom illustrations",
        "photorealistic output",
    ]

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50)
    idempotency_key_fields = ["diagram_type", "definition", "boxes"]

    def get_status(self) -> ToolStatus:
        if self._has_mermaid() or self._has_pillow():
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def _has_mermaid(self) -> bool:
        return shutil.which("mmdc") is not None

    def _has_pillow(self) -> bool:
        try:
            from PIL import Image  # noqa: F401
            return True
        except ImportError:
            return False

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        diagram_type = inputs["diagram_type"]
        start = time.time()

        try:
            if diagram_type == "mermaid":
                result = self._render_mermaid(inputs)
            elif diagram_type in ("flowchart", "boxes"):
                result = self._render_boxes(inputs)
            else:
                return ToolResult(success=False, error=f"Unknown diagram type: {diagram_type}")
        except Exception as e:
            return ToolResult(success=False, error=f"Diagram generation failed: {e}")

        result.duration_seconds = round(time.time() - start, 2)
        return result

    def _render_mermaid(self, inputs: dict[str, Any]) -> ToolResult:
        definition = inputs.get("definition", "")
        if not definition:
            return ToolResult(success=False, error="Mermaid definition required")

        output_path = Path(inputs.get("output_path", "diagram.png"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        theme = inputs.get("theme", "dark")

        if self._has_mermaid():
            temp_mmd = output_path.with_suffix(".mmd")
            temp_mmd.write_text(definition, encoding="utf-8")

            config = {"theme": theme}
            config_path = output_path.with_suffix(".json")
            config_path.write_text(json.dumps(config), encoding="utf-8")

            self.run_command([
                "mmdc",
                "-i", str(temp_mmd),
                "-o", str(output_path),
                "-w", str(inputs.get("width", 1200)),
                "-H", str(inputs.get("height", 800)),
                "-c", str(config_path),
            ])

            temp_mmd.unlink(missing_ok=True)
            config_path.unlink(missing_ok=True)

            return ToolResult(
                success=True,
                data={"method": "mermaid", "output": str(output_path)},
                artifacts=[str(output_path)],
            )

        # Fallback: render as text card
        return self._render_text_card(definition, inputs)

    def _render_boxes(self, inputs: dict[str, Any]) -> ToolResult:
        if not self._has_pillow():
            return ToolResult(
                success=False,
                error="Pillow required for box diagrams. Run: pip install Pillow",
            )

        from PIL import Image, ImageDraw, ImageFont

        output_path = Path(inputs.get("output_path", "diagram.png"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        width = inputs.get("width", 800)
        height = inputs.get("height", 600)
        title = inputs.get("title")
        boxes = inputs.get("boxes", [])
        connections = inputs.get("connections", [])

        theme = inputs.get("theme", "dark")
        if theme == "light":
            bg, text_color, box_default, line_color = "#ffffff", "#333333", "#e1e4e8", "#0366d6"
        else:
            bg, text_color, box_default, line_color = "#2d2d2d", "#d4d4d4", "#404040", "#569cd6"

        img = Image.new("RGB", (width, height), bg)
        draw = ImageDraw.Draw(img)

        try:
            font = ImageFont.truetype("arial.ttf", 18)
            title_font = ImageFont.truetype("arial.ttf", 24)
        except (IOError, OSError):
            font = ImageFont.load_default()
            title_font = font

        y_offset = 20
        if title:
            bbox = draw.textbbox((0, 0), title, font=title_font)
            tw = bbox[2] - bbox[0]
            draw.text(((width - tw) // 2, y_offset), title, fill=text_color, font=title_font)
            y_offset += 50

        if not boxes:
            boxes = [{"label": "Empty"}]

        cols = min(len(boxes), 4)
        rows = (len(boxes) + cols - 1) // cols
        box_w = min(200, (width - 80) // cols - 20)
        box_h = 60
        x_gap = (width - cols * box_w) // (cols + 1)
        y_gap = max(40, (height - y_offset - rows * box_h) // (rows + 1))

        box_positions = []
        for i, box in enumerate(boxes):
            col = i % cols
            row = i // cols
            x = x_gap + col * (box_w + x_gap)
            y = y_offset + y_gap + row * (box_h + y_gap)

            fill = box.get("color", box_default)
            draw.rounded_rectangle(
                [(x, y), (x + box_w, y + box_h)],
                radius=8, fill=fill, outline=line_color, width=2,
            )

            label = box.get("label", f"Box {i}")
            bbox = draw.textbbox((0, 0), label, font=font)
            lw = bbox[2] - bbox[0]
            lh = bbox[3] - bbox[1]
            draw.text((x + (box_w - lw) // 2, y + (box_h - lh) // 2), label, fill=text_color, font=font)

            box_positions.append((x, y, x + box_w, y + box_h))

        for conn in connections:
            fi = conn.get("from", 0)
            ti = conn.get("to", 0)
            if fi >= len(box_positions) or ti >= len(box_positions):
                continue

            fx1, fy1, fx2, fy2 = box_positions[fi]
            tx1, ty1, tx2, ty2 = box_positions[ti]
            start_x, start_y = (fx1 + fx2) // 2, fy2
            end_x, end_y = (tx1 + tx2) // 2, ty1

            draw.line([(start_x, start_y), (end_x, end_y)], fill=line_color, width=2)
            arrow_size = 8
            draw.polygon(
                [(end_x, end_y), (end_x - arrow_size, end_y - arrow_size * 2),
                 (end_x + arrow_size, end_y - arrow_size * 2)],
                fill=line_color,
            )

            conn_label = conn.get("label")
            if conn_label:
                mid_x, mid_y = (start_x + end_x) // 2, (start_y + end_y) // 2
                draw.text((mid_x + 5, mid_y - 10), conn_label, fill=text_color, font=font)

        img.save(output_path)

        return ToolResult(
            success=True,
            data={
                "method": "pillow",
                "output": str(output_path),
                "box_count": len(boxes),
                "connection_count": len(connections),
            },
            artifacts=[str(output_path)],
        )

    def _render_text_card(self, text: str, inputs: dict[str, Any]) -> ToolResult:
        if not self._has_pillow():
            return ToolResult(
                success=False,
                error="Pillow required. Run: pip install Pillow",
            )

        from PIL import Image, ImageDraw, ImageFont

        output_path = Path(inputs.get("output_path", "diagram.png"))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        width = inputs.get("width", 800)

        try:
            font = ImageFont.truetype("consola.ttf", 16)
        except (IOError, OSError):
            font = ImageFont.load_default()

        lines = text.split("\n")
        line_height = 22
        height = max(200, len(lines) * line_height + 80)

        img = Image.new("RGB", (width, height), "#1e1e2e")
        draw = ImageDraw.Draw(img)
        y = 40
        for line in lines:
            draw.text((40, y), line, fill="#cdd6f4", font=font)
            y += line_height

        img.save(output_path)

        return ToolResult(
            success=True,
            data={"method": "text_card", "output": str(output_path)},
            artifacts=[str(output_path)],
        )
