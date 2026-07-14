"""HyperFrames composition tool — HTML/CSS/GSAP render path.

Sibling to `video_compose` (FFmpeg + Remotion). This tool owns the HyperFrames
runtime end-to-end: workspace materialization, `hyperframes lint`,
`hyperframes validate`, and `hyperframes render`. It is invoked by
`video_compose` when `edit_decisions.render_runtime == "hyperframes"`, and
can also be called directly by pipelines that want HyperFrames-specific
operations (lint-only, validate-only, scaffold-only).

This tool deliberately does NOT attempt parity with every Remotion scene
component. See `skills/core/hyperframes.md` for what is in scope in Phase 1
and what remains Remotion-only.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from multi_publish.video_creation.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ResumeSupport,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)
from multi_publish.video_creation.providers.video.hf_html_gen import (
    cut_to_html as _module_cut_to_html,
)
from multi_publish.video_creation.providers.video.hf_html_gen import (
    generate_index_html as _module_generate_index_html,
)
from multi_publish.video_creation.providers.video.hf_utils import (
    compute_total_duration,
    escape_text,
    is_inside,
    node_major_version,
    parse_json_output,
    rel_from_workspace,
    require_workspace,
)

log = logging.getLogger("hyperframes_compose")


class HyperFramesCompose(BaseTool):
    name = "hyperframes_compose"
    version = "0.1.0"
    tier = ToolTier.CORE
    capability = "video_post"
    provider = "hyperframes"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = ["cmd:npx", "cmd:ffmpeg"]
    install_instructions = (
        "Requires Node.js >= 22 (https://nodejs.org/) and FFmpeg "
        "(https://ffmpeg.org/download.html). The HyperFrames CLI is fetched "
        "on first use via `npx hyperframes` (npm package: `hyperframes`). "
        "Note: the upstream monorepo develops the package as `@hyperframes/cli`, "
        "but it publishes to npm as `hyperframes`. `npx @hyperframes/cli` "
        "returns 404 -- do NOT use that form. Verify setup with "
        "`npx hyperframes doctor` or run the `doctor` operation on this tool."
    )
    agent_skills = [
        "hyperframes",
        "hyperframes-cli",
        "hyperframes-registry",
        "website-to-hyperframes",
        "gsap-core",
        "gsap-timeline",
    ]

    capabilities = [
        "hyperframes_render",
        "hyperframes_lint",
        "hyperframes_validate",
        "hyperframes_doctor",
        "scaffold_workspace",
        "add_block",
    ]

    best_for = [
        "HTML/CSS/GSAP composition: kinetic typography, product promos, launch reels",
        "Motion-graphics-heavy briefs where the scene library in remotion-composer/ doesn't fit",
        "Website-to-video / UI-driven compositions",
        "Registry-block-driven scenes (hyperframes add data-chart, grain-overlay, etc.)",
    ]
    not_good_for = [
        "Word-level caption burn (stays on Remotion in Phase 1)",
        "Avatar / lip-sync presenter (stays on Remotion in Phase 1)",
        "Existing React scene stack (text_card, stat_card, chart, comparison): reuse Remotion",
    ]
    fallback_tools = ["video_compose"]

    input_schema = {
        "type": "object",
        "required": ["operation"],
        "properties": {
            "operation": {
                "type": "string",
                "enum": [
                    "render",
                    "lint",
                    "validate",
                    "doctor",
                    "scaffold_workspace",
                    "add_block",
                ],
                "description": (
                    "render: materialize workspace + lint + validate + render to MP4. "
                    "lint: run `hyperframes lint` on an existing workspace. "
                    "validate: run `hyperframes validate` (browser-based). "
                    "doctor: run `hyperframes doctor` to check environment. "
                    "scaffold_workspace: materialize HTML/CSS/assets but do not render. "
                    "add_block: run `hyperframes add <name>` to install a registry "
                    "block or component into an existing workspace."
                ),
            },
            "block_name": {
                "type": "string",
                "description": (
                    "Registry block or component name for operation='add_block' "
                    "(e.g. 'data-chart', 'grain-overlay', 'shimmer-sweep'). "
                    "See https://hyperframes.heygen.com/catalog for the list."
                ),
            },
            "workspace_path": {
                "type": "string",
                "description": (
                    "Target HyperFrames workspace directory. Typically "
                    "`projects/<name>/hyperframes/`. Required for every op "
                    "except doctor."
                ),
            },
            "output_path": {
                "type": "string",
                "description": "Output MP4 path. Used by operation='render'.",
            },
            "edit_decisions": {
                "type": "object",
                "description": (
                    "Full edit_decisions artifact — required for render and "
                    "scaffold_workspace. Used to generate index.html + CSS."
                ),
            },
            "asset_manifest": {
                "type": "object",
                "description": (
                    "Full asset_manifest artifact — required for render and "
                    "scaffold_workspace. Used to resolve asset IDs to file paths."
                ),
            },
            "playbook": {
                "type": "object",
                "description": (
                    "Loaded playbook dict. Used to drive the style bridge "
                    "(CSS custom properties, typography, motion defaults)."
                ),
            },
            "profile": {
                "type": "string",
                "description": "Media profile name (youtube_landscape, tiktok_vertical, etc.).",
            },
            "quality": {
                "type": "string",
                "enum": ["draft", "standard", "high"],
                "default": "standard",
                "description": "Render quality. `draft` for iterating, `high` for delivery.",
            },
            "fps": {
                "type": "integer",
                "enum": [24, 30, 60],
                "default": 30,
            },
            "strict": {
                "type": "boolean",
                "default": False,
                "description": ("If true, fail the render on any lint error. Matches `hyperframes render --strict`."),
            },
            "skip_contrast": {
                "type": "boolean",
                "default": False,
                "description": (
                    "Skip the WCAG contrast audit during validate. Acceptable "
                    "while iterating; forbidden for final delivery."
                ),
            },
        },
    }

    resource_profile = ResourceProfile(cpu_cores=4, ram_mb=3072, vram_mb=0, disk_mb=2000, network_required=False)
    retry_policy = RetryPolicy(max_retries=0)
    resume_support = ResumeSupport.FROM_START
    idempotency_key_fields = ["operation", "workspace_path", "edit_decisions"]
    side_effects = [
        "writes HTML/CSS/JS files into workspace_path",
        "copies asset files into workspace_path/assets/",
        "writes MP4 to output_path",
    ]
    user_visible_verification = [
        "Play the rendered MP4 and verify scene pacing, typography, and audio",
        "Inspect workspace_path/index.html in a browser via `npx hyperframes preview`",
    ]

    # ------------------------------------------------------------------
    # Status / availability
    # ------------------------------------------------------------------

    _NODE_FLOOR_MAJOR = 22
    _NPM_PACKAGE = "hyperframes"  # published npm name (NOT @hyperframes/cli — that's 404)
    # Process-level cache for the npm resolve check. Shape:
    #   {"version": "0.4.5"}   → package resolves
    #   {"error": "<short>"}   → resolution failed (offline, unpublished, etc.)
    # We cache per-process so the first call pays ~2-5s and subsequent calls
    # (get_info spam from the registry) are free.
    _npm_resolve_cache: dict[str, str] | None = None

    @classmethod
    def _node_major_version(cls) -> int | None:
        """Return the major Node version (e.g. 18) or None if not found."""
        return node_major_version()

    def _resolve_npm_package(self) -> dict[str, str]:
        """Verify the `hyperframes` npm package actually resolves.

        `_runtime_check` previously only verified that node/ffmpeg/npx existed
        on PATH, which meant `runtime_available: True` on any machine with
        Node + FFmpeg — even offline, even if npm was down, even if the
        package was unpublished. This method performs a cheap
        `npm view hyperframes version` (5s timeout) and caches the answer
        for the rest of the process.

        Returns {"version": "X.Y.Z"} on success, {"error": "<short>"} on any
        failure (404, timeout, network error, npm missing). Never raises.
        """
        if self._npm_resolve_cache is not None:
            return self._npm_resolve_cache

        npm = shutil.which("npm")
        if not npm:
            self._npm_resolve_cache = {"error": "npm not on PATH"}
            return self._npm_resolve_cache

        try:
            proc = subprocess.run(
                [npm, "view", self._NPM_PACKAGE, "version"],
                capture_output=True,
                text=True,
                timeout=5,
            )
        except subprocess.TimeoutExpired:
            self._npm_resolve_cache = {"error": "timeout (5s) — offline or slow registry"}
            return self._npm_resolve_cache
        except (OSError, subprocess.SubprocessError) as e:
            self._npm_resolve_cache = {"error": f"npm view failed: {type(e).__name__}"}
            return self._npm_resolve_cache

        if proc.returncode != 0:
            stderr = (proc.stderr or "").strip()
            # Most common failure is 404 (package unpublished or name wrong).
            if "404" in stderr or "E404" in stderr:
                self._npm_resolve_cache = {"error": f"npm package `{self._NPM_PACKAGE}` not found (404)"}
            else:
                tail = stderr.splitlines()[-1][:200] if stderr else f"exit {proc.returncode}"
                self._npm_resolve_cache = {"error": f"npm view failed: {tail}"}
            return self._npm_resolve_cache

        version = (proc.stdout or "").strip()
        if not version:
            self._npm_resolve_cache = {"error": "npm view returned empty version"}
        else:
            self._npm_resolve_cache = {"version": version}
        return self._npm_resolve_cache

    def _runtime_check(self) -> dict[str, Any]:
        """Return availability state for the HyperFrames runtime.

        Checks BOTH local binaries (node >= 22, ffmpeg, npx) AND that the
        `hyperframes` npm package actually resolves. A missing/404 package
        counts as unavailable — `runtime_available: True` means the runtime
        can genuinely run end-to-end, not just that the local tooling exists.
        """
        node_major = self._node_major_version()
        ffmpeg_ok = shutil.which("ffmpeg") is not None
        npx_ok = shutil.which("npx") is not None

        reasons: list[str] = []
        if node_major is None:
            reasons.append("node not found on PATH")
        elif node_major < self._NODE_FLOOR_MAJOR:
            reasons.append(f"node major version {node_major} < required {self._NODE_FLOOR_MAJOR}")
        if not npx_ok:
            reasons.append("npx not found on PATH")
        if not ffmpeg_ok:
            reasons.append("ffmpeg not found on PATH")

        # Only probe npm if the local tooling is actually usable — otherwise
        # a missing-node run would also show a confusing npm error.
        npm_resolve: dict[str, str] = {}
        if not reasons:
            npm_resolve = self._resolve_npm_package()
            if "error" in npm_resolve:
                reasons.append(f"npm package `{self._NPM_PACKAGE}` not resolvable: {npm_resolve['error']}")

        return {
            "runtime_available": not reasons,
            "node_major": node_major,
            "ffmpeg_available": ffmpeg_ok,
            "npx_available": npx_ok,
            "npm_package": self._NPM_PACKAGE,
            "npm_package_version": npm_resolve.get("version"),
            "npm_resolve_error": npm_resolve.get("error"),
            "reasons": reasons,
        }

    def get_status(self) -> ToolStatus:
        check = self._runtime_check()
        return ToolStatus.AVAILABLE if check["runtime_available"] else ToolStatus.UNAVAILABLE

    def get_info(self) -> dict[str, Any]:
        info = super().get_info()
        check = self._runtime_check()
        info["hyperframes_runtime"] = check
        if not check["runtime_available"]:
            info["setup_offer"] = {
                "effort": (
                    "1-minute fix"
                    if check["npx_available"] and check["ffmpeg_available"]
                    else "5-minute fix (install Node 22+ and/or FFmpeg)"
                ),
                "install_instructions": self.install_instructions,
                "unlocks": (
                    "HTML/CSS/GSAP composition runtime — kinetic typography, "
                    "product promos, registry blocks, website-to-video."
                ),
            }
        return info

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        ed = inputs.get("edit_decisions") or {}
        cuts = ed.get("cuts", [])
        total = 0.0
        for c in cuts:
            out_s = float(c.get("out_seconds", 0) or 0)
            in_s = float(c.get("in_seconds", 0) or 0)
            total += max(0.0, out_s - in_s)
        return 30.0 + total * 0.5

    # ------------------------------------------------------------------
    # Execute
    # ------------------------------------------------------------------

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        operation = inputs["operation"]
        start = time.time()
        try:
            if operation == "doctor":
                result = self._doctor(inputs)
            elif operation == "scaffold_workspace":
                result = self._scaffold(inputs)
            elif operation == "lint":
                result = self._lint(inputs)
            elif operation == "validate":
                result = self._validate(inputs)
            elif operation == "render":
                result = self._render(inputs)
            elif operation == "add_block":
                result = self._add_block(inputs)
            else:
                return ToolResult(success=False, error=f"Unknown operation: {operation}")
        except Exception as e:
            log.exception("hyperframes_compose failed")
            return ToolResult(success=False, error=f"{type(e).__name__}: {e}")

        result.duration_seconds = round(time.time() - start, 2)
        return result

    # ------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------

    def _doctor(self, inputs: dict[str, Any]) -> ToolResult:
        """Probe the environment. Reports node/ffmpeg/npx plus CLI doctor output."""
        check = self._runtime_check()
        out: dict[str, Any] = {"runtime_check": check}

        if not check["runtime_available"]:
            return ToolResult(
                success=False,
                error=("HyperFrames runtime floor not met: " + "; ".join(check["reasons"])),
                data=out,
            )

        # Ask the CLI itself for a deeper check. This also warms the npm
        # cache so the first real render doesn't pay the download cost.
        try:
            proc = self._run_hf(["doctor"], cwd=None, timeout=180, check=False)
            out["cli_doctor"] = {
                "exit_code": proc.returncode,
                "stdout_tail": (proc.stdout or "")[-4000:],
                "stderr_tail": (proc.stderr or "")[-4000:],
            }
            ok = proc.returncode == 0
            return ToolResult(
                success=ok,
                data=out,
                error=None if ok else f"hyperframes doctor exit {proc.returncode}",
            )
        except Exception as e:
            out["cli_doctor_error"] = str(e)
            return ToolResult(
                success=False,
                error=f"hyperframes doctor failed: {e}",
                data=out,
            )

    def _scaffold(self, inputs: dict[str, Any]) -> ToolResult:
        """Materialize the HyperFrames workspace from OpenMontage artifacts.

        This does NOT call `hyperframes init` — we want full control over the
        generated files so they map cleanly to edit_decisions. `init` is
        meant for humans bootstrapping a project by hand.
        """
        workspace = self._require_workspace(inputs)
        edit_decisions = inputs.get("edit_decisions") or {}
        asset_manifest = inputs.get("asset_manifest") or {}
        playbook = inputs.get("playbook") or {}
        profile_name = inputs.get("profile")

        if not edit_decisions.get("cuts"):
            return ToolResult(
                success=False,
                error="edit_decisions with non-empty cuts[] is required for scaffold_workspace",
            )

        width, height, fps = self._resolve_dimensions(profile_name, inputs.get("fps", 30))

        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "compositions").mkdir(exist_ok=True)
        assets_dir = workspace / "assets"
        assets_dir.mkdir(exist_ok=True)

        # Resolve asset IDs → file paths + copy into workspace.
        resolved_cuts, asset_copies = self._resolve_and_stage_assets(
            edit_decisions.get("cuts", []),
            asset_manifest.get("assets", []),
            workspace,
        )

        audio_refs = self._resolve_audio_refs(
            edit_decisions.get("audio", {}),
            asset_manifest.get("assets", []),
            workspace,
        )

        # Style bridge: playbook → CSS custom properties + DESIGN.md.
        css_vars, design_md = self._style_bridge(playbook, edit_decisions)

        # Write hyperframes.json (registry config).
        (workspace / "hyperframes.json").write_text(
            json.dumps(
                {
                    "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
                    "paths": {
                        "blocks": "compositions",
                        "components": "compositions/components",
                        "assets": "assets",
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # Write DESIGN.md (convenience file for human review + workspace context).
        if design_md:
            (workspace / "DESIGN.md").write_text(design_md, encoding="utf-8")

        # Write index.html — the main composition.
        total_duration = self._compute_total_duration(resolved_cuts)
        html = self._generate_index_html(
            cuts=resolved_cuts,
            audio_refs=audio_refs,
            width=width,
            height=height,
            total_duration=total_duration,
            css_vars=css_vars,
            title=edit_decisions.get("metadata", {}).get("title")
            or f"OpenMontage {edit_decisions.get('renderer_family', 'composition')}",
        )
        (workspace / "index.html").write_text(html, encoding="utf-8")

        return ToolResult(
            success=True,
            data={
                "operation": "scaffold_workspace",
                "workspace": str(workspace),
                "width": width,
                "height": height,
                "fps": fps,
                "total_duration_seconds": total_duration,
                "cut_count": len(resolved_cuts),
                "asset_copies": asset_copies,
            },
            artifacts=[str(workspace / "index.html")],
        )

    def _lint(self, inputs: dict[str, Any]) -> ToolResult:
        workspace = self._require_workspace(inputs)
        if not (workspace / "index.html").exists():
            return ToolResult(
                success=False,
                error=f"No index.html in {workspace}. Run scaffold_workspace first.",
            )
        proc = self._run_hf(["lint", "--json"], cwd=workspace, timeout=120, check=False)
        data: dict[str, Any] = {"exit_code": proc.returncode}
        payload = self._parse_json_output(proc.stdout)
        if payload is not None:
            data["report"] = payload
        else:
            data["stdout_tail"] = (proc.stdout or "")[-4000:]
        data["stderr_tail"] = (proc.stderr or "")[-2000:]
        ok = proc.returncode == 0
        return ToolResult(
            success=ok,
            data=data,
            error=None if ok else f"hyperframes lint exit {proc.returncode}",
        )

    def _validate(self, inputs: dict[str, Any]) -> ToolResult:
        workspace = self._require_workspace(inputs)
        if not (workspace / "index.html").exists():
            return ToolResult(
                success=False,
                error=f"No index.html in {workspace}. Run scaffold_workspace first.",
            )
        args = ["validate", "--json"]
        if inputs.get("skip_contrast"):
            args.append("--no-contrast")
        proc = self._run_hf(args, cwd=workspace, timeout=300, check=False)
        data: dict[str, Any] = {"exit_code": proc.returncode}
        payload = self._parse_json_output(proc.stdout)
        if payload is not None:
            data["report"] = payload
        else:
            data["stdout_tail"] = (proc.stdout or "")[-4000:]
        data["stderr_tail"] = (proc.stderr or "")[-2000:]
        ok = proc.returncode == 0
        return ToolResult(
            success=ok,
            data=data,
            error=None if ok else f"hyperframes validate exit {proc.returncode}",
        )

    def _add_block(self, inputs: dict[str, Any]) -> ToolResult:
        """Install a registry block or component via `hyperframes add`.

        Blocks are standalone sub-compositions (own dimensions, duration, timeline)
        that land at `compositions/<name>.html`. Components are effect snippets
        that land at `compositions/components/<name>.html`. After install, the
        caller is responsible for wiring the block into `index.html` via
        `data-composition-src` or pasting the component's snippet — see
        `.agents/skills/hyperframes-registry/SKILL.md`.
        """
        workspace = self._require_workspace(inputs)
        block = (inputs.get("block_name") or "").strip()
        if not block:
            return ToolResult(
                success=False,
                error="block_name is required for operation='add_block'",
            )
        if not workspace.exists():
            return ToolResult(
                success=False,
                error=(f"Workspace {workspace} does not exist. Run operation='scaffold_workspace' first."),
            )
        args = ["add", block, "--json", "--no-clipboard"]
        proc = self._run_hf(args, cwd=workspace, timeout=300, check=False)
        data: dict[str, Any] = {
            "operation": "add_block",
            "block_name": block,
            "workspace": str(workspace),
            "exit_code": proc.returncode,
        }
        payload = self._parse_json_output(proc.stdout)
        if payload is not None:
            data["report"] = payload
        else:
            data["stdout_tail"] = (proc.stdout or "")[-4000:]
        data["stderr_tail"] = (proc.stderr or "")[-2000:]
        ok = proc.returncode == 0
        return ToolResult(
            success=ok,
            data=data,
            error=None if ok else f"hyperframes add {block} exit {proc.returncode}",
        )

    def _render(self, inputs: dict[str, Any]) -> ToolResult:
        """Full pipeline: scaffold → lint → validate → render."""
        runtime_ok = self._runtime_check()
        if not runtime_ok["runtime_available"]:
            return ToolResult(
                success=False,
                error=(
                    "HyperFrames runtime not available: "
                    + "; ".join(runtime_ok["reasons"])
                    + ". Per governance, this is a blocker — do NOT silently "
                    "fall back to another runtime without user approval."
                ),
                data={"runtime_check": runtime_ok},
            )

        workspace = self._require_workspace(inputs)
        output_path = Path(inputs.get("output_path") or (workspace / "renders" / "final.mp4"))
        output_path.parent.mkdir(parents=True, exist_ok=True)

        steps: dict[str, Any] = {}

        # 1. Scaffold — generate HTML/CSS/assets.
        scaffold = self._scaffold(inputs)
        steps["scaffold"] = scaffold.data
        if not scaffold.success:
            return ToolResult(
                success=False,
                error=f"Scaffold failed: {scaffold.error}",
                data={"steps": steps},
            )

        # 2. Lint — static contract checks.
        lint = self._lint({"workspace_path": str(workspace)})
        steps["lint"] = lint.data
        if not lint.success:
            if inputs.get("strict", False):
                return ToolResult(
                    success=False,
                    error=f"Lint failed (strict mode): {lint.error}",
                    data={"steps": steps},
                )
            log.warning("hyperframes lint reported issues (non-strict mode, continuing)")

        # 3. Validate — browser-based contract + contrast.
        validate = self._validate(
            {
                "workspace_path": str(workspace),
                "skip_contrast": inputs.get("skip_contrast", False),
            }
        )
        steps["validate"] = validate.data
        if not validate.success:
            return ToolResult(
                success=False,
                error=(
                    f"Validate failed: {validate.error}. HyperFrames render "
                    f"is blocked — fix the composition and re-run."
                ),
                data={"steps": steps},
            )

        # 4. Render.
        width, height, fps = self._resolve_dimensions(inputs.get("profile"), inputs.get("fps", 30))
        quality = inputs.get("quality", "standard")
        args = [
            "render",
            "--output",
            str(output_path),
            "--fps",
            str(fps),
            "--quality",
            quality,
        ]
        proc = self._run_hf(args, cwd=workspace, timeout=1800, check=False)
        steps["render"] = {
            "exit_code": proc.returncode,
            "stdout_tail": (proc.stdout or "")[-4000:],
            "stderr_tail": (proc.stderr or "")[-4000:],
        }
        if proc.returncode != 0:
            return ToolResult(
                success=False,
                error=f"hyperframes render exit {proc.returncode}",
                data={"steps": steps},
            )

        if not output_path.exists():
            return ToolResult(
                success=False,
                error=(
                    f"hyperframes render exited 0 but output file missing: "
                    f"{output_path}. Check stdout_tail for the real path."
                ),
                data={"steps": steps},
            )

        return ToolResult(
            success=True,
            data={
                "operation": "render",
                "output": str(output_path),
                "workspace": str(workspace),
                "width": width,
                "height": height,
                "fps": fps,
                "quality": quality,
                "steps": steps,
            },
            artifacts=[str(output_path)],
        )

    # ------------------------------------------------------------------
    # Workspace generation helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _require_workspace(inputs: dict[str, Any]) -> Path:
        """Resolve workspace path from inputs."""
        return require_workspace(inputs)

    @staticmethod
    def _resolve_dimensions(profile_name: str | None, fps_in: int) -> tuple[int, int, int]:
        """Resolve output dimensions from the media profile, with a safe default."""
        if profile_name:
            try:
                from lib.media_profiles import get_profile  # type: ignore

                p = get_profile(profile_name)
                return int(p.width), int(p.height), int(p.fps)
            except Exception:
                pass
        return 1920, 1080, int(fps_in)

    @staticmethod
    def _compute_total_duration(cuts: list[dict]) -> float:
        """Compute total duration from a list of cut dicts."""
        return compute_total_duration(cuts)

    def _resolve_and_stage_assets(
        self,
        cuts: list[dict],
        assets: list[dict],
        workspace: Path,
    ) -> tuple[list[dict], list[dict[str, str]]]:
        """Resolve asset IDs in cuts[].source, copy files into workspace/assets/.

        HyperFrames resolves `src=` relative to the composition HTML file, so
        every asset must live inside the workspace tree. Copying is simpler
        (and portable) than symlinking, at the cost of disk space — these
        are regenerable under `projects/`.
        """
        asset_lookup = {a["id"]: a for a in assets if "id" in a}
        assets_dir = workspace / "assets"
        copies: list[dict[str, str]] = []
        resolved: list[dict] = []
        for cut in cuts:
            source = cut.get("source", "")
            resolved_cut = dict(cut)
            if source in asset_lookup:
                resolved_cut["source"] = asset_lookup[source].get("path", source)
            src_path = Path(resolved_cut["source"]) if resolved_cut.get("source") else None
            if src_path and src_path.exists() and not self._is_inside(src_path, workspace):
                dest = assets_dir / src_path.name
                if not dest.exists() or dest.stat().st_size != src_path.stat().st_size:
                    shutil.copy2(src_path, dest)
                resolved_cut["source"] = str(dest)
                copies.append({"from": str(src_path), "to": str(dest)})
            resolved.append(resolved_cut)
        return resolved, copies

    def _resolve_audio_refs(
        self,
        audio: dict[str, Any],
        assets: list[dict],
        workspace: Path,
    ) -> dict[str, Any]:
        """Resolve narration / music asset IDs and stage them."""
        asset_lookup = {a["id"]: a for a in assets if "id" in a}
        assets_dir = workspace / "assets"
        out: dict[str, Any] = {"narration": [], "music": None}

        for seg in audio.get("narration", {}).get("segments", []) or []:
            aid = seg.get("asset_id")
            if not aid or aid not in asset_lookup:
                continue
            src = Path(asset_lookup[aid].get("path", ""))
            if not src.exists():
                continue
            if not self._is_inside(src, workspace):
                dest = assets_dir / src.name
                if not dest.exists() or dest.stat().st_size != src.stat().st_size:
                    shutil.copy2(src, dest)
            else:
                dest = src
            out["narration"].append(
                {
                    "src": str(dest),
                    "start_seconds": float(seg.get("start_seconds", 0) or 0),
                    "end_seconds": float(seg.get("end_seconds", 0) or 0) or None,
                }
            )

        music = audio.get("music", {})
        m_id = music.get("asset_id")
        if m_id and m_id in asset_lookup:
            src = Path(asset_lookup[m_id].get("path", ""))
            if src.exists():
                if not self._is_inside(src, workspace):
                    dest = assets_dir / src.name
                    if not dest.exists() or dest.stat().st_size != src.stat().st_size:
                        shutil.copy2(src, dest)
                else:
                    dest = src
                out["music"] = {
                    "src": str(dest),
                    "volume": float(music.get("volume", 0.15) or 0.15),
                    "fade_in_seconds": float(music.get("fade_in_seconds", 0) or 0),
                    "fade_out_seconds": float(music.get("fade_out_seconds", 0) or 0),
                }

        return out

    @staticmethod
    def _is_inside(path: Path, root: Path) -> bool:
        """Check if path is inside root."""
        return is_inside(path, root)

    def _style_bridge(
        self,
        playbook: dict[str, Any],
        edit_decisions: dict[str, Any],
    ) -> tuple[dict[str, str], str]:
        """Bridge OpenMontage playbook → HyperFrames CSS vars + DESIGN.md.

        Delegates to `lib/hyperframes_style_bridge.py` so the logic is
        shareable and testable. Falls back to a safe built-in default when
        the bridge module isn't available.
        """
        try:
            from lib.hyperframes_style_bridge import style_bridge  # type: ignore

            return style_bridge(playbook, edit_decisions)
        except Exception as e:
            log.debug("style_bridge fallback: %s", e)

        vl = (playbook or {}).get("visual_language", {})
        palette = vl.get("color_palette", {})
        typo = (playbook or {}).get("typography", {})

        def _first(raw: Any, default: str) -> str:
            if isinstance(raw, list) and raw:
                return str(raw[0])
            if isinstance(raw, str) and raw:
                return raw
            return default

        bg = _first(palette.get("background"), "#0B0F1A")
        fg = _first(palette.get("text"), "#F5F5F5")
        accent = _first(palette.get("accent"), "#F59E0B")
        primary = _first(palette.get("primary"), "#2563EB")
        heading = typo.get("heading", {}).get("font") or typo.get("heading", {}).get("family") or "Inter"
        body = typo.get("body", {}).get("font") or typo.get("body", {}).get("family") or "Inter"

        css_vars = {
            "--color-bg": bg,
            "--color-fg": fg,
            "--color-accent": accent,
            "--color-primary": primary,
            "--font-heading": heading,
            "--font-body": body,
            "--ease-primary": "cubic-bezier(0.65, 0, 0.35, 1)",
            "--duration-entrance": "0.6s",
        }
        design_md = (
            "# DESIGN\n\n"
            "Generated by OpenMontage HyperFrames style bridge (fallback).\n\n"
            f"- Background: `{bg}`\n"
            f"- Foreground: `{fg}`\n"
            f"- Accent: `{accent}`\n"
            f"- Primary: `{primary}`\n"
            f"- Heading font: `{heading}`\n"
            f"- Body font: `{body}`\n"
        )
        return css_vars, design_md

    # ------------------------------------------------------------------
    # HTML generation (minimal, Phase 1) — 委托到 hf_html_gen 模块
    # ------------------------------------------------------------------

    def _generate_index_html(
        self,
        cuts: list[dict],
        audio_refs: dict[str, Any],
        width: int,
        height: int,
        total_duration: float,
        css_vars: dict[str, str],
        title: str,
    ) -> str:
        """Emit a HyperFrames-contract-compliant index.html.

        Phase 1 covers the minimum required for smoke-testing the runtime:
        - still images (img.clip)
        - video clips (video.clip, muted playsinline + separate audio if needed)
        - text cards (div.clip with styled <h1>)
        - narration segments (audio)
        - music bed (audio, lower volume)

        Richer scene types (registry blocks, kinetic typography) are authored
        by the agent directly into compositions/ — this generator just
        provides a functional starting skeleton.

        实现委托到 ``hf_html_gen.generate_index_html``，配套测试见
        ``tests/test_hf_html_gen.py``。
        """
        return _module_generate_index_html(
            self,
            cuts=cuts,
            audio_refs=audio_refs,
            width=width,
            height=height,
            total_duration=total_duration,
            css_vars=css_vars,
            title=title,
        )

    def _cut_to_html(self, index: int, cut: dict, width: int, height: int) -> tuple[str, str | None]:
        """Render one cut + its entrance tween. Returns (html, tween or None).

        实现委托到 ``hf_html_gen.cut_to_html``。
        """
        return _module_cut_to_html(self, index, cut, width, height)

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def _run_hf(
        self,
        args: list[str],
        *,
        cwd: Path | None,
        timeout: int,
        check: bool,
    ) -> subprocess.CompletedProcess:
        """Invoke `npx hyperframes <args>` with the right Windows quirks.

        We intentionally bypass `self.run_command` here because we do NOT
        want to raise CalledProcessError on non-zero exits — the caller
        parses lint/validate/render exit codes itself.
        """
        cmd = ["npx", "--yes", "hyperframes", *args]
        # On Windows, resolve the .cmd wrapper so subprocess can find it
        # without shell=True.
        if os.name == "nt":
            resolved = shutil.which(cmd[0])
            if resolved:
                cmd[0] = resolved
        try:
            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=str(cwd) if cwd else None,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            # Surface timeouts as a failed CompletedProcess so callers get a
            # uniform shape. The stderr tail will say timeout.
            return subprocess.CompletedProcess(
                args=cmd,
                returncode=124,
                stdout=e.stdout or "",
                stderr=(e.stderr or "") + f"\n[timeout after {timeout}s]",
            )

    @staticmethod
    def _parse_json_output(stdout: str) -> Any | None:
        """Parse JSON from stdout, handling artifacts."""
        return parse_json_output(stdout)

    @staticmethod
    def _f(v: float) -> str:
        """Format a float with zero-decimal rule for CSS."""
        return f"{v:.0f}" if v == int(v) else f"{v}"

    @staticmethod
    def _escape_text(s: str) -> str:
        """Escape text for HTML."""
        return escape_text(s)

    @staticmethod
    def _escape_attr(s: str) -> str:
        return HyperFramesCompose._escape_text(s).replace('"', "&quot;")

    @staticmethod
    def _rel_from_workspace(path: str) -> str:
        """Convert an absolute path to a workspace-relative path."""
        return rel_from_workspace(path)
