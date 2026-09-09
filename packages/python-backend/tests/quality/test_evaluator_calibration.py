# -*- coding: utf-8 -*-
"""ContentQualityEvaluator 校准回归测试。

背景：v1 评估器存在系统性偏差 —— 人工高质量短文仅 60 分、AI 味模板文章 59 分，
区分度不足 3 分，无法支撑「最近 100 篇平均分 >= 70 达标」的质量标准。

本测试锁定校准目标（v1.1）：
1. 人工高质量短文（影评/种草/菜谱/攻略）平均分 >= 70（B 级达标）
2. AI 味模板文章平均分 <= 62
3. 人工 vs AI 味区分度 >= 8 分
4. 情感词不得因单字「美/光」误匹配普通词而虚高（阳光/眼光/美好）
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

from multi_publish.aggregation.quality.evaluator import (  # noqa: E402
    QUALITY_DIMENSIONS,
    ContentQualityEvaluator,
)


def _mk():
    return ContentQualityEvaluator()


# 人工高质量短文样本（平台真实风格）
HUMAN_ARTICLES = [
    (
        "微博",
        "刚刚看完这部电影首映，真的震撼到我了！全程无尿点，从第一分钟开始就抓住你的注意力。"
        "演员演技在线，特别是主角在雨中的那场戏，眼神里的挣扎和绝望，看得我头皮发麻。"
        "导演的镜头语言也很高级，很多细节都值得二刷三刷。豆瓣评分已经冲到8.9分了，果然群众的眼睛是雪亮的。"
        "还没看的朋友抓紧安排，这绝对是年度必看！",
    ),
    (
        "小红书",
        "姐妹们！最近发现了一个超级好用的收纳神器，真的忍不住要分享给大家！"
        "就是那种透明抽屉式收纳盒，把化妆品、首饰、小物件统统分门别类装好，桌面瞬间清爽了不止一点点。"
        "我买的是三层的，每个抽屉都有分隔板，可以根据东西大小自由调整。用了两周，家里再也没有乱糟糟的时候了。"
        "关键价格也很友好，不到五十块钱，性价比超高！真心推荐给每一个收纳困难户，赶紧冲！",
    ),
    (
        "抖音",
        "三分钟教你做一道惊艳全家的糖醋排骨！不用油炸，不用复杂调料，新手一次成功！"
        "首先把排骨焯水去腥，然后调一个万能糖醋汁：一勺料酒、两勺生抽、三勺糖、四勺醋，比例记好就成功了一半！"
        "锅里少油，排骨煎到两面金黄，倒入料汁，小火焖二十分钟，最后大火收汁，撒上白芝麻！"
        "看这色泽，看这拉丝，馋哭隔壁小孩！喜欢记得点赞收藏，评论区告诉我你想学什么菜！",
    ),
    (
        "知乎",
        "为什么说大模型正在重塑软件开发的整个流程？我认为这不是一个短期炒作，而是结构性变革。"
        "原因有三：第一，编码辅助工具已经证明能提升20%-30%的开发效率；"
        "第二，需求分析、测试用例、文档生成这些环节正在被自动化；"
        "第三，软件开发的门槛正在降低，非专业人士也能通过自然语言构建应用。"
        "然而，我们也必须看到，大模型仍然存在幻觉、上下文窗口限制等问题，短期内无法完全替代资深工程师的判断力。"
        "未来，人与AI协作将成为主流工作模式。",
    ),
    (
        "B站",
        "今天这期视频，咱们来聊聊最近爆火的这款开放世界游戏。说实话，我一开始是抱着试试看的心态入坑的，结果一玩就停不下来了！"
        "这游戏的自由度真的绝了，地图大到离谱，随便走到哪都有新发现。战斗系统也很有深度，不同武器搭配不同技能，能玩出完全不同的流派。"
        "唯一的缺点就是优化还有待提升，帧数偶尔会掉。不过瑕不掩瑜，这绝对是我今年玩过最好玩的游戏之一。"
        "如果你还没玩过，强烈建议试一试！",
    ),
    (
        "微信公众号",
        "今天想跟大家聊一个很现实的问题：为什么我们越努力，反而越焦虑？"
        "我观察了身边很多朋友，发现一个共同点：他们都在用战术上的勤奋掩盖战略上的懒惰。"
        "每天加班到深夜，却从不停下来想想方向对不对；报了很多课，却一个都没学完。"
        "上周我和一位创业十年的前辈聊天，他说了一句让我醍醐灌顶的话：慢就是快。"
        "与其盲目奔跑，不如先想清楚要去哪里。希望对你有启发，欢迎在评论区聊聊你的想法。",
    ),
]


# AI 味模板文章（v1 检测不足、得分虚高的典型）
AI_ARTICLES = [
    "在当今社会，随着科技的不断发展，人工智能已经成为了人们生活中不可或缺的一部分。"
    "首先，我们应该认识到人工智能的重要性。其次，我们需要了解人工智能的应用领域。"
    "最后，综上所述，人工智能的发展趋势是不可逆转的，我们每个人都有责任去学习和适应这一趋势。"
    "值得注意的是，未来人工智能将会在越来越多的领域发挥作用。",
    "随着社会的进步和经济的发展，教育问题日益受到人们的关注。"
    "首先，教育改革势在必行。其次，我们要加强师资队伍建设。再次，要注重学生的全面发展。"
    "综上所述，教育事业的繁荣发展需要全社会共同努力，我们相信在党和政府的正确领导下，我国的教育事业必将迎来更加美好的明天。",
    "在当今快速发展的时代背景下，健康问题越来越受到人们的重视。"
    "首先，合理膳食是保持健康的基础。其次，适量运动能够增强体质。"
    "再者，良好的作息习惯对身体健康至关重要。综上所述，只有养成健康的生活方式，我们才能真正拥有健康的身体。",
]


def test_human_articles_average_reaches_70():
    """人工高质量短文平均分应 >= 70（B 级达标线）。"""
    ev = _mk()
    scores = []
    for platform, text in HUMAN_ARTICLES:
        r = ev.evaluate(text, None, platform, "")
        scores.append(r.overall_score)
    avg = sum(scores) / len(scores)
    assert avg >= 70, f"人工文章平均分 {avg:.1f} 未达标（要求 >=70），明细: {[round(s,1) for s in scores]}"


def test_ai_articles_average_stays_low():
    """AI 味模板文章平均分应 <= 62。"""
    ev = _mk()
    scores = []
    for text in AI_ARTICLES:
        r = ev.evaluate(text, None, "通用", "")
        scores.append(r.overall_score)
    avg = sum(scores) / len(scores)
    assert avg <= 62, f"AI 味文章平均分 {avg:.1f} 过高（要求 <=62），明细: {[round(s,1) for s in scores]}"


def test_discrimination_between_human_and_ai():
    """人工 vs AI 味区分度应 >= 8 分。"""
    ev = _mk()
    human_avg = sum(ev.evaluate(t, None, p, "").overall_score for p, t in HUMAN_ARTICLES) / len(HUMAN_ARTICLES)
    ai_avg = sum(ev.evaluate(t, None, "通用", "").overall_score for t in AI_ARTICLES) / len(AI_ARTICLES)
    assert human_avg - ai_avg >= 8, f"区分度 {human_avg - ai_avg:.1f} 不足（要求 >=8）"


def test_quality_dimension_contract_is_fixed_and_normalized():
    """15 个固定维度必须唯一且权重总和为 1，避免统计和总分漂移。"""
    assert len(QUALITY_DIMENSIONS) == 15
    assert len({dimension["id"] for dimension in QUALITY_DIMENSIONS}) == 15
    assert sum(dimension["weight"] for dimension in QUALITY_DIMENSIONS) == pytest.approx(1.0)


def test_non_clone_divergence_is_not_applicable_or_included_in_overall():
    """无原文时克隆差异度是 N/A，综合分只按其余适用维度归一化。"""
    ev = _mk()
    report = ev.evaluate("我亲自试了这个方法，过程虽然有波折，但结果比预想好很多。" * 3, None, "通用", "")
    clone = next(d for d in report.dimensions if d.id == "clone_divergence")
    assert clone.applicable is False
    assert clone.score == 0
    assert clone.weighted == 0
    applicable = [d for d in report.dimensions if d.applicable]
    expected = sum(d.score * d.weight for d in applicable) / sum(d.weight for d in applicable)
    assert report.overall_score == round(expected, 1)
    assert all("克隆差异度" not in item for item in report.warnings + report.suggestions)


def test_keyword_density_is_not_applicable_when_content_is_too_short_to_measure():
    """20-49 字内容允许评估，但不足以可靠得出 n-gram 密度。"""
    ev = _mk()
    report = ev.evaluate("这段短文刚好满足运营中心的最小输入长度，用于验证关键词密度不能伪装成中性分。", None, "通用", "")
    keyword_density = next(d for d in report.dimensions if d.id == "keyword_density")
    assert keyword_density.applicable is False
    assert keyword_density.weighted == 0
    assert "无法评估" in keyword_density.evidence[0]


def test_sentence_dependent_dimensions_are_not_applicable_without_a_sentence():
    """仅有标点的输入没有可读性、信息密度或关键词密度信号。"""
    ev = _mk()
    report = ev.evaluate("！？！？！？！？！？！？！？！？！？！？", None, "通用", "")
    dimensions = {dimension.id: dimension for dimension in report.dimensions}
    for dimension_id in ("readability", "information_density", "keyword_density"):
        assert dimensions[dimension_id].applicable is False
        assert dimensions[dimension_id].weighted == 0


def test_collective_we_is_not_counted_as_personal_originality():
    """“我们”式模板不能冒充个人第一人称原创视角。"""
    ev = _mk()
    report = ev.evaluate("我们应该持续学习，我们必须适应变化，我们可以共同努力。" * 3, None, "通用", "")
    originality = next(dimension for dimension in report.dimensions if dimension.id == "originality")
    assert not any("第一人称视角" in evidence for evidence in originality.evidence)


def test_quality_report_serialization_has_a_shared_dimension_contract():
    """改写引擎和运营中心必须使用同一份纯评估报告序列化合同。"""
    from multi_publish.aggregation.quality.evaluator import serialize_quality_report

    report = _mk().evaluate("我亲自测试了这个方法，结果很有启发，也欢迎大家在评论区交流。" * 3, None, "通用", "")
    payload = serialize_quality_report(report)
    assert set(payload) == {
        "overall_score", "grade", "grade_label", "word_count",
        "sentence_count", "paragraph_count", "dimensions", "summary",
        "warnings", "suggestions",
    }
    assert len(payload["dimensions"]) == 15
    assert set(payload["dimensions"][0]) == {
        "id", "label", "score", "weight", "weighted", "evidence", "applicable",
    }


def test_clone_divergence_remains_applicable_when_original_is_supplied():
    """克隆模式提供原文时，差异度仍为可量化的有效维度。"""
    ev = _mk()
    report = ev.evaluate("这是一篇完全不同的旅行见闻，包含新的路线和体验。" * 3, "原文讨论的是厨房收纳和清洁方法。" * 3, "通用", "")
    clone = next(d for d in report.dimensions if d.id == "clone_divergence")
    assert clone.applicable is True
    assert clone.weighted == clone.score * clone.weight


def test_template_ordering_is_not_counted_as_genuine_structure():
    """AI 的首先/其次/最后模板不应因同一信号获得结构分点加分。"""
    ev = _mk()
    text = (
        "在当今社会，人工智能影响深远。首先，我们分析技术背景。"
        "其次，我们讨论应用领域。最后，我们总结未来趋势。综上所述，发展不可逆转。"
    )
    structure = next(d for d in ev.evaluate(text, None, "通用", "").dimensions if d.id == "structure")
    assert not any("使用分点结构" in item for item in structure.evidence)
    assert structure.score <= 58


def test_first_person_narrative_counts_without_second_person():
    """书面第一人称叙事即使没有反复使用“你”也应体现人类表达。"""
    ev = _mk()
    text = (
        "我观察了身边很多朋友，也记录了自己这一年的变化。"
        "我一开始并不相信，后来我亲自尝试，才发现这个方法确实有效。"
        "我把经验整理下来，希望给同样困惑的人一点参考。"
    )
    human = next(d for d in ev.evaluate(text, None, "通用", "").dimensions if d.id == "human_likeness")
    assert any("第一人称" in item or "人称交互" in item for item in human.evidence)
    assert human.score >= 65


def test_single_char_emotion_words_no_false_positive():
    """普通词中的单字 '美/光'（阳光/眼光/美好）不得造成情感分虚高。"""
    ev = _mk()
    r = ev.evaluate("今天的阳光很好，我坐在窗边看风景，觉得生活很美好。", None, "通用", "")
    emo = next(d for d in r.dimensions if d.id == "emotional_resonance")
    # 校准后该文本（无强烈情感、无情绪词）情感分应处于中性区间（45-65），不得 >= 70
    assert 45 <= emo.score <= 65, f"情感分 {emo.score} 异常（阳光/美好被误判为强烈情感）"
