"""Tests for AccountStore — 账号持久化存储."""


import pytest

from multi_publish.account_store import AccountStore
from multi_publish.models import PlatformAccount, PlatformType


class TestAccountStore:
    @pytest.fixture
    def store(self, tmp_path):
        p = tmp_path / "accounts.json"
        return AccountStore(storage_path=p)

    def test_init_creates_dir(self, store):
        assert store.storage_path.parent.exists()

    def test_add_account(self, store):
        acc = PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="A", config={})
        store.add_account(acc)
        assert store.get_account("a1") is acc

    def test_list_accounts(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="A", config={}))
        store.add_account(PlatformAccount(id="a2", platform=PlatformType.BILIBILI, name="B", config={}))
        assert len(store.list_accounts()) == 2

    def test_get_account(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="A", config={}))
        acc = store.get_account("a1")
        assert acc is not None and acc.id == "a1"

    def test_get_nonexistent(self, store):
        assert store.get_account("nonexistent") is None

    def test_delete_account(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="A", config={}))
        store.delete_account("a1")
        assert store.get_account("a1") is None

    def test_persistence_across_reload(self, tmp_path):
        p = tmp_path / "accounts.json"
        s1 = AccountStore(storage_path=p)
        s1.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="A", config={}))
        s2 = AccountStore(storage_path=p)
        acc = s2.get_account("a1")
        assert acc is not None and acc.name == "A"

    def test_list_by_platform(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="D1", config={}))
        store.add_account(PlatformAccount(id="a2", platform=PlatformType.DOUYIN, name="D2", config={}))
        store.add_account(PlatformAccount(id="a3", platform=PlatformType.BILIBILI, name="B1", config={}))
        dy = store.list_accounts(platform=PlatformType.DOUYIN)
        assert len(dy) == 2

    def test_update_account(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="Old", config={}))
        store.update_account("a1", {"name": "New Name"})
        assert store.get_account("a1").name == "New Name"

    def test_get_config_for_platform(self, store):
        store.add_account(PlatformAccount(id="a1", platform=PlatformType.DOUYIN, name="D1", config={"key": "val"}))
        cfg = store.get_config_for_platform(PlatformType.DOUYIN)
        assert cfg is not None
        assert cfg["key"] == "val"
