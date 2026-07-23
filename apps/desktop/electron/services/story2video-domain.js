// @ts-check
/**
 * Story2Video 领域增强的 Electron 适配层。
 *
 * 这里故意只保留无外部依赖的规则：远端 prompt-engine 负责最终润色，
 * 本模块负责时代/朝代识别和可解释的视觉上下文，避免主进程加载 TS 源码。
 */
'use strict'

const MODERN_TERMS = ['电脑', '手机', '互联网', '微信', '抖音', '微博', '地铁', '高铁', '飞机', '汽车', '人工智能', '大数据', '区块链', '社区服务中心', '医保', '社保', '外卖', '快递', '电商']
const ANCIENT_TERMS = ['朝廷', '皇帝', '王朝', '宫殿', '将军', '战国', '春秋', '三国', '古代', '城墙', '史官', '甲午', '鸦片战争', '丝绸之路', '科举', '长安', '洛阳']
const DYNASTIES = [
  { keywords: ['清朝', '清代', '大清', '清军', '康熙', '乾隆', '慈禧', '甲午', '鸦片战争'], name: '清朝', period: '清朝（1644-1912）', visualStyle: '清代宫殿、园林、清装、马褂、暖灰与金色电影光线' },
  { keywords: ['明朝', '明代', '大明', '朱元璋', '朱棣', '永乐', '锦衣卫'], name: '明朝', period: '明朝（1368-1644）', visualStyle: '明代建筑、宫城、汉服、乌纱帽、深红与青绿色调' },
  { keywords: ['唐朝', '唐代', '大唐', '李世民', '武则天', '唐玄宗', '长安', '安史之乱'], name: '唐朝', period: '唐朝（618-907）', visualStyle: '唐代宫殿、长安城、圆领袍、襦裙、金红色盛唐光线' },
  { keywords: ['宋朝', '宋代', '北宋', '南宋', '苏轼', '岳飞', '清明上河图'], name: '宋朝', period: '宋朝（960-1279）', visualStyle: '宋代城楼、市井、宋装、烟雨与克制的青灰色调' },
  { keywords: ['汉朝', '汉代', '西汉', '东汉', '刘邦', '汉武帝', '霍去病'], name: '汉朝', period: '汉朝（前202-220）', visualStyle: '汉代宫阙、古城、曲裾深衣、黛青与赭石色调' },
  { keywords: ['秦朝', '秦代', '秦始皇', '兵马俑', '万里长城'], name: '秦朝', period: '秦朝（前221-前207）', visualStyle: '秦代城墙、兵马俑、铠甲、青铜与尘土色调' },
  { keywords: ['三国', '曹操', '刘备', '诸葛亮', '赤壁之战'], name: '三国', period: '三国（220-280）', visualStyle: '汉末城寨、战场、战袍旌旗、冷暖对比光线' },
  { keywords: ['民国', '辛亥革命', '上海滩', '中山装', '旗袍'], name: '民国', period: '民国（1912-1949）', visualStyle: '民国洋楼、街巷、旗袍与胶片棕黄色调' },
]

function detectEra (text) {
  const modern = MODERN_TERMS.filter(term => text.includes(term))
  const ancient = ANCIENT_TERMS.filter(term => text.includes(term))
  if (modern.length > ancient.length && modern.length > 0) return { era: 'modern', confidence: Math.min(0.98, 0.7 + modern.length * 0.06), evidence: modern.slice(0, 5) }
  if (ancient.length > modern.length && ancient.length > 0) return { era: 'ancient', confidence: Math.min(0.98, 0.7 + ancient.length * 0.06), evidence: ancient.slice(0, 5) }
  if (modern.length > 0 && ancient.length === 0) return { era: 'modern', confidence: 0.8, evidence: modern.slice(0, 5) }
  if (ancient.length > 0 && modern.length === 0) return { era: 'ancient', confidence: 0.8, evidence: ancient.slice(0, 5) }
  return { era: 'mixed', confidence: 0, evidence: [] }
}

function detectDynasty (text) {
  for (const rule of DYNASTIES) {
    const evidence = rule.keywords.find(keyword => text.includes(keyword))
    if (evidence) return { name: rule.name, period: rule.period, visualStyle: rule.visualStyle, confidence: 0.95, method: 'keyword', evidence: [evidence] }
  }
  return null
}

function enrichScene (scene, index) {
  const text = typeof scene === 'string' ? scene : String(scene?.text || scene?.content || '')
  const era = detectEra(text)
  const dynasty = era.era === 'modern' ? null : detectDynasty(text)
  const sentiment = ['喜悦', '欢乐', '胜利', '成功', '和平', '美好'].some(word => text.includes(word))
    ? 'positive'
    : (['悲伤', '失败', '死亡', '战争', '痛苦', '灾难'].some(word => text.includes(word)) ? 'negative' : 'peaceful')
  const visualStyle = dynasty?.visualStyle || (era.era === 'modern'
    ? '现代真实场景、自然肤色、清晰构图、柔和日光'
    : (era.era === 'ancient' ? '古朴建筑、传统服饰、电影感体积光、低饱和暖色' : '具有叙事感的电影画面、自然光线、层次清晰'))
  const prompt = [text.trim(), visualStyle, sentiment === 'negative' ? '阴影与冷色氛围' : '自然层次与叙事光线', '无文字、主体明确'].filter(Boolean).join('；')
  return {
    ...(typeof scene === 'object' && scene ? scene : {}),
    index: Number.isInteger(scene?.index) ? scene.index : index,
    text,
    imagePromptSeed: prompt,
    prompt,
    domain: { era, dynasty, sentiment, visualStyle },
  }
}

function enrichHistoryScenes (scenes) {
  const input = Array.isArray(scenes) ? scenes : []
  const enriched = input.map(enrichScene)
  const eraCounts = enriched.reduce((counts, scene) => {
    counts[scene.domain.era] = (counts[scene.domain.era] || 0) + 1
    return counts
  }, {})
  return {
    scenes: enriched,
    sentences: enriched,
    domainEnriched: true,
    metadata: { contentType: 'history', eraCounts, count: enriched.length },
  }
}

function passthroughScenes (scenes) {
  const input = Array.isArray(scenes) ? scenes : []
  return {
    scenes: input,
    sentences: input,
    domainEnriched: false,
    metadata: { contentType: 'general', count: input.length },
  }
}

module.exports = { detectEra, detectDynasty, enrichHistoryScenes, passthroughScenes }
