"""Tests for douyin_rpa_fields.py -- RPA field-level operations."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from multi_publish.publishers.base import FieldRetryMap, ProgressThrottle, ResponseMonitor
from multi_publish.publishers.douyin_rpa_fields import (
    rpa_do_field_cover,
    rpa_do_field_desc,
    rpa_do_field_tags,
    rpa_do_field_title,
    rpa_do_publish_click,
    rpa_do_video_upload,
)


@pytest.fixture
def mock_page():
    page = MagicMock()
    locator = AsyncMock()
    locator.first = AsyncMock()
    page.locator.return_value = locator
    return page


@pytest.fixture
def selectors():
    return {
        "upload_input": "#upload-input",
        "upload_complete": ".upload-done",
        "title_input": "#title-input",
        "cover_upload": "#cover-btn",
        "cover_input": "#cover-file",
        "tag_input": "#tag-input",
        "tag_item": ".tag-item",
        "description_textarea": "#desc-area",
        "publish_button": "#publish-btn",
        "publish_button_alt": "#publish-alt",
        "draft_button": "#draft-btn",
    }


@pytest.fixture
def fields():
    return FieldRetryMap()


@pytest.fixture
def throttle():
    t = MagicMock(spec=ProgressThrottle)
    t.should_report.return_value = True
    return t


@pytest.fixture
def report_progress():
    return AsyncMock()


@pytest.fixture
def monitor():
    m = AsyncMock(spec=ResponseMonitor)
    m.wait_for_response = AsyncMock()
    return m


@pytest.mark.asyncio
class TestRpaDoVideoUpload:
    async def test_upload_success(self, mock_page, selectors, report_progress, throttle):
        mock_page.locator.return_value.first.set_input_files = AsyncMock()
        mock_page.wait_for_selector = AsyncMock()

        await rpa_do_video_upload(
            mock_page, selectors, report_progress,
            "/tmp/video.mp4", 50.0, throttle, upload_wait_timeout=10,
        )
        report_progress.assert_awaited()
        mock_page.locator.assert_called_with("#upload-input")
        mock_page.wait_for_selector.assert_awaited_with(".upload-done", timeout=10000)

    async def test_upload_timeout_fallback(self, mock_page, selectors, report_progress, throttle):
        mock_page.locator.return_value.first.set_input_files = AsyncMock()
        mock_page.wait_for_selector = AsyncMock(side_effect=Exception("timeout"))

        await rpa_do_video_upload(
            mock_page, selectors, report_progress,
            "/tmp/video.mp4", 50.0, throttle, upload_wait_timeout=10,
        )
        report_progress.assert_awaited()
        mock_page.wait_for_selector.assert_awaited()


@pytest.mark.asyncio
class TestRpaDoFieldTitle:
    async def test_fill_title(self, mock_page, selectors, report_progress, throttle, fields):
        title_locator = AsyncMock()
        mock_page.locator.return_value.first = title_locator

        await rpa_do_field_title(mock_page, selectors, report_progress, "测试标题", fields, throttle)

        title_locator.fill.assert_awaited_with("测试标题")

    async def test_skip_report_when_throttled(self, mock_page, selectors, report_progress, throttle, fields):
        throttle.should_report.return_value = False
        title_locator = AsyncMock()
        mock_page.locator.return_value.first = title_locator

        await rpa_do_field_title(mock_page, selectors, report_progress, "标题", fields, throttle)

        report_progress.assert_not_awaited()
        title_locator.fill.assert_awaited_with("标题")


@pytest.mark.asyncio
class TestRpaDoFieldCover:
    async def test_upload_cover(self, mock_page, selectors, report_progress, throttle, fields):
        cover_btn = AsyncMock()
        cover_input = AsyncMock()
        mock_page.locator.side_effect = None
        mock_page.locator.return_value = None
        mock_page.locator.side_effect = [
            MagicMock(first=cover_btn),
            MagicMock(first=cover_input),
        ]

        await rpa_do_field_cover(mock_page, selectors, report_progress, "/tmp/cover.png", fields, throttle)

        cover_btn.click.assert_awaited()
        cover_input.set_input_files.assert_awaited_with("/tmp/cover.png")


@pytest.mark.asyncio
class TestRpaDoFieldTags:
    async def test_no_tags_clicked_when_count_zero(self, mock_page, selectors, report_progress, throttle, fields):
        tag_input = AsyncMock()
        tag_item = AsyncMock()
        tag_item.count = AsyncMock(return_value=0)

        mock_page.locator.return_value = None
        mock_page.locator.side_effect = None
        mock_page.locator.side_effect = [
            MagicMock(first=tag_input),
            MagicMock(first=tag_item),
        ]

        await rpa_do_field_tags(mock_page, selectors, report_progress, ["tag1"], fields, throttle)

        tag_input.fill.assert_awaited_with("tag1")
        tag_item.click.assert_not_awaited()


@pytest.mark.asyncio
class TestRpaDoFieldDesc:
    async def test_fill_description(self, mock_page, selectors, report_progress, throttle, fields):
        desc_input = AsyncMock()
        desc_input.count = AsyncMock(return_value=1)
        mock_page.locator.return_value.first = desc_input

        await rpa_do_field_desc(mock_page, selectors, report_progress, "测试描述内容", fields, throttle)

        desc_input.fill.assert_awaited_with("测试描述内容")

    async def test_skip_when_no_desc_field(self, mock_page, selectors, report_progress, throttle, fields):
        desc_input = AsyncMock()
        desc_input.count = AsyncMock(return_value=0)
        mock_page.locator.return_value.first = desc_input

        await rpa_do_field_desc(mock_page, selectors, report_progress, "内容", fields, throttle)

        desc_input.fill.assert_not_awaited()


@pytest.mark.asyncio
class TestRpaDoPublishClick:
    async def test_publish_draft(self, mock_page, selectors, report_progress, throttle, fields, monitor):
        draft_btn = AsyncMock()
        draft_btn.count = AsyncMock(return_value=1)
        draft_btn.first.click = AsyncMock()
        mock_page.locator.return_value = draft_btn
        monitor.wait_for_response = AsyncMock(return_value={"data": {"item_id": "123"}})

        await rpa_do_publish_click(
            mock_page, selectors, report_progress,
            draft=True, fields=fields, monitor=monitor, throttle=throttle,
        )
        draft_btn.first.click.assert_awaited()

    async def test_publish_no_draft(self, mock_page, selectors, report_progress, throttle, fields, monitor):
        publish_btn = AsyncMock()
        publish_btn.first.click = AsyncMock()
        mock_page.locator.return_value = publish_btn
        monitor.wait_for_response = AsyncMock(return_value={"data": {"item_id": "123"}})

        await rpa_do_publish_click(
            mock_page, selectors, report_progress,
            draft=False, fields=fields, monitor=monitor, throttle=throttle,
        )
        publish_btn.first.click.assert_awaited_with(timeout=10000)

    async def test_publish_fallback_to_alt(self, mock_page, selectors, report_progress, throttle, fields, monitor):
        publish_btn = AsyncMock()
        publish_btn.first.click = AsyncMock(side_effect=Exception("not found"))
        alt_btn = AsyncMock()
        alt_btn.first = AsyncMock()
        alt_btn.first.count = AsyncMock(return_value=1)
        alt_btn.first.click = AsyncMock()

        mock_page.locator.return_value = None
        mock_page.locator.side_effect = None
        mock_page.locator.side_effect = [publish_btn, alt_btn]
        monitor.wait_for_response = AsyncMock(return_value=None)

        await rpa_do_publish_click(
            mock_page, selectors, report_progress,
            draft=False, fields=fields, monitor=monitor, throttle=throttle,
        )
        alt_btn.first.click.assert_awaited()

    async def test_publish_no_api_response(self, mock_page, selectors, report_progress, throttle, fields, monitor):
        publish_btn = AsyncMock()
        publish_btn.first.click = AsyncMock()
        mock_page.locator.return_value = publish_btn
        monitor.wait_for_response = AsyncMock(return_value=None)

        await rpa_do_publish_click(
            mock_page, selectors, report_progress,
            draft=False, fields=fields, monitor=monitor, throttle=throttle,
        )
        publish_btn.first.click.assert_awaited()
