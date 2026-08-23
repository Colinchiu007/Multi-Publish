"""PromptEval 契约测试：与桌面端 dimensions.js 一致性 + 校验函数。"""
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import prompt_eval_contract as c  # noqa: E402


def _desktop_constants() -> dict:
    """用 node 加载桌面端 dimensions.js，返回 JSON 常量（真实一致性契约）。"""
    repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    mod = os.path.join(repo, "apps", "desktop", "electron", "services", "prompt-eval", "dimensions.js")
    assert os.path.exists(mod), f"桌面端 dimensions.js 不存在: {mod}"
    script = (
        "const d=require(process.argv[1]);"
        "console.log(JSON.stringify({IMAGE_DIMENSIONS:d.IMAGE_DIMENSIONS,VIDEO_DIMENSIONS:d.VIDEO_DIMENSIONS,"
        "PROBLEM_CATEGORIES:d.PROBLEM_CATEGORIES,PROMPT_PART_VALUES:d.PROMPT_PART_VALUES,"
        "OPTIMIZATION_POINT_TYPES:d.OPTIMIZATION_POINT_TYPES,SEVERITIES:d.SEVERITIES,"
        "single:d.resolveDimensionWeights(1),multi:d.resolveDimensionWeights(2)}))"
    )
    out = subprocess.run(["node", "-e", script, mod], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


DESKTOP = None


def _desktop():
    global DESKTOP
    if DESKTOP is None:
        DESKTOP = _desktop_constants()
    return DESKTOP


def test_dimensions_consistent_with_desktop():
    d = _desktop()
    assert [x["id"] for x in d["IMAGE_DIMENSIONS"]] == [x["id"] for x in c.IMAGE_DIMENSIONS]
    assert [x["id"] for x in d["VIDEO_DIMENSIONS"]] == [x["id"] for x in c.VIDEO_DIMENSIONS]
    assert d["PROBLEM_CATEGORIES"] == c.PROBLEM_CATEGORIES
    assert d["PROMPT_PART_VALUES"] == c.PROMPT_PART_VALUES
    assert d["OPTIMIZATION_POINT_TYPES"] == c.OPTIMIZATION_POINT_TYPES
    assert d["SEVERITIES"] == c.SEVERITIES
    assert [w["weight"] for w in d["single"]] == [w["weight"] for w in c.resolve_dimension_weights(1)]
    assert [w["weight"] for w in d["multi"]] == [w["weight"] for w in c.resolve_dimension_weights(2)]


def test_grade_boundaries():
    assert c.grade_for_score(100) == "excellent"
    assert c.grade_for_score(85) == "excellent"
    assert c.grade_for_score(84) == "good"
    assert c.grade_for_score(70) == "good"
    assert c.grade_for_score(69) == "fair"
    assert c.grade_for_score(50) == "fair"
    assert c.grade_for_score(49) == "poor"
    with pytest.raises(ValueError):
        c.grade_for_score(-1)
    with pytest.raises(ValueError):
        c.grade_for_score(101)


def test_dimension_weights():
    single = c.resolve_dimension_weights(1)
    assert [d["id"] for d in single] == ["relevance", "content_accuracy", "aesthetic_quality"]
    assert sum(d["weight"] for d in single) == pytest.approx(1, abs=1e-5)
    multi = c.resolve_dimension_weights(2)
    assert [d["id"] for d in multi] == [d["id"] for d in c.IMAGE_DIMENSIONS]


def test_sensitive_context_recursive():
    with pytest.raises(ValueError, match="password"):
        c.assert_no_sensitive_context({"synopsis": "x", "password": "p"})
    with pytest.raises(ValueError, match="profile.api_key"):
        c.assert_no_sensitive_context({"profile": {"api_key": "sk-1"}})
    with pytest.raises(ValueError, match=r"\[0\]"):
        c.assert_no_sensitive_context({"list": [{"token": "t"}]})
    c.assert_no_sensitive_context({"synopsis": "安全内容", "profile": {"name": "n"}})


def _valid_eval(image_count=1):
    dims = [{"id": d["id"], "score": 80, "evidence": "e", "issues": [], "suggestions": []} for d in c.resolve_dimension_weights(image_count)]
    return {"overall": 80, "dimensions": dims, "problems": [], "promptOptimizationPoints": []}


def test_eval_result_fail_closed():
    c.validate_eval_result(_valid_eval(1), 1)
    c.validate_eval_result(_valid_eval(2), 2)
    with pytest.raises(ValueError, match="overall"):
        c.validate_eval_result({**_valid_eval(), "overall": 101}, 1)
    with pytest.raises(ValueError, match="problems"):
        bad = _valid_eval(); bad.pop("problems")
        c.validate_eval_result(bad, 1)
    with pytest.raises(ValueError, match="problems"):
        c.validate_eval_result({**_valid_eval(), "problems": "none"}, 1)
    with pytest.raises(ValueError, match="promptOptimizationPoints"):
        bad = _valid_eval(); bad.pop("promptOptimizationPoints")
        c.validate_eval_result(bad, 1)
    with pytest.raises(ValueError, match="dimensions"):
        c.validate_eval_result(_valid_eval(1), 2)  # 单图 3 维度提交给多图 → 缺跨图
    bad_score = _valid_eval(); bad_score["dimensions"][0]["score"] = 150
    with pytest.raises(ValueError, match="score"):
        c.validate_eval_result(bad_score, 1)

def test_video_dimension_weights():
    dims = c.resolve_video_dimension_weights()
    assert [d["id"] for d in dims] == ["temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality"]
    assert sum(d["weight"] for d in dims) == pytest.approx(1, abs=1e-5)
    assert [d["weight"] for d in dims] == [0.30, 0.30, 0.20, 0.20]


def test_video_dimensions_consistent_with_desktop():
    d = _desktop()
    assert [x["id"] for x in d["VIDEO_DIMENSIONS"]] == [x["id"] for x in c.VIDEO_DIMENSIONS]
    assert [x["weight"] for x in d["VIDEO_DIMENSIONS"]] == [x["weight"] for x in c.VIDEO_DIMENSIONS]


def _valid_video_eval():
    dims = [{"id": d["id"], "score": 80, "evidence": "e", "issues": [], "suggestions": []} for d in c.resolve_video_dimension_weights()]
    return {"overall": 80, "dimensions": dims, "problems": [], "promptOptimizationPoints": []}


def test_eval_result_video_fail_closed():
    c.validate_eval_result(_valid_video_eval(), 3, media_type="video")
    with pytest.raises(ValueError, match="media_type"):
        c.validate_eval_result(_valid_video_eval(), 3, media_type="audio")
    # 视频维度白名单：图片维度 id 拒绝
    bad = _valid_video_eval()
    bad["dimensions"][0]["id"] = "relevance"
    with pytest.raises(ValueError, match="unknown dimension"):
        c.validate_eval_result(bad, 3, media_type="video")
    # 缺一个视频维度 → 拒绝
    bad = _valid_video_eval()
    bad["dimensions"].pop()
    with pytest.raises(ValueError, match="dimensions"):
        c.validate_eval_result(bad, 3, media_type="video")
    # 图片路径不受影响：视频 4 维提交给图片 → 拒绝
    with pytest.raises(ValueError, match="unknown dimension"):
        c.validate_eval_result(_valid_video_eval(), 3, media_type="image")


def test_build_eval_prompt_video():
    from services.prompt_eval_evaluation_service import build_eval_prompt
    prompt = build_eval_prompt("原文", None, "提示词", "EN", 3, media_type="video")
    for dim_id in ("temporal_consistency", "motion_accuracy", "audio_visual_sync", "video_aesthetic_quality"):
        assert dim_id in prompt
    assert "首/中/尾" in prompt
    assert "cross_image_consistency" not in prompt
    # 图片默认路径不变
    img = build_eval_prompt("原文", None, "提示词", "EN", 1)
    assert "relevance" in img and "temporal_consistency" not in img
