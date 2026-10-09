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


async def visible_texts(page, sel: str, *, limit: int, probe_cap: int) -> list[str]:
    """该选择器命中的**可见**元素文案（空文案不保留），最多收集 `limit` 条可见文案。

    上限是硬需要：`[class*="modal"]` 这类宿主选择器在 SPA 模板页可命中整页元素，
    逐元素 inner_text 会把发布链路拖死。但**截断口径必须是"可见元素数"而不是
    "DOM 序前 N 个节点"**：portal 把真实弹层 append 到 body 尾部，而常驻的隐藏
    modal 模板会先占满前几个节点——按 DOM 序截断等于"风控层排在第 N+1 个就永不被扫"，
    两轨同时漏判后流程会继续走向发布，违反风控绝不降级的红线。
    因此文案读取按 `limit` 条**可见**元素收，探测次数另由 `probe_cap` 设硬上限
    （调用方传常量，防整页节点数放大 round-trip 成本）。

    本函数只服务**文案轨**；"有可见容器"这种存在性判定请用 `visible_count`——
    把空串留在返回列表里靠列表真值判风控，是过滤空串就会静默漏判的偶然耦合。

    `probe_cap` 仍是一道按 DOM 序的悬崖（只是从 8 抬到 32），本仓没有活体证据说明
    风控层在 DOM 里的实际位置，因此不引入"从尾部反向扫"这类同样未验证的假设来替换它。
    能确定的是：**截断必须留痕**。命中节点数超过探测上限、又没集满可见文案时打一条
    含选择器与两个计数的告警，让"可能漏判"从静默失效变成发布链路里可查的线索
    （也是 2.2 活体取证能拿到的第一个量化观测量）。
    """
    try:
        loc = page.locator(sel)
        hit_count = await loc.count()
    except Exception:
        return []
    out: list[str] = []
    for i in range(min(hit_count, probe_cap)):
        item = loc.nth(i)
        try:
            if not await item.is_visible():
                continue
            text = (await item.inner_text()) or ""
        except Exception:
            continue
        if text:
            out.append(text)
            if len(out) >= limit:
                break
    if hit_count > probe_cap and len(out) < limit:
        logger.warning(
            f"[小红书] 风控文本轨探测被截断: {sel} 命中 {hit_count} 个节点，"
            f"仅探测前 {probe_cap} 个且只收到 {len(out)} 条可见文案（上限 {limit}）"
            f"——不排除可见风控层落在未探测的节点里"
        )
    return out


async def visible_count(page, sel: str, *, limit: int, probe_cap: int) -> int:
    """该选择器命中的**可见**元素个数（数到 `limit` 个即停，探测不超过 `probe_cap`）。

    同 `visible_texts`：按可见数计满额、按 probe_cap 限成本，不按 DOM 序截断；
    探测被截断且一个可见都没数到（即占位轨将判为"无风控"）时同样留痕。
    """
    try:
        loc = page.locator(sel)
        hit_count = await loc.count()
    except Exception:
        return 0
    n = 0
    for i in range(min(hit_count, probe_cap)):
        try:
            if await loc.nth(i).is_visible():
                n += 1
                if n >= limit:
                    break
        except Exception:
            continue
    if hit_count > probe_cap and n == 0:
        logger.warning(
            f"[小红书] 风控占位轨探测被截断: {sel} 命中 {hit_count} 个节点，"
            f"前 {probe_cap} 个均不可见——不排除可见风控层落在未探测的节点里"
        )
    return n


async def draft_box_count(page, sel: str, *, probe_cap: int) -> int | None:
    """读「草稿箱(N)」计数节点——图文草稿唯一的可见正证据（活体取证 2026-10-08）。

    读不到节点、或节点文本不含计数，一律返回 None：草稿箱基线未知时调用方不得凭"看着
    像 0"报成功。逐元素判可见同 visible_texts，避开 SPA 常驻隐藏模板。
    括号兼容全角与空格：取证到的文本是半角 `草稿箱(1)`，但这是显示格式而非协议，
    平台改一个括号就应当只是"少一条证据"，不该把判据的可用性押在字符形状上。
    """
    texts = await visible_texts(page, sel, limit=1, probe_cap=probe_cap)
    for text in texts:
        m = re.search(r"草稿箱\s*[（(]\s*(\d+)\s*[）)]", text or "")
        if m:
            return int(m.group(1))
    return None


async def await_draft_box_count(
    page, sel: str, *, timeout_s: float, interval_s: float, probe_cap: int
) -> int | None:
    """轮询等「草稿箱(N)」计数节点挂载，返回读到的计数；时限内等不到 → None 并留痕。

    单次读在这条轨上是**已知复发缺陷**（§4e 上传控件、§4k 编辑器就绪都是同一类）：
    创作者中心是 SPA，`domcontentloaded` 时草稿面板常常还没挂载，一次读拿到 None 就会
    把唯一可用确认判据**静默关掉**。这里用条件轮询（命中即返回，无固定 sleep），并且
    等不到时打一条告警——判据不可用必须成为可查的线索，不是又一次静默失效。
    """
    holder: dict[str, int] = {}

    async def probe() -> bool:
        n = await draft_box_count(page, sel, probe_cap=probe_cap)
        if n is None:
            return False
        holder["count"] = n
        return True

    if not await wait_until(probe, timeout_s=timeout_s, interval_s=interval_s):
        logger.warning(
            f"[小红书] 草稿箱计数节点在 {timeout_s}s 内未挂载或文本不含计数: {sel}"
            "——草稿确认退到标题回查，不排除判据本身不可用"
        )
    return holder.get("count")


async def await_draft_box_increment(
    page, sel: str, *, baseline: int, timeout_s: float, interval_s: float, probe_cap: int
) -> tuple[bool, int | None]:
    """轮询等计数相对基线增长，返回 (是否确认, 最后读到的值)。

    自动保存落库有延迟：刚点完/刚传完就单次读，会把"还在写"读成"没写"，成功的草稿被
    报成 XHS_UNCONFIRMED。等待条件必须是**增量本身**而不是"节点出现了"——节点早就在，
    值没变依然不能确认。
    """
    last: dict[str, int | None] = {"count": None}

    async def probe() -> bool:
        n = await draft_box_count(page, sel, probe_cap=probe_cap)
        last["count"] = n
        return n is not None and n > baseline

    hit = await wait_until(probe, timeout_s=timeout_s, interval_s=interval_s)
    return hit, last["count"]


async def draft_title_present(page, sel: str, title: str) -> bool:
    """草稿箱条目标题匹配——**未经活体取证**的次级兜底。

    它可以命中来确认，不能因它不命中就判失败：真正的失败条件是"所有正面信号都没拿到"，
    由调用方归一成 XHS_UNCONFIRMED，而不是在这里替平台猜选择器。
    """
    if not title:
        return False
    items = page.locator(sel)
    count = await items.count()
    for i in range(count):
        txt = await items.nth(i).inner_text()
        if title[:12] and title[:12] in (txt or ""):
            return True
    return False


async def recheck_draft_box(
    page, title: str, baseline, *, box_url: str, counter_sel: str, item_sel: str,
    timeout_s: float, interval_s: float, probe_cap: int
) -> bool:
    """重载草稿箱页复核：主判据是计数相对基线增长，标题匹配只兜底。

    图文草稿由平台自动保存，「草稿箱(N)」+1 是活体取证到的唯一可见正证据（2026-10-08）。
    两个读取都必须等待（见 await_draft_box_count / await_draft_box_increment 的成因），
    基线为 None 时增量判据**不可用**，只能退到未取证的标题匹配——此时结论仍可能是
    "成功但报未确认"，宁可如此，也不得凭缺席的信号报成功。
    """
    try:
        await page.goto(box_url, wait_until="domcontentloaded")
        if baseline is None:
            logger.info("[小红书] 无草稿箱基线（节点未挂载或文本不含计数），只能退到标题回查")
            return await draft_title_present(page, item_sel, title)
        hit, now = await await_draft_box_increment(
            page, counter_sel, baseline=baseline, timeout_s=timeout_s,
            interval_s=interval_s, probe_cap=probe_cap,
        )
        if hit:
            logger.info(f"[小红书] 草稿箱计数 {baseline} → {now}，确认已写入")
            return True
        logger.info(f"[小红书] 草稿箱计数 {baseline} → {now} 未增长，退到标题回查")
        return await draft_title_present(page, item_sel, title)
    except Exception as e:
        logger.debug(f"草稿箱回查失败: {e}")
        return False


async def risk_present(
    page, *, overlay_selector: str, hosts: list[str], pattern: str, limit: int, probe_cap: int
) -> bool:
    """风控判定双轨：占位选择器（Tier2 待回填）+ 浮层内可见文案（本仓已实战口径）。

    两轨都要求元素**可见**：SPA 常驻的隐藏 modal 模板自带默认风控文案，
    不可见也当风控就会每次发布误判并中止草稿保存——误判比漏判更有害。

    占位轨只看存在性，不看文案：回填后的目标是纯图形/拼图验证层，本来就无可匹配文案。
    代价是这条轨的准确性完全押在选择器精度上，回填必须由活体取证把关。
    """
    if overlay_selector and await visible_count(page, overlay_selector, limit=limit, probe_cap=probe_cap) > 0:
        return True
    for host in hosts:
        for text in await visible_texts(page, host, limit=limit, probe_cap=probe_cap):
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


async def await_control(page, candidates: list[str], *, key: str, label: str,
                        timeout_s: float, interval_s: float):
    """轮询候选链中首个可见控件，返回 locator 或 None；超时留痕但不臆断失败。

    返回 None 只表示"没等到"，是否中止由调用方决定（媒体上传必须中止，编辑器就绪可降级）。
    留痕同时带 `key`（机器可读的控件名，改名/换文案不会变）和 `label`（给用户看的措辞）：
    回归测试钉 `key` 而不是 `label`，否则措辞一改就假红。

    轮询命中后**直接返回轮询中拿到的那个 locator**，不再二次解析：命中与二次解析之间
    控件被移除或隐藏会返回 None，上传路径于是把"刚可见又消失"的瞬时抖动当成
    "控件从未挂载"报 CODE_UPLOAD_FAILED，属于错误归因。locator 本身是惰性的，
    元素真消失了会在执行动作时抛错，由调用方的 except 给出准确文案。
    """
    hit = None

    async def visible() -> bool:
        nonlocal hit
        loc, _ = await resolve_visible(page, candidates)
        if loc is None:
            return False
        hit = loc
        return True

    if not await wait_until(visible, timeout_s=timeout_s, interval_s=interval_s):
        logger.warning(f"[{key}] {label}在 {timeout_s}s 内未就绪（站点结构变化或首屏未完成）")
        return None
    return hit


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
