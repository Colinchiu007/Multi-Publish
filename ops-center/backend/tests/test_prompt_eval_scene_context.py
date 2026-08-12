"""场景上下文服务测试。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import prompt_eval_scene_context as sc  # noqa: E402


def test_extract_era_and_culture():
    ctx = sc.extract_scene_context("在唐朝长安城的一个民居里，一位老妇人正在用柴火做饭。")
    assert ctx.get("era") == "唐朝"
    assert ctx.get("culture") == "中国"
    assert "negative_anchors" in ctx


def test_visual_style_and_tone():
    ctx = sc.extract_scene_context("电影感画面，温暖的光线洒在庭院里，炊烟袅袅。")
    assert ctx.get("visual_style") == "电影感"
    assert ctx.get("tone") == "温暖"


def test_whitelist_keys_only():
    ctx = sc.extract_scene_context("测试文案")
    assert set(ctx.keys()).issubset(set(sc.SCENE_CONTEXT_KEYS))
    sc.assert_known_keys(ctx)


def test_assert_unknown_key_fails():
    with pytest.raises(ValueError):
        sc.assert_known_keys({"bad_key": 1})


def test_summary_limited():
    ctx = sc.extract_scene_context("字" * 500)
    assert len(ctx.get("summary", "")) <= 200
