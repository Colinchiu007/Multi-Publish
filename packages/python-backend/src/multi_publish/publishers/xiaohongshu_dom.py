"""小红书 DOM 轨的底层控件操作（纯函数，无状态）。

从 xiaohongshu.py 拆出，满足新代码单文件行数门禁（.github/scripts/check-max-lines.js）。

为什么是**纯函数**而不是第二个 mixin：本轨的关键常量（风控选择器、风控词表、上传
等待上限）必须在发布器模块命名空间里读取，然后作为参数传进来——这样
``monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", ...)`` 才会真正改变行为。若把
这些逻辑做成 mixin 并让它自己 import 常量，patch 发布器模块的同名常量会静默失效：
能力看起来还在，实际已不响应任何配置。这正是 rpa-xiaohongshu-dom-hardening 要防的
"静默失效"类，不能由拆分本身重新引入。
"""

from __future__ import annotations

import asyncio
import re

from loguru import logger

from multi_publish.publishers.base import wait_until


async def visible_texts(page, sel: str, *, limit: int) -> list[str]:
    """该选择器命中的**可见**元素文案，最多读取 limit 个元素。

    上限是硬需要：`[class*="modal"]` 这类宿主选择器在 SPA 模板页可命中整页元素，
    逐元素 inner_text 会把发布链路拖死。真实风控层是页面上最靠前的可见容器之一。
    """
    try:
        loc = page.locator(sel)
        total = min(await loc.count(), limit)
    except Exception:
        return []
    out: list[str] = []
    for i in range(total):
        item = loc.nth(i)
        try:
            if await item.is_visible():
                out.append((await item.inner_text()) or "")
        except Exception:
            continue
    return out


async def risk_present(page, *, overlay_selector: str, hosts: list[str], pattern: str, limit: int) -> bool:
    """风控判定双轨：占位选择器（Tier2 待回填）+ 浮层内可见文案（本仓已实战口径）。

    两轨都要求元素**可见**：SPA 常驻的隐藏 modal 模板自带默认风控文案，
    不可见也当风控就会每次发布误判并中止草稿保存——误判比漏判更有害。
    """
    if overlay_selector and await visible_texts(page, overlay_selector, limit=limit):
        return True
    for host in hosts:
        for text in await visible_texts(page, host, limit=limit):
            if re.search(pattern, text, re.I):
                logger.warning(f"[小红书] 可见浮层文案命中风控口径: {text[:60]!r}")
                return True
    return False


async def resolve_visible(page, candidates: list[str]):
    """按候选回退链解析首个可见 locator，返回 (locator, selector) 或 (None, None)。"""
    for sel in candidates:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible():
                return loc, sel
        except Exception:
            continue
    return None, None


async def await_control(page, candidates: list[str], *, label: str, timeout_s: float, interval_s: float):
    """轮询候选链中首个可见控件，返回 locator 或 None；超时留痕但不臆断失败。

    返回 None 只表示"没等到"，是否中止由调用方决定（媒体上传必须中止，编辑器就绪可降级）。
    """
    async def visible() -> bool:
        loc, _ = await resolve_visible(page, candidates)
        return loc is not None

    if not await wait_until(visible, timeout_s=timeout_s, interval_s=interval_s):
        logger.warning(f"{label}在 {timeout_s}s 内未就绪（站点结构变化或首屏未完成）")
        return None
    loc, _ = await resolve_visible(page, candidates)
    return loc


async def set_field(page, candidates: list[str], text: str, *, label: str) -> bool:
    """标题/正文填写：优先原生 fill，contenteditable 回退 evaluate + dispatch 事件。"""
    loc, _ = await resolve_visible(page, candidates)
    if loc is None:
        return False
    try:
        await loc.click()
    except Exception:
        pass
    try:
        await loc.fill(text)
        return True
    except Exception:
        try:
            await loc.evaluate(
                "(el, t) => { el.textContent = t;"
                " el.dispatchEvent(new Event('input', { bubbles: true }));"
                " el.dispatchEvent(new Event('change', { bubbles: true })); }",
                text,
            )
            return True
        except Exception as e:
            logger.warning(f"[小红书] 字段 {label} 填写失败: {e}")
            return False


async def add_tags(page, *, tag_candidates: list[str], suggestion_candidates: list[str], tags: list[str]) -> None:
    """逐个 type + 尽力选下拉首个候选（修覆盖式 fill 只留最后一个）。"""
    loc, _ = await resolve_visible(page, tag_candidates)
    if loc is None:
        logger.debug("未找到标签输入框，跳过标签")
        return
    for tag in tags[:5]:
        try:
            await loc.click()
            await loc.type(tag, delay=50)
            sugg, _ = await resolve_visible(page, suggestion_candidates)
            if sugg is not None:
                await sugg.click()
            else:
                await loc.press("Enter")
        except Exception as e:
            logger.debug(f"[小红书] 标签 {tag} 添加失败（不影响草稿保存）: {e}")


async def set_cover(page, *, upload_candidates: list[str], input_candidates: list[str], cover_path: str) -> None:
    try:
        btn, _ = await resolve_visible(page, upload_candidates)
        if btn is None:
            return
        await btn.click()
        await asyncio.sleep(2)
        inp, _ = await resolve_visible(page, input_candidates)
        if inp is not None:
            await inp.set_input_files(cover_path)
    except Exception as e:
        logger.warning(f"封面上传失败（不影响发布）: {e}")
