"""Pagination utilities ? ?????

? TikHub SDK _pagination.py ?????:
- OffsetPaginator: ???????? (page/page_size)
- CursorPaginator: ???????
- Page: ????????
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Generic, Optional, TypeVar

T = TypeVar("T")

__all__ = ["OffsetPaginator", "CursorPaginator", "Page"]


class OffsetPaginator:
    """?????????

    API ?? page/page_size ??????????
    """

    def build_params(self, page: int = 1, page_size: int = 20) -> dict[str, int]:
        return {"page": page, "page_size": page_size}

    def has_next(self, total: int, page: int = 1, page_size: int = 20) -> bool:
        return page * page_size < total

    def next_page(self, page: int = 1) -> int:
        return page + 1


class CursorPaginator:
    """????????

    API ?? cursor ?????????
    """

    def build_params(self, cursor: Optional[str] = None, page_size: int = 20) -> dict[str, Any]:
        params: dict[str, Any] = {"page_size": page_size}
        if cursor is not None:
            params["cursor"] = cursor
        return params

    def has_more(self, cursor: Optional[str]) -> bool:
        return cursor is not None and cursor != ""


@dataclass
class Page(Generic[T]):
    """??????

    Attributes:
        items: ???????
        total: ???? API ????? None?
        page: ??????????
        cursor: ???????????
        page_size: ????
        has_more: ????????
    """
    items: list[T] = field(default_factory=list)
    total: Optional[int] = None
    page: int = 1
    cursor: Optional[str] = None
    page_size: int = 20
    has_more: bool = False
