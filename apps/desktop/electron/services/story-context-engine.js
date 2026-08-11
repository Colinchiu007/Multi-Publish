// @ts-check
/**
 * story-context-engine — Story2Video 场景上下文增强中间层（规则驱动，无 IO，可测）。
 *
 * 定位：位于「分句引擎输出场景（split / domain_enrich）」与「图片提示词优化引擎（prompt-engine）」
 * 之间，读取完整文案提取全局故事上下文（时代/朝代/文化地域/题材/设定/角色/道具/视觉风格/语气），
 * 再把全局锚点融合进每个场景，形成逐场景上下文块与负面锚点，保证提示词生成图片/视频时
 * 故事背景的准确性、一致性与连贯性（如唐代全文 + 「一个老妇人在做饭」→ 不生成西方老太太现代厨房）。
 *
 * 契约：发送 prompt-engine 的 context 只输出 CONTEXT_KEY_WHITELIST 白名单键
 * （对齐 prompt_engine/prompt_builder.py build_context_section 已知键），
 * 敏感凭据键拦截由 prompt-engine-contract.assertNoSensitiveContext 在发送层执行。
 */
'use strict'

// ---------------------------------------------------------------------------
// 规则表（数据驱动，可扩展；命中均携带 evidence 与置信度）
// ---------------------------------------------------------------------------

/** 朝代规则：keywords → 朝代名/年代/视觉风格/时代归类 */
const DYNASTY_RULES = Object.freeze([
  { keywords: ['商朝', '商代', '殷商', '纣王'], name: '商朝', period: '商朝（约前1600-前1046）', visualStyle: '商代青铜器、甲骨文、粗犷古朴的殷商色调', era: 'ancient' },
  { keywords: ['周朝', '周代', '西周', '东周', '诸侯'], name: '周朝', period: '周朝（前1046-前256）', visualStyle: '周代礼制、青铜礼器、编钟、克制的土黄色调', era: 'ancient' },
  { keywords: ['春秋战国', '春秋', '战国', '诸子百家', '孔子', '屈原'], name: '春秋战国', period: '春秋战国（前770-前221）', visualStyle: '列国争霸、战车旌旗、竹简与青铜剑、苍茫色调', era: 'ancient' },
  { keywords: ['秦朝', '秦代', '秦始皇', '兵马俑', '万里长城', '咸阳'], name: '秦朝', period: '秦朝（前221-前207）', visualStyle: '秦代城墙、兵马俑、铠甲、青铜与尘土色调', era: 'ancient' },
  { keywords: ['汉朝', '汉代', '西汉', '东汉', '刘邦', '汉武帝', '霍去病', '张骞'], name: '汉朝', period: '汉朝（前202-220）', visualStyle: '汉代宫阙、古城、曲裾深衣、黛青与赭石色调', era: 'ancient' },
  { keywords: ['三国', '曹操', '刘备', '孙权', '诸葛亮', '赤壁之战'], name: '三国', period: '三国（220-280）', visualStyle: '汉末城寨、战场、战袍旌旗、冷暖对比光线', era: 'ancient' },
  { keywords: ['晋朝', '晋代', '两晋', '东晋', '西晋', '魏晋'], name: '晋朝', period: '晋朝（265-420）', visualStyle: '魏晋风骨、竹林清谈、宽袍大袖、水墨淡彩', era: 'ancient' },
  { keywords: ['南北朝', '南朝', '北朝'], name: '南北朝', period: '南北朝（420-589）', visualStyle: '南北对峙、石窟造像、胡服与汉装并存', era: 'ancient' },
  { keywords: ['隋朝', '隋代', '隋炀帝', '大运河'], name: '隋朝', period: '隋朝（581-618）', visualStyle: '隋代宫城、大运河、庄重浑厚的赭石色调', era: 'ancient' },
  { keywords: ['唐朝', '唐代', '大唐', '李世民', '武则天', '唐玄宗', '长安', '安史之乱'], name: '唐朝', period: '唐朝（618-907）', visualStyle: '唐代宫殿、长安城、圆领袍、襦裙、金红色盛唐光线', era: 'ancient' },
  { keywords: ['五代十国', '五代'], name: '五代十国', period: '五代十国（907-960）', visualStyle: '五代动荡、藩镇城寨、简朴的灰褐色调', era: 'ancient' },
  { keywords: ['宋朝', '宋代', '北宋', '南宋', '苏轼', '岳飞', '清明上河图', '宋徽宗'], name: '宋朝', period: '宋朝（960-1279）', visualStyle: '宋代城楼、市井、宋装、烟雨与克制的青灰色调', era: 'ancient' },
  { keywords: ['元朝', '元代', '成吉思汗', '忽必烈', '大都'], name: '元朝', period: '元朝（1271-1368）', visualStyle: '元代草原与大都、蒙元服饰、苍阔的冷色调', era: 'ancient' },
  { keywords: ['明朝', '明代', '大明', '朱元璋', '朱棣', '永乐', '锦衣卫'], name: '明朝', period: '明朝（1368-1644）', visualStyle: '明代建筑、宫城、汉服、乌纱帽、深红与青绿色调', era: 'ancient' },
  { keywords: ['清朝', '清代', '大清', '清军', '康熙', '乾隆', '慈禧', '甲午', '鸦片战争'], name: '清朝', period: '清朝（1644-1912）', visualStyle: '清代宫殿、园林、清装、马褂、暖灰与金色电影光线', era: 'ancient' },
  { keywords: ['民国', '辛亥革命', '上海滩', '中山装', '旗袍'], name: '民国', period: '民国（1912-1949）', visualStyle: '民国洋楼、街巷、旗袍与胶片棕黄色调', era: 'modern' },
])

/** 文化地域规则：关键词 → 文化 + 地域候选 */
const CULTURE_RULES = Object.freeze([
  { keywords: ['中国', '长安', '洛阳', '北京', '故宫', '汉服', '科举', '长城', '瓷器', '唐朝', '唐代', '宋朝', '明代', '清代', '皇帝', '太监', '御花园', '茶道', '丝绸'], culture: '中国', regions: ['长安', '洛阳', '北京'] },
  { keywords: ['日本', '京都', '东京', '武士', '和服', '樱花', '神社', '寿司', '榻榻米', '艺伎', '富士山', '幕府'], culture: '日本', regions: ['京都', '东京'] },
  { keywords: ['欧洲', '伦敦', '巴黎', '罗马', '城堡', '骑士', '教堂', '女皇', '壁炉', '绅士', '贵妇', '凡尔赛'], culture: '欧洲', regions: ['伦敦', '巴黎', '罗马'] },
  { keywords: ['美国', '纽约', '白宫', '好莱坞', '汉堡', '汽车旅馆', '摩天大楼'], culture: '美国', regions: ['纽约'] },
  { keywords: ['阿拉伯', '清真寺', '沙漠', '骆驼', '酋长', '一千零一夜'], culture: '阿拉伯', regions: ['沙漠'] },
  { keywords: ['埃及', '金字塔', '法老', '尼罗河', '狮身人面像'], culture: '埃及', regions: ['尼罗河畔'] },
  { keywords: ['印度', '泰姬陵', '纱丽', '恒河', '宝莱坞', '大象'], culture: '印度', regions: ['恒河畔'] },
  { keywords: ['韩国', '首尔', '韩服', '泡菜', '汉江'], culture: '韩国', regions: ['首尔'] },
])

/** 题材规则 */
const GENRE_RULES = Object.freeze([
  { keywords: ['唐朝', '唐代', '宋朝', '明代', '清代', '王朝', '朝代', '皇帝', '史官', '古代', '长安', '洛阳', '宫廷', '史记'], genre: '历史' },
  { keywords: ['江湖', '武侠', '剑客', '掌门', '大侠', '武林', '门派', '内力', '轻功'], genre: '武侠' },
  { keywords: ['修仙', '仙侠', '御剑', '灵气', '仙界', '金丹', '飞升', '道法'], genre: '仙侠' },
  { keywords: ['科幻', '飞船', '星际', '机器人', '未来', '赛博', 'AI', '克隆', '时空'], genre: '科幻' },
  { keywords: ['魔法', '奇幻', '龙', '精灵', '法师', '炼金', '异世界', '魔戒'], genre: '奇幻' },
  { keywords: ['现代都市', '都市', '写字楼', '公司', '地铁', '外卖', '职场'], genre: '现代都市' },
  { keywords: ['童话', '公主', '王子', '城堡', '森林小屋', '小精灵', '魔法森林'], genre: '童话' },
  { keywords: ['悬疑', '侦探', '凶案', '谜团', '案件', '推理', '凶手'], genre: '悬疑' },
  { keywords: ['战场', '士兵', '硝烟', '战役', '打仗', '冲锋', '军旗'], genre: '战争' },
  { keywords: ['宫廷', '宫斗', '娘娘', '嫔妃', '御花园', '太监', '皇后'], genre: '宫廷' },
  { keywords: ['日常生活', '家庭', '学校', '邻里', '市井生活', '田园'], genre: '日常' },
])

/** 场景设定规则 */
const SETTING_RULES = Object.freeze([
  { keywords: ['做饭', '烹饪', '炒菜', '煮饭', '烧饭', '厨房', '灶台', '做饭', '炊烟'], setting: '民居厨房' },
  { keywords: ['宫殿', '大殿', '金銮殿', '御花园', '宫墙'], setting: '宫殿' },
  { keywords: ['市集', '街市', '摊位', '集市', '庙会'], setting: '市井街市' },
  { keywords: ['书房', '书案', '笔墨', '古籍', '书架'], setting: '书房' },
  { keywords: ['庭院', '院落', '花园', '后花园'], setting: '庭院' },
  { keywords: ['战场', '军营', '城墙', '烽火台'], setting: '战场' },
  { keywords: ['学堂', '书院', '私塾', '课堂'], setting: '学堂' },
  { keywords: ['码头', '渡口', '船坞', '港口'], setting: '码头' },
  { keywords: ['森林', '山林', '竹林', '荒野'], setting: '山林' },
  { keywords: ['雪山', '雪原', '冰原'], setting: '雪山' },
])

/** 时代道具规则（ancient/modern 双向，按 era 互斥输出） */
const PROP_RULES = Object.freeze({
  ancient: [
    { keywords: ['土灶', '柴火', '灶台', '柴'], name: '土灶柴火' },
    { keywords: ['陶罐', '瓷碗', '瓦罐', '铜锅', '铁锅', '鼎'], name: '陶罐铜锅' },
    { keywords: ['油灯', '烛台', '灯笼', '火把'], name: '油灯烛台' },
    { keywords: ['马车', '轿子', '驿站'], name: '马车轿子' },
    { keywords: ['襦裙', '长袍', '汉服', '马褂', '深衣', '旗袍'], name: '传统服饰' },
    { keywords: ['竹简', '毛笔', '宣纸', '砚台', '书信'], name: '笔墨纸砚' },
  ],
  modern: [
    { keywords: ['电烤箱', '微波炉', '冰箱', '燃气灶', '电磁炉', '电饭煲'], name: '现代厨电' },
    { keywords: ['手机', '电脑', '平板', '耳机'], name: '电子设备' },
    { keywords: ['汽车', '地铁', '高铁', '飞机', '电梯'], name: '现代交通' },
    { keywords: ['外卖', '快递', '电商', '网购'], name: '现代生活' },
    { keywords: ['写字楼', '玻璃幕墙', '摩天大楼'], name: '现代建筑' },
  ],
})

/** 角色词表（人物名词 + 修饰语前窗提取） */
const CHARACTER_RULES = Object.freeze([
  '老妇人', '老翁', '老太太', '少女', '姑娘', '少年', '书生', '将军', '士兵', '皇帝', '皇后', '公主', '王子',
  '农夫', '渔夫', '猎人', '商贩', '掌柜', '伙计', '工匠', '铁匠', '织女', '绣娘', '丫鬟', '仆人', '管家',
  '刺客', '侠客', '剑客', '僧人', '道士', '郎中', '大夫', '教书先生', '小姐', '少爷', '孩子', '婴儿', '青年', '中年妇人', '主妇',
])

/** 时间规则 */
const TIME_RULES = Object.freeze({
  timeOfDay: ['清晨', '早晨', '白天', '正午', '中午', '黄昏', '傍晚', '夜晚', '深夜', '午夜'],
  season: ['春', '夏', '秋', '冬', '春天', '夏天', '秋天', '冬天'],
})

/** 视觉风格规则 */
const VISUAL_STYLE_RULES = Object.freeze([
  { keywords: ['水墨', '国画', '工笔'], style: '水墨国画风格' },
  { keywords: ['写实', '真实', '纪录片'], style: '写实风格' },
  { keywords: ['动漫', '卡通', '二次元'], style: '动漫风格' },
  { keywords: ['油画', '古典油画'], style: '古典油画风格' },
  { keywords: ['电影', '史诗', '大片'], style: '电影感' },
  { keywords: ['赛博朋克', '霓虹'], style: '赛博朋克风格' },
  { keywords: ['复古', '胶片', '老照片'], style: '复古胶片风格' },
])

/** 叙事语气规则 */
const TONE_RULES = Object.freeze([
  { keywords: ['悲壮', '凄凉', '悲伤', '哀伤', '痛苦', '死亡'], tone: '悲壮' },
  { keywords: ['欢快', '喜悦', '幸福', '快乐', '热闹', '喜庆'], tone: '欢快' },
  { keywords: ['紧张', '危机', '危险', '惊险', '追杀'], tone: '紧张' },
  { keywords: ['平静', '日常', '宁静', '祥和', '温馨', '温情'], tone: '平和' },
])

/** 时代负面锚点（era 互斥；发送前合并进 negative_prompt） */
const NEGATIVE_ANCHOR_RULES = Object.freeze({
  ancient: ['电烤箱', '微波炉', '冰箱', '燃气灶', '电磁炉', '西式现代厨房', '现代电器', '汽车', '摩天大楼', '现代服饰', '西方现代建筑'],
  modern: ['油灯', '烛台', '土灶', '柴火', '马车', '轿子', '长袍', '宫殿', '古代服饰'],
})

/** 场景上下文涉及做饭/烹饪时的追加负面锚点（时代互斥） */
const COOKING_NEGATIVE_ANCHORS = Object.freeze({
  ancient: ['电烤箱', '微波炉', '西式现代厨房', '西式餐点', '西式餐具'],
  modern: ['土灶', '柴火', '油灯', '陶罐', '古装', '宫殿'],
})

/** 场景上下文涉及做饭/烹饪时的正向器物锚点（时代互斥） */
const COOKING_POSITIVE_PROPS = Object.freeze({
  ancient: ['土灶', '柴火', '陶罐', '铜锅'],
  modern: [],
})

/** 发送 prompt-engine 的 context 白名单键（对齐 prompt_engine/prompt_builder.py） */
const CONTEXT_KEY_WHITELIST = Object.freeze([
  'synopsis', 'full_text', 'setting', 'narrative_intent', 'scene_type', 'character_list', 'character',
])

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  maxSummaryLength: 300,
  maxAnchors: 8,
  includeNegativeAnchors: true,
  contextBlockMaxChars: 400,
})

function normalizeText (value) {
  return String(value || '').replace(/\s+/gu, ' ').trim()
}

function unicodeLength (value) {
  return Array.from(String(value || '')).length
}

function integerInRange (value, min, max, fallback) {
  const number = Math.floor(Number(value))
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function booleanValue (value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

function firstDefined (...values) {
  return values.find(value => value !== undefined && value !== null)
}

function keywordHits (text, keywords) {
  if (!text) return []
  return keywords.filter(keyword => text.includes(keyword))
}

function dedupe (items) {
  return [...new Set(items.filter(item => item !== undefined && item !== null && String(item).trim() !== ''))]
}

function joinNonEmpty (parts, separator) {
  return parts.filter(part => part !== undefined && part !== null && String(part).trim() !== '').join(separator)
}

/** 按断句点截断到 max 字符（优先在句末标点处断开，避免截断语义） */
function truncateBySentence (text, max) {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  const window = chars.slice(0, max).join('')
  const breakMatch = window.match(/[。！？!?；;，,、：:][^。！？!?；;，,、：:]*$/)
  if (breakMatch && breakMatch.index !== undefined && breakMatch.index > 0) {
    return window.slice(0, breakMatch.index + 1)
  }
  return window
}

function sceneTextOf (scene) {
  if (typeof scene === 'string') return normalizeText(scene)
  if (!scene || typeof scene !== 'object') return ''
  return normalizeText(scene.imagePromptSeed || scene.prompt || scene.text || scene.content || scene.sentence)
}

function detectByRules (text, rules, keyName) {
  return rules
    .map(rule => ({ rule, hits: keywordHits(text, rule.keywords) }))
    .filter(item => item.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length)
    .map(item => ({ [keyName]: item.rule[keyName], hits: item.hits, evidence: item.hits, rule: item.rule }))
}

// ---------------------------------------------------------------------------
// 配置归一
// ---------------------------------------------------------------------------

/**
 * 收敛 scene_context 配置到契约边界；非法类型回退默认。
 * @param {object} [options]
 */
function normalizeSceneContextOptions (options = {}) {
  const source = options && typeof options === 'object' && !Array.isArray(options) ? options : {}
  return {
    enabled: booleanValue(source.enabled, DEFAULT_OPTIONS.enabled),
    maxSummaryLength: integerInRange(
      firstDefined(source.maxSummaryLength, source.max_summary_length),
      50, 1000, DEFAULT_OPTIONS.maxSummaryLength,
    ),
    maxAnchors: integerInRange(
      firstDefined(source.maxAnchors, source.max_anchors),
      1, 20, DEFAULT_OPTIONS.maxAnchors,
    ),
    includeNegativeAnchors: booleanValue(
      source.includeNegativeAnchors, DEFAULT_OPTIONS.includeNegativeAnchors,
    ),
    contextBlockMaxChars: integerInRange(
      firstDefined(source.contextBlockMaxChars, source.context_block_max_chars),
      50, 1000, DEFAULT_OPTIONS.contextBlockMaxChars,
    ),
  }
}

// ---------------------------------------------------------------------------
// 全局故事上下文提取
// ---------------------------------------------------------------------------

function detectDynasty (text) {
  const found = detectByRules(text, DYNASTY_RULES, 'name')
  if (found.length === 0) return null
  const top = found[0]
  const rule = top.rule
  return {
    name: rule.name,
    period: rule.period,
    visualStyle: rule.visualStyle,
    era: rule.era,
    confidence: Math.min(0.98, 0.8 + top.hits.length * 0.04),
    method: 'keyword',
    evidence: top.hits.slice(0, 5),
  }
}

function detectCulture (text) {
  const found = detectByRules(text, CULTURE_RULES, 'culture')
  if (found.length === 0) return { culture: '', region: '', hits: [], multiCandidates: [] }
  const top = found[0]
  const region = top.rule.regions.find(candidate => text.includes(candidate)) || top.rule.regions[0] || ''
  return {
    culture: top.culture,
    region: region || '',
    hits: top.hits,
    multiCandidates: found
      .slice(0, 3)
      .map(item => ({ culture: item.culture, hits: item.hits.length, evidence: item.hits.slice(0, 5) })),
  }
}

function detectGenre (text) {
  const found = detectByRules(text, GENRE_RULES, 'genre')
  return found.length > 0 ? { genre: found[0].genre, evidence: found[0].hits } : { genre: 'general', evidence: [] }
}

function detectSetting (text) {
  return detectByRules(text, SETTING_RULES, 'setting').map(item => item.setting)
}

function detectCharacters (text) {
  const characters = []
  for (const name of CHARACTER_RULES) {
    let index = 0
    let appearances = 0
    while (index < text.length) {
      const position = text.indexOf(name, index)
      if (position === -1) break
      appearances += 1
      // 修饰语前窗：取角色词前 ≤6 个非标点字符
      const before = text.slice(Math.max(0, position - 6), position).replace(/[。！？!?；;，,、：:\s]/gu, '')
      const descriptor = before ? before.slice(-4) + name : name
      if (!characters.some(c => c.name === name)) {
        characters.push({ name, descriptor, appearances })
      } else {
        const existing = characters.find(c => c.name === name)
        existing.appearances = appearances
      }
      index = position + name.length
    }
  }
  return characters
}

function detectProps (text, era) {
  const ancient = dedupe(PROP_RULES.ancient.flatMap(rule => keywordHits(text, rule.keywords)))
  const modern = dedupe(PROP_RULES.modern.flatMap(rule => keywordHits(text, rule.keywords)))
  if (era === 'ancient') return { ancient, modern: [] }
  if (era === 'modern') return { ancient: [], modern }
  return { ancient, modern }
}

function detectVisualStyle (text, dynasty) {
  if (dynasty && dynasty.visualStyle) return dynasty.visualStyle
  const found = detectByRules(text, VISUAL_STYLE_RULES, 'style')
  return found.length > 0 ? found.map(item => item.style).join('、') : ''
}

function detectTone (text) {
  const found = detectByRules(text, TONE_RULES, 'tone')
  return found.length > 0 ? found[0].tone : ''
}

function detectTime (text) {
  const timeOfDay = TIME_RULES.timeOfDay.find(keyword => text.includes(keyword)) || ''
  const season = TIME_RULES.season.find(keyword => text.includes(keyword)) || ''
  return { timeOfDay, season }
}

function detectEra (text, dynasty, genre) {
  if (dynasty) return dynasty.era
  const ancientGenres = new Set(['历史', '武侠', '仙侠', '宫廷', '战争', '童话'])
  const modernGenres = new Set(['现代都市', '科幻'])
  const ancientTerms = ['朝廷', '皇帝', '王朝', '宫殿', '将军', '古代', '城墙', '科举', '丝绸之路', '江湖', '武林', '剑客', '寺庙', '油灯', '烛台', '马车', '轿子']
  const modernTerms = ['手机', '电脑', '互联网', '微信', '抖音', '地铁', '高铁', '飞机', '汽车', '人工智能', '外卖', '快递', '电商', '写字楼', '电烤箱', '微波炉', '冰箱']
  const ancientCount = (ancientGenres.has(genre) ? 1 : 0) + keywordHits(text, ancientTerms).length
  const modernCount = (modernGenres.has(genre) ? 1 : 0) + keywordHits(text, modernTerms).length
  if (ancientCount > 0 && modernCount === 0) return 'ancient'
  if (modernCount > 0 && ancientCount === 0) return 'modern'
  if (ancientCount > 0 && modernCount > 0) return 'mixed'
  return 'mixed'
}

function buildSummary (text, story, maxLength) {
  const prefix = joinNonEmpty([
    story.genre && story.genre !== 'general' ? story.genre : '',
    story.dynasty ? story.dynasty.period : (story.era === 'ancient' ? '古代' : story.era === 'modern' ? '现代' : ''),
    story.culture ? story.culture : '',
  ], '·')
  const content = text.replace(/[。！？!?；;]+$/u, '')
  const combined = prefix ? prefix + '的故事：' + content : content
  return truncateBySentence(combined, maxLength)
}

function buildGlobalNegativeAnchors (era, culture) {
  const anchors = []
  if (era === 'ancient') anchors.push(...NEGATIVE_ANCHOR_RULES.ancient)
  if (era === 'modern') anchors.push(...NEGATIVE_ANCHOR_RULES.modern)
  if (culture === '中国' && (era === 'ancient' || era === 'mixed')) {
    anchors.push('西方现代建筑', '西式餐具')
  }
  return dedupe(anchors)
}

/**
 * 全局故事上下文提取（读完整文案，而非单场景文字）。
 * @param {string} fullText
 * @param {object} [options]
 * @returns {object} story
 */
function extractStoryContext (fullText, options = {}) {
  const opts = normalizeSceneContextOptions(options)
  const text = normalizeText(fullText)
  if (!text) {
    return {
      genre: 'general', era: 'mixed', dynasty: null, culture: '', region: '', setting: [],
      time: { timeOfDay: '', season: '' }, characters: [], props: { ancient: [], modern: [] },
      visualStyle: '', tone: '', summary: '', anchors: [], negativeAnchors: [],
      confidence: 0, evidence: {}, method: 'rule-based', multiCandidates: [],
    }
  }

  const dynasty = detectDynasty(text)
  const culture = detectCulture(text)
  const genre = detectGenre(text)
  const era = detectEra(text, dynasty, genre.genre)
  const setting = detectSetting(text)
  const characters = detectCharacters(text)
  const props = detectProps(text, era)
  const visualStyle = detectVisualStyle(text, dynasty)
  const tone = detectTone(text)
  const time = detectTime(text)
  const negativeAnchors = buildGlobalNegativeAnchors(era, culture.culture)

  const evidence = {
    dynasty: dynasty ? dynasty.evidence : [],
    culture: culture.hits,
    genre: genre.evidence,
    props: [...props.ancient, ...props.modern],
  }

  // 一致性锚点：朝代名 + 朝代证据 + 文化 + 地域 + 场景设定（≤ maxAnchors）
  const anchors = dedupe([
    dynasty ? dynasty.name : '',
    ...(dynasty ? dynasty.evidence.slice(0, 1) : []),
    culture.culture,
    culture.region,
    ...setting.slice(0, 1),
  ]).slice(0, opts.maxAnchors)

  const summary = buildSummary(text, { genre: genre.genre, dynasty, era, culture: culture.culture }, opts.maxSummaryLength)

  const confidence = Math.max(
    dynasty ? dynasty.confidence : 0,
    culture.hits.length > 0 ? Math.min(0.95, 0.7 + culture.hits.length * 0.05) : 0,
    genre.evidence.length > 0 ? Math.min(0.9, 0.6 + genre.evidence.length * 0.05) : 0,
    0,
  )

  return {
    genre: genre.genre,
    era,
    dynasty,
    culture: culture.culture,
    region: culture.region,
    setting,
    time,
    characters,
    props,
    visualStyle,
    tone,
    summary,
    anchors,
    negativeAnchors,
    confidence,
    evidence,
    method: 'rule-based',
    multiCandidates: culture.multiCandidates,
  }
}

// ---------------------------------------------------------------------------
// 逐场景上下文融合
// ---------------------------------------------------------------------------

function isCookingScene (sceneText) {
  return /做饭|烹饪|炒菜|煮饭|烧饭|厨房|灶台|煮|炊烟/u.test(sceneText)
}

/**
 * 组装单个场景的上下文块 / 一致性锚点 / 负面锚点 / 角色。
 * @param {object|string} scene
 * @param {object} story
 * @param {object} [options]
 * @returns {{contextBlock: string, anchors: string[], negativeAnchors: string[], character: (object|null)}}
 */
function buildSceneContextBlock (scene, story, options = {}) {
  const opts = normalizeSceneContextOptions(options)
  const sceneText = sceneTextOf(scene)
  if (!sceneText) {
    return { contextBlock: '', anchors: [], negativeAnchors: [], character: null }
  }
  const storyObj = story && typeof story === 'object' ? story : {}

  const sceneSetting = detectSetting(sceneText)[0] || storyObj.setting?.[0] || ''
  const eraLabel = storyObj.dynasty
    ? storyObj.dynasty.period
    : (storyObj.era === 'ancient' ? '古代' : storyObj.era === 'modern' ? '现代' : '')
  const location = joinNonEmpty([storyObj.culture, eraLabel ? eraLabel + '时期' : '', storyObj.region, sceneSetting], '')

  const cooking = isCookingScene(sceneText)
  const era = storyObj.era
  const positiveProps = cooking && era === 'ancient'
    ? COOKING_POSITIVE_PROPS.ancient
    : []

  const contextBlock = truncateBySentence(joinNonEmpty([
    location ? location + '中，' + sceneText : sceneText,
    storyObj.visualStyle ? '；视觉' + storyObj.visualStyle : '',
    positiveProps.length > 0 ? '；使用' + positiveProps.join('、') : '',
    storyObj.tone ? '；光线' + storyObj.tone : '',
  ], ''), opts.contextBlockMaxChars)

  const negativeAnchors = []
  if (opts.includeNegativeAnchors) {
    if (storyObj.negativeAnchors && Array.isArray(storyObj.negativeAnchors)) {
      negativeAnchors.push(...storyObj.negativeAnchors)
    }
    if (cooking) {
      if (era === 'ancient') negativeAnchors.push(...COOKING_NEGATIVE_ANCHORS.ancient)
      if (era === 'modern') negativeAnchors.push(...COOKING_NEGATIVE_ANCHORS.modern)
    }
  }

  const anchors = dedupe([
    ...(Array.isArray(storyObj.anchors) ? storyObj.anchors : []),
    sceneSetting,
  ]).slice(0, opts.maxAnchors)

  const character = storyObj.characters && Array.isArray(storyObj.characters)
    ? storyObj.characters.find(c => c && c.name && sceneText.includes(c.name)) || null
    : null

  return {
    contextBlock,
    anchors,
    negativeAnchors: dedupe(negativeAnchors),
    character,
  }
}

function inferSceneType (sceneText) {
  if (!sceneText) return '常规场景'
  if (/对比|vs|而不是|相反/u.test(sceneText)) return '对比场景'
  if (/特写|细节|精致|纹理/u.test(sceneText)) return '细节场景'
  if (/全景|街道|市场|宫殿|俯瞰/u.test(sceneText)) return '全景场景'
  return '常规场景'
}

/**
 * 构造发送 prompt-engine 的 context（白名单七键，对齐服务端 build_context_section）。
 * @param {object|string} scene
 * @param {object} story
 * @param {string} [fullText]
 * @param {object} [options]
 * @returns {object}
 */
function buildPromptEngineSceneContext (scene, story, fullText = '', options = {}) {
  const opts = normalizeSceneContextOptions(options)
  const block = buildSceneContextBlock(scene, story, opts)
  const storyObj = story && typeof story === 'object' ? story : {}
  return {
    synopsis: typeof storyObj.summary === 'string' ? storyObj.summary : '',
    full_text: normalizeText(fullText),
    setting: block.contextBlock || sceneTextOf(scene),
    narrative_intent: typeof storyObj.tone === 'string' ? storyObj.tone : '',
    scene_type: (scene && typeof scene === 'object' && typeof scene.sceneType === 'string' && scene.sceneType)
      ? scene.sceneType
      : inferSceneType(sceneTextOf(scene)),
    character_list: Array.isArray(storyObj.characters)
      ? storyObj.characters.slice(0, 10).map(c => ({
          name: c.name,
          ...(c.descriptor && c.descriptor !== c.name ? { descriptor: c.descriptor } : {}),
        }))
      : [],
    character: block.character || null,
  }
}

/**
 * 单场景增强：附加 storyContext / anchors / negativeAnchors / character / context。
 * @param {object|string} scene
 * @param {object} story
 * @param {string} [fullText]
 * @param {object} [options]
 * @returns {object}
 */
function enrichSceneWithContext (scene, story, fullText = '', options = {}) {
  const opts = normalizeSceneContextOptions(options)
  const block = buildSceneContextBlock(scene, story, opts)
  const base = scene && typeof scene === 'object' ? { ...scene } : {}
  return {
    ...base,
    storyContext: block.contextBlock,
    anchors: block.anchors,
    negativeAnchors: block.negativeAnchors,
    character: block.character,
    context: buildPromptEngineSceneContext({ ...base, ...block }, story, fullText, opts),
  }
}

/**
 * 阶段主入口：全局故事上下文 + 逐场景增强。
 * 输入校验 fail closed（非空场景数组 + 非空文案）；规则异常由调用方降级（透传 + degraded）。
 * @param {Array} scenes
 * @param {string} fullText
 * @param {object} [options]
 * @returns {{story: object, scenes: Array, metadata: object}}
 */
function buildSceneContextResult (scenes, fullText, options = {}) {
  const opts = normalizeSceneContextOptions(options)
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('场景上下文增强需要非空场景数组')
  }
  const text = normalizeText(fullText)
  if (!text) {
    throw new Error('场景上下文增强需要非空文案')
  }
  if (!opts.enabled) {
    return {
      story: null,
      scenes,
      metadata: {
        enriched: false,
        degraded: true,
        extractor: 'rule-based',
        fallbackReason: 'scene_context_disabled',
        sceneCount: scenes.length,
      },
    }
  }
  const story = extractStoryContext(text, opts)
  const enriched = scenes.map(scene => enrichSceneWithContext(scene, story, text, opts))
  return {
    story,
    scenes: enriched,
    metadata: {
      enriched: true,
      degraded: false,
      extractor: 'rule-based',
      confidence: story.confidence,
      sceneCount: enriched.length,
    },
  }
}

/**
 * 负面提示合并：去重、合并、按上限截断。
 * @param {string} base
 * @param {string[]} [negativeAnchors]
 * @param {number} [maxLength]
 * @returns {string}
 */
function mergeNegativePrompt (base, negativeAnchors, maxLength = 500) {
  const parts = []
  for (const item of [base, ...(Array.isArray(negativeAnchors) ? negativeAnchors : [])]) {
    const text = normalizeText(item)
    if (text) parts.push(text)
  }
  const unique = dedupe(parts)
  const joined = unique.join(', ')
  const max = integerInRange(maxLength, 1, 2000, 500)
  return Array.from(joined).length > max ? Array.from(joined).slice(0, max).join('') : joined
}

module.exports = {
  COOKING_NEGATIVE_ANCHORS,
  COOKING_POSITIVE_PROPS,
  CONTEXT_KEY_WHITELIST,
  CULTURE_RULES,
  CHARACTER_RULES,
  DEFAULT_OPTIONS,
  DYNASTY_RULES,
  GENRE_RULES,
  NEGATIVE_ANCHOR_RULES,
  PROP_RULES,
  SETTING_RULES,
  TIME_RULES,
  TONE_RULES,
  VISUAL_STYLE_RULES,
  buildPromptEngineSceneContext,
  buildSceneContextBlock,
  buildSceneContextResult,
  buildSummary,
  detectCulture,
  detectDynasty,
  detectEra,
  detectGenre,
  detectProps,
  detectSetting,
  detectTime,
  detectVisualStyle,
  enrichSceneWithContext,
  extractStoryContext,
  inferSceneType,
  mergeNegativePrompt,
  normalizeSceneContextOptions,
  sceneTextOf,
  truncateBySentence,
}
