"""ContentQualityEvaluator - 15-dimension content quality evaluation engine."""
import re
import math
from dataclasses import dataclass, field
from typing import Optional
from collections import Counter

QUALITY_DIMENSIONS = [
    {"id": "viral_potential", "label": "爆款潜力", "weight": 0.12},
    {"id": "logic", "label": "逻辑性", "weight": 0.10},
    {"id": "engagement", "label": "趣味性", "weight": 0.08},
    {"id": "human_likeness", "label": "去AI味", "weight": 0.10},
    {"id": "compliance", "label": "违规风险", "weight": 0.10},
    {"id": "readability", "label": "易读性", "weight": 0.10},
    {"id": "clone_divergence", "label": "克隆差异度", "weight": 0.06},
    {"id": "information_density", "label": "信息密度", "weight": 0.06},
    {"id": "emotional_resonance", "label": "情感共鸣", "weight": 0.06},
    {"id": "structure", "label": "结构完整性", "weight": 0.06},
    {"id": "originality", "label": "原创性", "weight": 0.04},
    {"id": "platform_fitness", "label": "平台适配", "weight": 0.04},
    {"id": "keyword_density", "label": "关键词密度", "weight": 0.03},
    {"id": "call_to_action", "label": "CTA", "weight": 0.03},
    {"id": "brand_consistency", "label": "品牌一致性", "weight": 0.02},
]

@dataclass
class DimensionScore:
    id: str
    label: str
    score: float
    weight: float
    weighted: float
    evidence: list = field(default_factory=list)
    # A dimension can be present in the fixed 15-item report while not being
    # computable for this input (for example, clone divergence without source).
    applicable: bool = True

    def __post_init__(self):
        self.score = max(0.0, min(100.0, float(self.score)))
        self.weighted = self.score * self.weight if self.applicable else 0.0

@dataclass
class QualityReport:
    overall_score: float
    grade: str
    grade_label: str
    dimensions: list
    word_count: int
    sentence_count: int
    paragraph_count: int
    summary: str
    warnings: list = field(default_factory=list)
    suggestions: list = field(default_factory=list)
    original_content: str = ""
    rewritten_content: str = ""

def _lookup_dim(dim_id):
    for d in QUALITY_DIMENSIONS:
        if d["id"] == dim_id:
            return d
    return {"id": dim_id, "label": dim_id, "weight": 0.05}

def _split_sentences(text):
    if not text: return []
    parts = re.split(r"[。！？；\n!?;]+", text)
    return [p.strip() for p in parts if p.strip()]

def _extract_ngrams(text, min_n, max_n):
    chars = re.sub(r"[^\u4e00-\u9fa5a-zA-Z]", "", text)
    ngrams = []
    for n in range(min_n, max_n + 1):
        for i in range(len(chars) - n + 1):
            ngrams.append(chars[i:i + n])
    return Counter(ngrams).most_common(20)

def _grade(score):
    if score >= 90: return ("A+", "优秀")
    elif score >= 80: return ("A", "良好")
    elif score >= 70: return ("B", "一般")
    elif score >= 60: return ("C", "较差")
    else: return ("D", "差")

_SENSITIVE_PATTERNS = [
    (re.compile(r"习近平|胡锦涛|江泽民|邓小平|毛泽东|周恩来|政治局|中央委员会"), 30),
    (re.compile(r"台湾独立|台湾国|两个中国|西藏独立|新疆独立|香港独立|六四|天安门|法轮功"), 40),
    (re.compile(r"色情|淫秽|裸体|裸聊|约炮|一夜情|性交|做爱|妓女|嫖娼|卖淫"), 25),
    (re.compile(r"杀人|谋杀|杀害|砍死|捅死|炸死|枪杀|自杀|自残|自伤|割腕"), 30),
    (re.compile(r"暴力|血腥|恐怖|绑架|勒索|虐待|殴打|群殴|斗殴"), 20),
    (re.compile(r"枪支|弹药|炸弹|炸药|雷管|管制刀具|毒品|吸毒|贩毒"), 25),
    (re.compile(r"赌博|赌场|赌球|赌马|彩票|六合彩|网赌|博彩"), 20),
    (re.compile(r"诈骗|骗局|传销|庞氏|非法集资|高利贷|套路贷"), 15),
]

_AI_PATTERNS = [
    (re.compile(r"首先.*其次.*最后|一方面.*另一方面"), -8),
    (re.compile(r"值得注意的是|值得一提的是|需要指出的是|不可否认|毫无疑问"), -5),
    (re.compile(r"综上所述|总而言之|总的来说|概括而言|简而言之"), -5),
    (re.compile(r"在当今社会|随着.*的发展|近年来|众所周知|不言而喻"), -4),
    (re.compile(r"我们可以.*|我们能够.*|我们应该.*|我们必须.*"), -3),
    # v1.1 校准：补充高频 AI 模板词（无明显人类口语色彩）
    (re.compile(r"不可或缺|日益受到|日益关注|息息相关|发挥着(越来|重要|关键)作用|时代背景下|随着社会的进步"), -6),
    (re.compile(r"在党和政府的正确领导下|必将迎来|势在必行|众所周知的是"), -8),
]

_HUMAN_PATTERNS = [
    (re.compile(r"卧槽|牛逼|绝了|太绝了|我靠|我的天|绝绝子|真的假的|不是吧|离谱|上头|神仙"), 8),
    (re.compile(r"说真的|说实话|讲真|老实说|我跟你讲|你知道吗|你想想|我跟你说"), 6),
    (re.compile(r"哈哈哈|笑死|笑不活了|破防了|绷不住了|真香|yyds|谁懂|服了"), 5),
    # v1.1 校准：真实平台口语开场/互动词（小红书/抖音/微博高频）
    (re.compile(r"姐妹们|家人们|宝子们|亲们|集美们|兄弟姐妹们|uu们"), 10),
    (re.compile(r"真的忍不住|必须安利|吐血推荐|真心推荐|亲测|被种草|入坑|上头|闭眼入"), 6),
    (re.compile(r"你品品|细品|懂自懂|谁懂啊|家人们谁懂|这就对了|就这"), 5),
]

# v1.1 校准：修复单字「美/光」误匹配。情感词按词级匹配，
# 移除单字「美」「光」；「美好/光芒/阳光/眼光」等不再被拆词计数。
_POSITIVE_EMOTION = re.compile(r"感动|温暖|幸福|快乐|开心|美好|惊喜|震撼|激动|泪目|治愈|暖心|燃|热血|励志|鼓舞|希望|充满爱|有爱|心动|喜欢|超爱|yyds|上头|绝了|离谱|惊艳|爽|炸|香|服了")
_NEGATIVE_EMOTION = re.compile(r"愤怒|悲伤|难过|痛苦|绝望|恐惧|焦虑|压抑|崩溃|心碎|无助|孤独|委屈|心酸|扎心|残酷|难受|揪心|心疼|破防")

_CTA_PATTERNS = [
    (re.compile(r"关注|点赞|收藏|转发|分享|评论|留言|订阅|扫码|加微信|加好友|私信"), 8),
    (re.compile(r"点击|查看|了解更多|查看更多|阅读原文|戳|戳我|戳这里"), 5),
    (re.compile(r"赶紧|赶快|快来|速来|马上|立即|立刻|现在就|别错过|不要错过|抓紧"), 4),
    (re.compile(r"你觉得|你怎么看|你会|你敢|你能|你愿意|你是否|评论区|告诉我|告诉我你|码住|三连|蹲一个"), 3),
]

_PLATFORM_KEYWORDS = {
    "微信": ["公众号","微信","朋友圈","好友","聊天","小程序"],
    "抖音": ["抖音","短视频","BGM","热门","挑战","同款"],
    "小红书": ["小红书","种草","拔草","安利","测评","好物","笔记"],
    "知乎": ["知乎","盐选","高赞","谢邀","码住","收藏"],
    "微博": ["微博","热搜","话题","超话","吃瓜","打卡"],
    "B站": ["B站","bilibili","弹幕","UP主","三连","投币"],
    "通用": [],
}

_SUGGESTION_MAP = {
    "viral_potential": "增加热点话题和数据引用，使用悬念式标题",
    "logic": "增加因果推理和转折论证，控制句子长度",
    "engagement": "增加案例和故事，使用对话式表达提升互动感",
    "human_likeness": "减少模板化表达，增加口语化和个性化元素",
    "compliance": "检查并移除敏感内容，确保合规",
    "readability": "缩短句子和段落，使用更简单的词汇",
    "clone_divergence": "增加原创观点和独特表达，降低与原文的相似度",
    "information_density": "增加数据引用和具体案例，减少填充词",
    "emotional_resonance": "增加情感色彩词汇，使用感叹和问句增强互动",
    "structure": "完善开头、中间和结尾结构，增加段落过渡词",
    "originality": "增加个人观点，减少陈词滥调",
    "platform_fitness": "根据目标平台特点调整内容风格",
    "keyword_density": "优化核心关键词密度和分布",
    "call_to_action": "增加引导用户行动的CTA语句",
    "brand_consistency": "统一语气风格，避免正式/口语混杂",
}

def _collect_suggestions(dims):
    return [
        _SUGGESTION_MAP[d.id]
        for d in dims
        if d.applicable and d.score < 60 and d.id in _SUGGESTION_MAP
    ][:5]

def _collect_warnings(dims):
    return [
        f"[{d.label}] 评分过低 ({d.score:.0f}/100)"
        for d in dims
        if d.applicable and d.score < 40
    ]

def _generate_summary(overall, grade_label, dims):
    if overall >= 80: return f"内容质量{grade_label}（{overall:.0f}分），整体表现优秀，适合直接发布。"
    elif overall >= 70: return f"内容质量{grade_label}（{overall:.0f}分），基本达标，建议优化短板维度后发布。"
    elif overall >= 60: return f"内容质量{grade_label}（{overall:.0f}分），存在明显短板，建议针对性优化后发布。"
    else: return f"内容质量{grade_label}（{overall:.0f}分），多项维度不达标，建议重新改写。"


def serialize_quality_report(report):
    """Serialize the evaluator-owned report contract for all callers.

    Keeping this projection next to the dataclasses prevents the aggregation
    service and OpsCenter from silently drifting as dimensions evolve.
    """
    return {
        "overall_score": report.overall_score,
        "grade": report.grade,
        "grade_label": report.grade_label,
        "word_count": report.word_count,
        "sentence_count": report.sentence_count,
        "paragraph_count": report.paragraph_count,
        "dimensions": [
            {
                "id": dimension.id,
                "label": dimension.label,
                "score": round(dimension.score, 1),
                "weight": dimension.weight,
                "weighted": round(dimension.weighted, 1),
                "evidence": list(dimension.evidence),
                "applicable": dimension.applicable,
            }
            for dimension in report.dimensions
        ],
        "summary": report.summary,
        "warnings": list(report.warnings),
        "suggestions": list(report.suggestions),
    }


class ContentQualityEvaluator:
    """15-dimension content quality evaluator.
    
    Usage:
        evaluator = ContentQualityEvaluator()
        report = evaluator.evaluate(rewritten_content, original_content=None, platform="通用")
        print(report.overall_score, report.grade)
    """

    def evaluate(self, content, original_content=None, platform="通用", title=""):
        content = (content or "").strip()
        if not content:
            return QualityReport(
                overall_score=0, grade="D", grade_label="差",
                dimensions=[], word_count=0, sentence_count=0,
                paragraph_count=0, summary="内容为空",
            )
        sentences = _split_sentences(content)
        paragraphs = [p for p in content.split("\n") if p.strip()]
        words = len(content.replace(" ", ""))
        dims = [
            self._score_viral_potential(content, title, words, sentences),
            self._score_logic(content, sentences, paragraphs, words),
            self._score_engagement(content, sentences, words),
            self._score_human_likeness(content, words),
            self._score_compliance(content),
            self._score_readability(content, words, sentences),
            self._score_clone_divergence(content, original_content),
            self._score_information_density(content, words, sentences),
            self._score_emotional_resonance(content),
            self._score_structure(content, paragraphs, sentences),
            self._score_originality(content),
            self._score_platform_fitness(content, platform),
            self._score_keyword_density(content, words),
            self._score_cta(content),
            self._score_brand_consistency(content),
        ]
        applicable_dims = [d for d in dims if d.applicable]
        applicable_weight = sum(d.weight for d in applicable_dims)
        # Keep all 15 dimensions visible, but never let an unavailable signal
        # masquerade as a neutral quality score in the overall result.
        overall = (sum(d.weighted for d in applicable_dims) / applicable_weight if applicable_weight > 0 else 0)
        grade, grade_label = _grade(overall)
        return QualityReport(
            overall_score=round(overall, 1),
            grade=grade, grade_label=grade_label,
            dimensions=dims, word_count=words,
            sentence_count=len(sentences),
            paragraph_count=len(paragraphs),
            summary=_generate_summary(overall, grade_label, dims),
            warnings=_collect_warnings(dims),
            suggestions=_collect_suggestions(dims),
            original_content=original_content or "",
            rewritten_content=content,
        )

    def _score_viral_potential(self, content, title, words, sentences):
        dim = _lookup_dim("viral_potential")
        score, evidence = 50.0, []
        title_len = len(title) if title else 0
        if 15 <= title_len <= 30: score += 10; evidence.append(f"标题长度适中({title_len}字)")
        elif title_len > 30: score -= 5
        elif title_len > 0: score += 3
        if title:
            qc = title.count("？") + title.count("?")
            ec = title.count("！") + title.count("!")
            if qc >= 1 and ec >= 1: score += 8; evidence.append("标题含问号+感叹号")
            elif qc >= 1: score += 5
        dc = len(re.findall(r"\d+", content[:500]))
        if dc >= 4: score += 8; evidence.append(f"含{dc}处数据引用")
        elif dc >= 1: score += 4; evidence.append("含数据/数字")
        hot_words = ["爆款","必须","秘密","终极","指南","真相","揭秘","曝光","颠覆","震惊","绝了","惊呆","绝了"]
        hh = sum(1 for w in hot_words if w in content[:500])
        if hh >= 3: score += 10; evidence.append(f"含{hh}个热点词")
        elif hh >= 1: score += 5
        if 1000 <= words <= 3000: score += 5; evidence.append(f"内容长度适中({words}字)")
        elif words > 5000: score -= 5
        elif 200 <= words < 1000: score += 3; evidence.append("内容长度适合快节奏阅读")
        if "？" in content[:80] or "?" in content[:80]: score += 5; evidence.append("开头含悬念")
        qc = content[:200].count("？") + content[:200].count("?")
        if qc >= 2: score += 4; evidence.append("含互动问句")
        # v1.1 校准：短文钩子信号（口语开场/感叹密度/结尾CTA）同样提升爆款潜力
        hook_words = ["姐妹们","家人们","今天","三分钟","为什么","最近","刚刚","重磅","必看"]
        if any(w in content[:40] for w in hook_words): score += 6; evidence.append("口语开场钩子强")
        ex = content.count("！") + content.count("!")
        if ex >= 4: score += 5; evidence.append(f"感叹句密集({ex}处)，情绪张力强")
        cta_end = ["记得","赶紧","冲","试试","必看","收藏","评论区","安排"]
        if any(w in content[-80:] for w in cta_end): score += 5; evidence.append("结尾CTA有力")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_logic(self, content, sentences, paragraphs, words):
        dim = _lookup_dim("logic")
        score, evidence = 65.0, []
        # v1.1 校准：短文（<300 字）是平台常态（小红书/抖音/微博），
        # 不再因「段落数不足/句子数少」系统性扣分；长文才要求结构。
        is_short = words < 300
        if len(sentences) < 3 and not is_short: score -= 20; evidence.append("句子数过少")
        elif len(sentences) >= 10: score += 5
        if len(paragraphs) >= 5: score += 8; evidence.append(f"段落结构清晰({len(paragraphs)}段)")
        elif len(paragraphs) < 2 and not is_short: score -= 10; evidence.append("段落数不足")
        # v1.1 校准：AI 模板顺序结构扣分——仅"首先…其次…最后"式模板或
        # "综上所述"式空洞总结才扣；"第一/第二/第三"是常见真实论证结构（知乎），不扣
        tmpl = len(re.findall(r"首先.*其次.*最后|一方面.*另一方面", content))
        summary_words = ["综上所述", "总而言之", "总的来说"]
        sw = sum(1 for w in summary_words if w in content)
        if tmpl >= 1: score -= 10; evidence.append("模板化顺序结构，缺乏真推理")
        if sw >= 1: score -= 5; evidence.append("空洞总结句式")
        cause_words = ["因为","所以","因此","由于","导致","从而","于是","结果","原因","基于"]
        ch = sum(1 for w in cause_words if w in content)
        if ch >= 4: score += 8; evidence.append(f"因果推理丰富({ch}处)")
        elif ch >= 2: score += 5
        elif ch >= 1: score += 3; evidence.append("有因果关联")
        trans_words = ["但是","然而","不过","虽然","尽管","相反","另一方面","与此同时"]
        th = sum(1 for w in trans_words if w in content)
        if th >= 2: score += 5; evidence.append(f"论证层次丰富({th}处转折)")
        elif th >= 1: score += 3; evidence.append("有论证转折")
        # v1.1 校准：强论证结构（原因有三/第一第二第三/却/反而）是高逻辑分信号
        strong = len(re.findall(r"(原因有三|原因在于|根本原因|第一[，,].*第二[，,].*第三|不仅.*而且|虽然.*但是)", content))
        if strong >= 1: score += 6; evidence.append("强论证结构（因果+转折+分层）")
        if len(sentences) > 0 and not is_short:
            avg = words / len(sentences)
            if avg > 80: score -= 10; evidence.append(f"平均句长过长({avg:.0f}字)")
            elif avg < 20: score -= 5
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_engagement(self, content, sentences, words):
        dim = _lookup_dim("engagement")
        score, evidence = 50.0, []
        # v1.1 校准：短文案例标记阈值降低（1-2 处即可加分）；
        # 补充口语故事标记（我买/我用了/有一次）
        story_markers = ["比如","例如","举个","一次","曾经","那天","记得","我认识","我买了","我用了","有一次","有个朋友","我朋友","我和一位","我观察了","我身边","上周","我一开始","我当时","我一个"]
        sh = sum(1 for w in story_markers if w in content)
        if sh >= 4: score += 15; evidence.append(f"含{sh}处案例标记")
        elif sh >= 2: score += 10
        elif sh >= 1: score += 5; evidence.append(f"含{sh}处案例标记")
        dialog_markers = ["你","我","咱们","大家","各位","朋友","家人们","姐妹们"]
        # v1.1 校准：按出现频次计（"你/我"反复出现=强烈对话感），AI 模板文几乎无人称
        dh = sum(content.count(w) for w in dialog_markers)
        if dh >= 12: score += 12; evidence.append(f"对话感极强({dh}处人称)")
        elif dh >= 8: score += 9; evidence.append(f"对话感强({dh}处人称)")
        elif dh >= 4: score += 5; evidence.append("有对话感")
        if len(sentences) >= 5:
            lengths = [len(s) for s in sentences]
            sc = sum(1 for l in lengths if l < 20)
            lc = sum(1 for l in lengths if l > 50)
            if sc >= 2 and lc >= 2: score += 10; evidence.append("短句-长句交替，节奏感好")
        qc = content.count("？") + content.count("?")
        if qc >= 2: score += 8; evidence.append(f"含{qc}处互动问句")
        elif qc >= 1: score += 4; evidence.append("含互动问句")
        # v1.1 校准：口语感叹词/情绪词/感叹句强化趣味性
        fun_words = ["超级","真的","绝了","太","好用到","上头","离谱","神仙","爽","炸","震撼","惊艳","离谱","绝"]
        fh = sum(1 for w in fun_words if w in content)
        if fh >= 4: score += 8; evidence.append(f"口语感叹词丰富({fh}处)")
        elif fh >= 2: score += 5
        emoji = len(re.findall(r"[🌀-🧿]", content))
        if emoji >= 2: score += 5; evidence.append(f"emoji增强趣味({emoji}个)")
        if 500 <= words <= 3000: score += 5
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_human_likeness(self, content, words):
        dim = _lookup_dim("human_likeness")
        score, evidence = 60.0, []
        ai_penalty = sum(penalty * len(pat.findall(content)) for pat, penalty in _AI_PATTERNS)
        human_bonus = sum(bonus * len(pat.findall(content)) for pat, bonus in _HUMAN_PATTERNS)
        score += ai_penalty + human_bonus
        pm = len(re.findall(r"[\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f\uff08\uff09\u2014\u2014\u2026\u2026]", content))
        if pm >= 5: score += 5; evidence.append("个性化标点丰富")
        # v1.1 校准：排除"我们"（AI 模板高频词，非个人视角）
        personal_text = content.replace("我们", "")
        fp = personal_text.count("我") + personal_text.count("咱")
        sp = len(re.findall(r"[你您]", content))
        if fp >= 3 and sp >= 3: score += 5; evidence.append("人称交互自然")
        else:
            opinion_markers = ["我认为", "我觉得", "在我看来", "个人认为", "对我来说"]
            narrative_markers = ["我观察", "我发现", "我经历", "我一开始", "我当时", "我亲自", "我试过", "我用了", "我和", "我身边", "我记录", "看得我"]
            opinion_hits = sum(1 for marker in opinion_markers if marker in content)
            narrative_hits = sum(1 for marker in narrative_markers if marker in content)
            if fp >= 3 and (opinion_hits or narrative_hits):
                score += 5; evidence.append("第一人称叙事自然")
            elif fp >= 2 and narrative_hits:
                score += 4; evidence.append("第一人称叙事自然")
            elif fp >= 1 and opinion_hits:
                score += 3; evidence.append("个人观点表达自然")
        # v1.1 校准：感叹句/口语化程度计入去AI味（AI 模板文本几乎不用感叹号）
        ex = content.count("！") + content.count("!")
        if ex >= 3: score += 5; evidence.append(f"感叹句丰富({ex}处)，口语化强")
        elif ex >= 1: score += 2
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_compliance(self, content):
        dim = _lookup_dim("compliance")
        score, evidence = 100.0, []
        total_penalty = 0
        for pattern, penalty in _SENSITIVE_PATTERNS:
            matches = pattern.findall(content)
            if matches:
                total_penalty += penalty * len(matches)
                evidence.append(f"敏感词: {matches[0][:20]} x{len(matches)}")
        score -= total_penalty
        if total_penalty == 0: evidence.append("未检测到敏感内容")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_readability(self, content, words, sentences):
        dim = _lookup_dim("readability")
        score, evidence = 65.0, []
        if len(sentences) == 0:
            return DimensionScore(
                id=dim["id"], label=dim["label"], score=0,
                weight=dim["weight"], weighted=0,
                evidence=["没有可识别句子，无法评估易读性"], applicable=False,
            )
        avg = words / len(sentences)
        if avg <= 25: score += 15; evidence.append(f"平均句长短({avg:.0f}字)，适合儿童")
        elif avg <= 40: score += 8
        elif avg > 70: score -= 15; evidence.append(f"平均句长过长({avg:.0f}字)")
        common = set("的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严")
        tc = set(content)
        cc = len(tc & common)
        tu = len(tc)
        if tu > 0:
            cr = cc / tu
            if cr < 0.5: score -= 10; evidence.append(f"生僻字较多({cr:.0%})")
            elif cr >= 0.8: score += 5; evidence.append(f"用字简单({cr:.0%})")
        paragraphs = [p for p in content.split("\n") if p.strip()]
        if paragraphs:
            lp = sum(1 for p in paragraphs if len(p) > 200)
            if lp == 0: score += 5; evidence.append("段落短小，阅读友好")
            elif lp > len(paragraphs) / 2: score -= 10; evidence.append("段落过长")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_clone_divergence(self, content, original):
        dim = _lookup_dim("clone_divergence")
        if not original or not original.strip():
            return DimensionScore(
                id=dim["id"], label=dim["label"], score=0, weight=dim["weight"], weighted=0,
                evidence=["无原文，非克隆模式，克隆差异度不适用"], applicable=False,
            )
        score, evidence = 50.0, []
        cset = set(content)
        oset = set(original)
        if oset:
            jaccard = len(cset & oset) / len(cset | oset) if cset | oset else 0
            if jaccard < 0.3: score += 20; evidence.append(f"字符集差异大(Jaccard={jaccard:.2f})")
            elif jaccard < 0.5: score += 10
            elif jaccard >= 0.7: score -= 15; evidence.append(f"字符集过于相似(Jaccard={jaccard:.2f})")
        ol = len(original)
        cl = len(content)
        if ol > 0:
            ratio = cl / ol
            if 0.5 <= ratio <= 2.0: score += 5
            elif ratio < 0.3 or ratio > 3.0: score -= 5; evidence.append(f"长度差异过大({ratio:.1f}x)")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_information_density(self, content, words, sentences):
        dim = _lookup_dim("information_density")
        score, evidence = 55.0, []
        if len(sentences) == 0:
            return DimensionScore(
                id=dim["id"], label=dim["label"], score=0,
                weight=dim["weight"], weighted=0,
                evidence=["没有可识别句子，无法评估信息密度"], applicable=False,
            )
        dc = len(re.findall(r"\d+", content))
        if dc >= 10: score += 10; evidence.append(f"数据丰富({dc}处)")
        elif dc >= 3: score += 6
        elif dc >= 1: score += 3; evidence.append("含具体数据")
        pn = len(re.findall(r"[A-Z][a-z]+|[《》「」]", content))
        if pn >= 5: score += 8; evidence.append(f"术语/专名丰富({pn}处)")
        # v1.1 校准：具体实物/品牌/专有名词也算信息量
        concrete = len(re.findall(r"[一-龥]{2,8}(盒|箱|锅|酱|汁|菜|粉|游戏|电影|APP|应用)", content))
        if concrete >= 2: score += 5; evidence.append(f"具体事物描述丰富({concrete}处)")
        # v1.1 校准：具体数量词（X层/X分钟/X块钱/9.9等）是信息量信号
        quant = len(re.findall(r"\d+\s*(层|分钟|块钱|元|个|次|天|小时|斤|勺|%|分)|(层|分钟|块钱|元|勺)\d+", content))
        if quant >= 3: score += 5; evidence.append(f"具体量词丰富({quant}处)")
        elif quant >= 1: score += 3
        # v1.1 校准：具体情境词（时间/人物/场景细节）是短文信息量信号
        scene = len(re.findall(r"(上周|昨天|前天|最近|今年|去年|上个月|朋友|同事|老板|孩子|妈妈|同学|一次|一个|那场|这款|那家)", content))
        if scene >= 4: score += 6; evidence.append(f"具体情境细节丰富({scene}处)")
        elif scene >= 2: score += 4; evidence.append("有具体情境细节")
        avg = words / len(sentences)
        if 30 <= avg <= 60: score += 8
        # v1.1 校准：短文平台（小红书/抖音）句子天然短，不再扣分
        elif avg < 20 and words >= 300: score -= 8; evidence.append("句子过短，信息密度低")
        filler_words = ["的","了","是","在","和","就","不","也","很","都","要","会","说","看","好","有"]
        fc = sum(content.count(w) for w in filler_words)
        fr = fc / words if words > 0 else 0
        if fr > 0.3: score -= 5; evidence.append(f"虚词占比高({fr:.0%})")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_emotional_resonance(self, content):
        dim = _lookup_dim("emotional_resonance")
        score, evidence = 50.0, []
        pc = len(_POSITIVE_EMOTION.findall(content))
        nc = len(_NEGATIVE_EMOTION.findall(content))
        total = pc + nc
        # v1.1 校准：短文（平台常态）情感词 2-3 个即应加分，阈值整体下调
        if total >= 6: score += 20; evidence.append(f"情感词丰富(正面{pc},负面{nc})")
        elif total >= 3: score += 12; evidence.append(f"情感色彩鲜明({total}个情感词)")
        elif total >= 2: score += 8; evidence.append("有一定情感色彩")
        elif total >= 1: score += 4
        elif total == 0:
            rational = len(re.findall(r"(原因|因为|所以|因此|然而|但是|根据|数据|分析|论证|判断)", content))
            if rational >= 3: score += 0; evidence.append("理性论证风格，不以情感词评判")
            else: score -= 5; evidence.append("情感色彩平淡")
        if pc > nc and pc >= 2: score += 5; evidence.append("情感基调积极向上")
        # v1.1 校准：感叹句密度是短文情绪张力的强信号（AI 模板文本几乎不用感叹号）
        ex = content.count("！") + content.count("!")
        if total == 0 and ex >= 3: score += 6; evidence.append(f"虽无情感词但感叹句密集({ex}处)，情绪明显")
        elif ex >= 5: score += 4; evidence.append("感叹句增强情感表达")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_structure(self, content, paragraphs, sentences):
        dim = _lookup_dim("structure")
        score, evidence = 50.0, []
        # v1.1 校准：短文也应有开头/结尾识别（首段开头钩子 + 末段 CTA/总结），
        # 不再强制要求 >=3 段才计结构分
        fp = paragraphs[0] if paragraphs else content[:100]
        om = ["今天","最近","大家好","各位","今天来","今天聊","今天分享","姐妹们","家人们","刚刚","我买","我用了","说实话"]
        if any(m in fp[:80] for m in om): score += 8; evidence.append("有明确开头")
        lp = paragraphs[-1] if paragraphs else content[-150:]
        cm = ["总结","最后","总之","以上就是","希望","期待","欢迎","关注","我们下期","下次","记得","建议","推荐","赶紧","冲","试试","必看","收藏"]
        if any(m in lp[-150:] for m in cm): score += 8; evidence.append("有明确结尾")
        if len(paragraphs) >= 5: score += 5; evidence.append("结构完整(开头-中间-结尾)")
        # v1.1 校准：问答结构（标题/首句是问题）是知乎/公众号深度文的结构信号
        head_q = (content[:60].count("？") + content[:60].count("?")) >= 1
        if head_q and len(content) >= 200: score += 6; evidence.append("问答式开头，结构清晰")
        tc = len(re.findall(r"(另外|此外|还有|接下来|下面|然后|接着|之后|最后|总之)", content))
        if tc >= 2: score += 5; evidence.append(f"段落过渡自然({tc}处)")
        lm = len(re.findall(r"^\d+[\.、\)]", content, re.MULTILINE))
        # Sequential "首先/其次/最后" is a common template pattern and is
        # intentionally not treated as proof of a genuine numbered argument.
        cn = len(re.findall(r"(第一|第二|第三|第四|其一|其二|其三|一是|二是|三是)", content))
        total_lm = lm + cn
        if total_lm >= 3: score += 8; evidence.append(f"使用分点结构({total_lm}处)")
        elif total_lm >= 1: score += 4; evidence.append("含分点结构")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_originality(self, content):
        dim = _lookup_dim("originality")
        score, evidence = 55.0, []
        om = ["我认为","我觉得","在我看来","个人认为","不同于","不同于常见","说实话","讲真","说真的","我来说","我的观点","我的经验","我亲测","我用过","绝对是","年度必看","必看","最强","最好","天花板","没有之一","强烈建议","强烈推荐","真心推荐"]
        oh = sum(1 for m in om if m in content)
        if oh >= 3: score += 15; evidence.append("有明确个人观点")
        elif oh >= 1: score += 8
        # v1.1 校准：第一人称叙事（我/咱们/咱）体现个人视角，是短文原创性信号
        # “我们/咱们”是集体视角，不能单独冒充个人原创证据。
        personal_text = content.replace("我们", "").replace("咱们", "")
        fp = len(re.findall(r"[我咱]", personal_text))
        if fp >= 5: score += 8; evidence.append(f"第一人称视角鲜明({fp}处)")
        elif fp >= 3: score += 5
        elif fp >= 2: score += 3
        nw = ["独特","创新","新颖","突破","领先","首创","独家","原创","首次","全新"]
        nh = sum(1 for w in nw if w in content)
        if nh >= 3: score += 10; evidence.append("新概念/表达丰富")
        cliches = ["众所周知","不言而喻","大势所趋","时代潮流","必由之路","不二法门"]
        ch = sum(1 for c in cliches if c in content)
        if ch >= 3: score -= 15; evidence.append(f"含{ch}处陈词滥调")
        elif ch >= 1: score -= 5
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_platform_fitness(self, content, platform):
        dim = _lookup_dim("platform_fitness")
        score, evidence = 50.0, []
        keywords = _PLATFORM_KEYWORDS.get(platform, _PLATFORM_KEYWORDS["通用"])
        if keywords:
            hc = sum(1 for kw in keywords if kw in content)
            if hc >= 3: score += 20; evidence.append(f"高度适配{platform}({hc}个关键词)")
            elif hc >= 2: score += 14; evidence.append(f"适配{platform}({hc}个关键词)")
            elif hc >= 1: score += 10; evidence.append(f"含{platform}风格元素")
            else:
                score = 55; evidence.append("平台风格元素较少")
        else:
            score = 60; evidence.append("通用平台")
        if platform == "抖音":
            ss = sum(1 for s in _split_sentences(content) if len(s) <= 30)
            if ss >= 5: score += 10; evidence.append("短句适合抖音")
            elif ss >= 3: score += 5
        elif platform == "知乎":
            if len(content) >= 1500: score += 10; evidence.append("长文适合知乎")
            elif len(content) >= 600: score += 5
        elif platform == "小红书":
            ec = len(re.findall(r"[🌀-🧿]", content))
            if ec >= 3: score += 10; evidence.append(f"emoji丰富({ec}个)，适合小红书")
            elif ec >= 1: score += 5
        # v1.1 校准：口语化风格（感叹句/口语词）是新媒体平台（小红书/抖音/微博/B站/微信）的适配信号
        if platform not in ("通用", "知乎"):
            ex = content.count("！") + content.count("!")
            if ex >= 4: score += 6; evidence.append("口语感叹风格适配新媒体平台")
            elif ex >= 2: score += 3
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_keyword_density(self, content, words):
        dim = _lookup_dim("keyword_density")
        score, evidence = 50.0, []
        if words < 50:
            return DimensionScore(
                id=dim["id"], label=dim["label"], score=0,
                weight=dim["weight"], weighted=0,
                evidence=["内容过短，无法评估关键词密度"], applicable=False,
            )
        bigrams = _extract_ngrams(content, 2, 4)
        if bigrams:
            top_freq = bigrams[0][1]
            top_ratio = top_freq / words if words > 0 else 0
            if 0.01 <= top_ratio <= 0.05: score += 15; evidence.append(f"核心关键词密度合理({top_ratio:.1%})")
            elif top_ratio > 0.08: score -= 10; evidence.append(f"关键词堆砌嫌疑({top_ratio:.1%})")
            elif top_ratio < 0.005: score -= 5; evidence.append("缺少核心关键词")
            top_word = bigrams[0][0]
            if top_word in content[:100]: score += 10; evidence.append(f"核心关键词出现在开头'{top_word}'")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_cta(self, content):
        dim = _lookup_dim("call_to_action")
        score, evidence = 50.0, []
        total_cta = 0
        for pattern, bonus in _CTA_PATTERNS:
            matches = pattern.findall(content)
            if matches: total_cta += bonus * len(matches)
        if total_cta >= 20: score += 25; evidence.append("CTA丰富有效")
        elif total_cta >= 10: score += 15
        elif total_cta >= 5: score += 10
        elif total_cta >= 2: score += 6; evidence.append("有CTA引导")
        elif total_cta == 0: score -= 10; evidence.append("缺少CTA")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)

    def _score_brand_consistency(self, content):
        dim = _lookup_dim("brand_consistency")
        score, evidence = 60.0, []
        fm = ["尊敬的","谨","特此","鉴于","予以","经由","兹","本"]
        cm = ["哈哈","卧槽","牛逼","绝了","真的假的","不是吧","我靠","哎呀","姐妹们","家人们","超级","真的","离谱","上头","赶紧","冲","推荐","建议"]
        fc = sum(1 for m in fm if m in content)
        cc = sum(1 for m in cm if m in content)
        if fc >= 3 and cc == 0: score += 10; evidence.append("语气正式一致")
        elif cc >= 3 and fc == 0: score += 10; evidence.append("语气口语化一致")
        elif fc >= 3 and cc >= 3: score -= 20; evidence.append("语气混杂，风格不一致")
        return DimensionScore(id=dim["id"], label=dim["label"], score=max(0,min(100,score)), weight=dim["weight"], weighted=score*dim["weight"], evidence=evidence)
