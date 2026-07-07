"""Tool registry for video creation module.

Adapted from OpenMontage tools/tool_registry.py.
Central registry for discovering and querying tools/providers.
"""

from __future__ import annotations

import importlib
import inspect
import pkgutil
from types import ModuleType
from typing import Any

from multi_publish.video_creation.base_tool import BaseTool, ToolStatus, ToolTier


class ToolRegistry:
    """Central registry for video creation tools."""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        if not tool.name:
            raise ValueError("Tool must have a non-empty name")
        self._tools[tool.name] = tool

    def clear(self) -> None:
        self._tools.clear()

    def register_module(self, module: ModuleType) -> list[str]:
        """Register all concrete BaseTool subclasses defined in a module."""
        registered: list[str] = []
        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is BaseTool or not issubclass(cls, BaseTool):
                continue
            if cls.__module__ != module.__name__ or inspect.isabstract(cls):
                continue
            try:
                tool = cls()
                self.register(tool)
                registered.append(tool.name)
            except Exception:
                continue
        return registered

    def discover(self, package_name: str = "multi_publish.video_creation") -> list[str]:
        """Import a package tree and register any concrete tools."""
        try:
            package = importlib.import_module(package_name)
        except ImportError:
            return []
        discovered: list[str] = []
        package_paths = getattr(package, "__path__", None)
        if package_paths is None:
            return self.register_module(package)

        prefix = package_name + "."
        for module_info in pkgutil.walk_packages(package_paths, prefix):
            try:
                module = importlib.import_module(module_info.name)
                registered = self.register_module(module)
                discovered.extend(registered)
            except Exception:
                continue
        return discovered

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def list_tools(self, tier: ToolTier | None = None) -> list[BaseTool]:
        if tier:
            return [t for t in self._tools.values() if t.tier == tier]
        return list(self._tools.values())

    def get_status_summary(self) -> dict[str, Any]:
        """Menu-style summary grouped by capability."""
        buckets: dict[str, dict[str, list[dict[str, Any]]]] = {}
        for tool in self._tools.values():
            cap = tool.capability
            if cap not in buckets:
                buckets[cap] = {"available": [], "unavailable": []}
            entry = {
                "name": tool.name,
                "version": tool.version,
                "provider": tool.provider,
                "tier": tool.tier.value,
                "stability": tool.stability.value,
                "runtime": tool.runtime.value,
                "dependencies": tool.dependencies,
                "install_instructions": tool.install_instructions,
                "best_for": tool.best_for,
            }
            status = tool.get_status()
            key = "available" if status == ToolStatus.AVAILABLE else "unavailable"
            buckets[cap][key].append(entry)

        capabilities: list[dict[str, Any]] = []
        for cap, bucket in buckets.items():
            capabilities.append(
                {
                    "capability": cap,
                    "available": len(bucket["available"]),
                    "unavailable": len(bucket["unavailable"]),
                    "available_providers": sorted({e["provider"] for e in bucket["available"]} - {None}),
                }
            )
        return {"capabilities": capabilities, "total_tools": len(self._tools)}


# Singleton
registry = ToolRegistry()
