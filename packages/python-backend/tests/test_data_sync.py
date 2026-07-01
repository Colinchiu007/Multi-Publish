"""Tests for DataSyncService — real API v2"""
import pytest
from multi_publish.core.data_sync import DataSyncService, SyncType, get_data_sync_service


def test_sync_type_values():
    assert SyncType.ACCOUNT_OVERVIEW == "accountOverView"
    assert SyncType.CONTENT_LIST == "contentList"


def test_get_data_sync_service_singleton():
    dss1 = get_data_sync_service()
    dss2 = get_data_sync_service()
    assert dss1 is dss2


def test_data_sync_init():
    dss = DataSyncService()
    assert dss is not None
    assert hasattr(dss, "_tasks")


def test_push_data_sync():
    dss = DataSyncService()
    dss.push("weibo", "acc_01", "微博A", "cookie",
             SyncType.ACCOUNT_OVERVIEW, lambda a, b, c: None)
    assert len(dss._tasks) > 0


@pytest.mark.asyncio
async def test_data_sync_start_stop():
    dss = DataSyncService()
    await dss.start()
    assert dss._running is True
    await dss.stop()
    assert dss._running is False
