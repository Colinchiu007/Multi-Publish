// @ts-check
/**
 * 热门选题分类器 — 渠道原生分类映射 + 关键词规则兜底
 *
 * 分类体系（10 类）：
 *   general(综合) society(社会) finance(财经) tech(科技) entertainment(娱乐)
 *   sports(体育) emotion(情感) education(教育) health(健康) international(国际)
 *
 * 映射策略：
 *   1. 渠道原生分类字段（头条 Category / 腾讯领域）→ 查映射表 → 命中用之
 *   2. 未命中 / 无原生分类 → 关键词词表匹配（按优先级）
 *   3. 兜底 → general（综合）
 */

/** 10 分类枚举 */
const CATEGORY_KEYS = [
  'general', 'society', 'finance', 'tech', 'entertainment',
  'sports', 'emotion', 'education', 'health', 'international',
]

/**
 * 渠道原生分类 → 10 类映射表。
 * key 归一化：trim + toLowerCase；未命中走关键词规则。
 */
const RAW_CATEGORY_MAP = {
  // 今日头条 hot-board 的 Category 字段（实测枚举）
  toutiao: {
    '热点': 'general', '社会': 'society', '国际': 'international',
    '财经': 'finance', '科技': 'tech', '娱乐': 'entertainment',
    '体育': 'sports', '汽车': 'tech', '教育': 'education', '健康': 'health',
    '军事': 'international', '游戏': 'entertainment', '旅游': 'general',
  },
  // 腾讯新闻 hot_ranking_list 领域字段
  tencent: {
    '社会': 'society', '国际': 'international', '财经': 'finance',
    '科技': 'tech', '娱乐': 'entertainment', '体育': 'sports',
    '教育': 'education', '健康': 'health', '军事': 'international',
  },
  // 微博热搜 hot_band 的 category 字段（实测 2026-09 枚举，15 类）
  weibo: {
    '数码': 'tech', '电竞': 'entertainment', '国内时政': 'society',
    '演出': 'entertainment', '互联网': 'tech', '剧集': 'entertainment',
    '综艺': 'entertainment', '民生新闻': 'society', '体育': 'sports',
    '幽默': 'entertainment', '科学科普': 'tech', '美食': 'general',
    '健康医疗': 'health', '舆论监督': 'society', '游戏': 'entertainment',
  },
  // B站热门 tname 分区名（实测 2026-09，常见分区 → 10 类映射；未命中分区走关键词规则）
  bilibili: {
    '科技': 'tech', '数码': 'tech', '软件应用': 'tech', '科学科普': 'tech',
    '知识': 'tech', '人文历史': 'general', '校园学习': 'education',
    '手机游戏': 'entertainment', '单机游戏': 'entertainment', '电子竞技': 'entertainment',
    '游戏': 'entertainment', '国产动画': 'entertainment', '影视杂谈': 'entertainment',
    '电影': 'entertainment', '电视剧': 'entertainment', '综艺': 'entertainment',
    '音乐综合': 'entertainment', '演奏': 'entertainment', '鬼畜剧场': 'entertainment',
    '同人·手书': 'entertainment', '小剧场': 'entertainment', '预告·资讯': 'general',
    '体育': 'sports', '社会': 'society', '日常': 'general', '生活': 'general',
    '美食制作': 'general', '美食记录': 'general', '美食侦探': 'general',
    '亲子': 'general', '动物二创': 'general', '搞笑': 'entertainment',
    '出行': 'general', '手工': 'general',
  },
}

/**
 * 关键词词表（按匹配优先级排序：国际 > 社会 > 财经 > 科技 > 娱乐 > 体育 > 情感 > 教育 > 健康）。
 * 匹配方式：选题文本包含任一关键词即命中（子串匹配，与 story-context-engine 同风格）。
 */
const KEYWORD_RULES = [
  { category: 'international', keywords: ['美国', '日本', '韩国', '国际', '俄罗斯', '乌克兰', '欧盟', '联合国', '海外', '全球'] },
  { category: 'society', keywords: ['社会', '警方', '法院', '判', '事故', '遇难', '身亡', '救援', '通报', '调查', '违法', '犯罪', '拘留', '逮捕', '维权', '民生', '就业', '工资', '退休'] },
  { category: 'finance', keywords: ['股', '基金', 'A股', '港股', '美股', '楼市', '房价', '经济', '通胀', '利率', '央行', '人民币', '汇率', 'GDP', '上市', '融资', '营收', '利润', '关税', '贸易'] },
  { category: 'tech', keywords: ['AI', '人工智能', '大模型', '芯片', '半导体', '手机', '电脑', '互联网', '算法', '机器人', '新能源', '自动驾驶', '航天', '卫星', '火箭', '5G', '6G', '量子', '开源', '程序员', '数码'] },
  { category: 'entertainment', keywords: ['明星', '综艺', '电影', '电视剧', '演唱会', '票房', '偶像', '选秀', '音乐', '歌手', '演员', '导演', '娱乐圈', '粉丝', '选秀', '游戏', '动漫'] },
  { category: 'sports', keywords: ['足球', '篮球', '奥运', '世界杯', '冠军', '联赛', '球员', '教练', '夺冠', '金牌', 'NBA', 'CBA', '国足', '运动员', '比赛', '赛季'] },
  { category: 'emotion', keywords: ['恋爱', '婚姻', '离婚', '结婚', '相亲', '情感', '爱情', '分手', '出轨', '婆媳', '家庭', '亲子', '父母', '孩子'] },
  { category: 'education', keywords: ['高考', '考研', '开学', '毕业', '大学', '中学', '小学', '幼儿园', '招生', '录取', '分数线', '学费', '教师', '校园', '学生'] },
  { category: 'health', keywords: ['医院', '疫苗', '养生', '健康', '疾病', '疫情', '病毒', '感冒', '癌症', '体检', '医生', '药品', '减肥', '健身'] },
]

/**
 * 分类单个选题
 * @param {string|null} rawCategory 渠道原生分类（可空）
 * @param {string} channel 渠道 id
 * @param {string} topicText 选题文本
 * @returns {string} 10 分类枚举之一
 */
function classifyTopic(rawCategory, channel, topicText) {
  // 1. 渠道原生分类映射
  if (rawCategory && typeof rawCategory === 'string') {
    const table = RAW_CATEGORY_MAP[channel]
    if (table) {
      const mapped = table[String(rawCategory).trim().toLowerCase()]
      if (mapped) return mapped
    }
  }
  // 2. 关键词规则（按优先级）
  const text = String(topicText || '')
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) return rule.category
    }
  }
  // 3. 兜底
  return 'general'
}

module.exports = {
  CATEGORY_KEYS,
  RAW_CATEGORY_MAP,
  KEYWORD_RULES,
  classifyTopic,
}
