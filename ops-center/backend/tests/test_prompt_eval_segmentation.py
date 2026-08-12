"""分句一致性测试：Python 实现 vs esbuild 打包的桌面端 text-segmentation.ts（node 执行）。"""
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import prompt_eval_segmentation as seg  # noqa: E402

FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "segmentation-ref.mjs")

CORPUS = [
    ("她点燃了柴火，架上铁锅。热气腾腾，香味飘散。", 20, 8, 15),
    ("在一个宁静的村庄里，有一位老妇人正在做饭。她点燃了柴火，架上铁锅。锅里的水慢慢沸腾，蒸汽升腾。", 20, 8, 15),
    ("清晨的阳光洒在庭院。老人推开门，走向菜园。他摘下一把青菜，准备今天的午饭。", 15, 8, 15),
    ("她沿着小路走着，穿过田野，越过小桥。远处传来钟声，教堂的尖顶在暮色中若隐若现。她加快了脚步。", 20, 8, 15),
    # 边界：target 低于 TS 下限 10 → 钳制到 10（calculateTargetWords）
    ("一。一。一。一。一。", 8, 8, 15),
    # 边界：整段无句末标点且超 200 字 → 按 200 字强制分段（maxSentenceLength）
    ("啊，" * 220, 20, 8, 15),
    # 边界：顿号枚举 → 切分点枚举位移（applyEnumerationShift）
    ("她买了苹果、香蕉、橘子、葡萄和西瓜，慢慢走回家。", 20, 8, 15),
    # 边界：target 1（下界）与 200（上界）
    ("今天天气很好。我们一起去公园。", 1, 8, 15),
    ("她点燃了柴火，架上铁锅。热气腾腾，香味飘散。她沿着小路走到院子里。", 200, 8, 15),
]


def _ts_ref(fn, text, **kw):
    code = (
        "import('file:///" + FIXTURE.replace("\\", "/") + "').then(m=>{"
        "const text=process.argv[1];"
        "let out;"
        "if('splitTextToScenes'==='%s'){out=m.splitTextToScenes(text,{config:{scene:{...m.DEFAULT_CONFIG.scene,targetCharsPerScene:Number(process.argv[2])}}});}"
        "else if('splitTextToSubtitles'==='%s'){out=m.splitTextToSubtitles(text,{});}"
        "else {throw new Error('unknown fn');}"
        "console.log(JSON.stringify(out));"
        "}).catch(e=>{console.error('ERR',e.message);process.exit(1)})"
    ) % (fn, fn)
    res = subprocess.run(["node", "-e", code, text, str(kw.get("targetCharsPerScene", 20))],
                         capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        raise RuntimeError(f"TS ref failed: {res.stderr}")
    return json.loads(res.stdout.strip())


@pytest.mark.parametrize("text,target,sub_min,sub_max", CORPUS)
def test_scenes_consistent_with_ts(text, target, sub_min, sub_max):
    ts = _ts_ref("splitTextToScenes", text, targetCharsPerScene=target)
    py = seg.split_to_scenes(text, target_chars_per_scene=target)
    assert py == ts, f"scenes mismatch\npy={py}\nts={ts}"


@pytest.mark.parametrize("text,target,sub_min,sub_max", CORPUS)
def test_subtitles_consistent_with_ts(text, target, sub_min, sub_max):
    ts = _ts_ref("splitTextToSubtitles", text)
    py = seg.split_to_subtitles(text, sub_min, sub_max)
    assert py == ts, f"subtitle mismatch\npy={py}\nts={ts}"


def test_timeline_proportional():
    text = "她点燃了柴火，架上铁锅。热气腾腾。"
    tl = seg.build_subtitle_timeline(text, 12.0)
    assert tl and abs(tl[-1]["endTime"] - 12.0) < 0.01
    assert all(b["startTime"] <= b["endTime"] for b in tl)
    assert all(b["text"] for b in tl)


def test_scene_config_validation():
    assert seg.normalize_scene_config({})["target_chars_per_scene"] == 20
    with pytest.raises(ValueError):
        seg.normalize_scene_config({"target_chars_per_scene": 0})
    with pytest.raises(ValueError):
        seg.normalize_scene_config({"target_chars_per_scene": 201})
    with pytest.raises(ValueError):
        seg.normalize_scene_config({"subtitle_min_chars": 15, "subtitle_max_chars": 10})
    with pytest.raises(ValueError):
        seg.normalize_scene_config({"subtitle_timing": "foo"})
