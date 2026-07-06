"""
抖音 RPA 字段级操作函数

每个函数对应一个独立的 RPA 字段操作（视频上传/标题/封面/标签/描述/发布点击）。
从 DouyinPublisher 提取，降低主文件行数。

架构：
  - 函数签名统一 (page, selectors, ...) 便于测试和复用
  - 每函数对应 per-field 重试状态机的一个字段
"""
from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from multi_publish.publishers.base import FieldRetryMap, ProgressThrottle, PublishPhase, ResponseMonitor


async def rpa_do_video_upload(
    page: Any, selectors: dict, report_progress: Any,
    video_path: str, file_size_mb: float, throttle: ProgressThrottle,
    upload_wait_timeout: int = 300,
):
    """视频上传字段操作"""
    await report_progress(PublishPhase.UPLOADING, f"上传视频 ({file_size_mb:.0f} MB)...", 30)
    file_input = page.locator(selectors["upload_input"]).first
    await file_input.set_input_files(video_path)

    await report_progress(PublishPhase.UPLOADING, "等待上传完成...", 50)
    try:
        await page.wait_for_selector(
            selectors["upload_complete"],
            timeout=upload_wait_timeout * 1000,
        )
    except Exception:
        logger.warning("未检测到上传完成标志，等待 30 秒...")
        await asyncio.sleep(30)


async def rpa_do_field_title(
    page: Any, selectors: dict, report_progress: Any,
    title: str, fields: FieldRetryMap, throttle: ProgressThrottle,
):
    """标题字段操作"""
    if throttle.should_report(70):
        await report_progress(PublishPhase.PUBLISHING, "填写标题...", 70)
    title_input = page.locator(selectors["title_input"]).first
    await title_input.fill(title)
    logger.info(f"标题已填写 {title[:40]}...")


async def rpa_do_field_cover(
    page: Any, selectors: dict, report_progress: Any,
    cover_path: str, fields: FieldRetryMap, throttle: ProgressThrottle,
):
    """封面上传字段操作"""
    cover_btn = page.locator(selectors["cover_upload"]).first
    await cover_btn.click()
    await asyncio.sleep(2)
    cover_input = page.locator(selectors["cover_input"]).first
    await cover_input.set_input_files(cover_path)
    logger.info("封面图已上传")


async def rpa_do_field_tags(
    page: Any, selectors: dict, report_progress: Any,
    tags: list[str], fields: FieldRetryMap, throttle: ProgressThrottle,
):
    """标签字段操作"""
    tag_input = page.locator(selectors["tag_input"]).first
    for tag in tags[:3]:
        await tag_input.fill(tag)
        await asyncio.sleep(1)
        tag_item = page.locator(selectors["tag_item"]).first
        if await tag_item.count() > 0:
            await tag_item.click()
        await asyncio.sleep(0.5)
    logger.info(f"标签已添加 {tags[:3]}")


async def rpa_do_field_desc(
    page: Any, selectors: dict, report_progress: Any,
    content: str, fields: FieldRetryMap, throttle: ProgressThrottle,
):
    """简介字段操作"""
    desc_input = page.locator(selectors["description_textarea"]).first
    if await desc_input.count() > 0:
        await desc_input.fill(content)
        logger.info(f"简介已填写 ({len(content)} chars)")


async def rpa_do_publish_click(
    page: Any, selectors: dict, report_progress: Any,
    draft: bool, fields: FieldRetryMap,
    monitor: ResponseMonitor, throttle: ProgressThrottle,
):
    """发布按钮点击 + API 响应监控确认"""
    await report_progress(PublishPhase.PUBLISHING, "点击发布...", 90)

    if draft:
        draft_btn = page.locator(selectors["draft_button"])
        if await draft_btn.count() > 0:
            await draft_btn.first.click()
        else:
            publish_btn = page.locator(selectors["publish_button"]).first
            await publish_btn.click()
    else:
        try:
            publish_btn = page.locator(selectors["publish_button"]).first
            await publish_btn.click(timeout=10000)
        except Exception:
            publish_btn_alt = page.locator(selectors["publish_button_alt"]).first
            if await publish_btn_alt.count() > 0:
                await publish_btn_alt.click()
            else:
                raise

    logger.info("等待 API 确认发布结果...")
    result = await monitor.wait_for_response(timeout=60, predicate=lambda d: d.get("code") == 0)
    if result:
        item_id = result.get("data", {}).get("item_id", result.get("data", {}).get("aweme_id", ""))
        logger.success(f"API 确认发布成功: item_id={item_id}")
    else:
        logger.warning("API 确认超时，发布可能已成功但无法确认")
