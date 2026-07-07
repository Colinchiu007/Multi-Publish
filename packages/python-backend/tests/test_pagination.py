"""Tests for pagination utilities."""

from multi_publish._pagination import CursorPaginator, OffsetPaginator, Page


class TestOffsetPaginator:
    def test_build_params_default(self):
        p = OffsetPaginator()
        assert p.build_params() == {"page": 1, "page_size": 20}

    def test_build_params_custom(self):
        p = OffsetPaginator()
        assert p.build_params(page=3, page_size=50) == {"page": 3, "page_size": 50}

    def test_has_next_true(self):
        assert OffsetPaginator().has_next(total=100, page=1, page_size=20)

    def test_has_next_false(self):
        assert not OffsetPaginator().has_next(total=20, page=1, page_size=20)

    def test_has_next_exact_boundary(self):
        assert not OffsetPaginator().has_next(total=40, page=2, page_size=20)

    def test_next_page(self):
        assert OffsetPaginator().next_page(page=1) == 2
        assert OffsetPaginator().next_page(page=5) == 6


class TestCursorPaginator:
    def test_build_params_no_cursor(self):
        p = CursorPaginator()
        assert p.build_params(page_size=30) == {"page_size": 30}

    def test_build_params_with_cursor(self):
        p = CursorPaginator()
        assert p.build_params(cursor="abc123") == {"page_size": 20, "cursor": "abc123"}

    def test_has_more_true(self):
        assert CursorPaginator().has_more("next_cursor")

    def test_has_more_false_none(self):
        assert not CursorPaginator().has_more(None)

    def test_has_more_false_empty(self):
        assert not CursorPaginator().has_more("")


class TestPage:
    def test_defaults(self):
        p = Page[int]()
        assert p.items == []
        assert p.total is None
        assert p.page == 1
        assert p.page_size == 20
        assert not p.has_more

    def test_with_items(self):
        p = Page(items=[1, 2, 3], total=100, page=2, page_size=10, has_more=True)
        assert len(p.items) == 3
        assert p.total == 100
        assert p.has_more
