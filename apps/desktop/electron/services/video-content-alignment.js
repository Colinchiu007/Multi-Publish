// @ts-check
/**
 * video-content-alignment — 内容对齐门禁（video-content-fidelity S3）。
 *
 * 校验 storyboard 场景是否覆盖文案关键实体/事件：
 *   - extractKeyEntities：内置词典 + 可选 LLM 兜底抽取
 *   - checkSceneAlignment：覆盖率 = 场景 prompt 命中实体数 / 实体总数
 *   - assessVisualConsistency：视觉层一致性评估桩（S5，本期返回 not_implemented，不冒充已实现）
 *
 * 契约（对齐 openspec video-content-fidelity）：
 *   - 覆盖率低于 minCoverage → pass=false + missing 清单（调用方据此重试）
 *   - 场景数组为空/非数组 → 返回 fail closed 标记（isValid=false）
 *   - 实体长度为 1 的忽略（防噪音）；空实体集 → pass=true + warning
 *   - 视觉评估接口未接入真实 VLM 时恒返回 {status:'not_implemented'}
 */
'use strict'

const DEFAULT_OPTIONS = Object.freeze({
  minCoverage: 0.8,
  dictFallbackMinHits: 5,
})

/** 词典实体：{name, type}，type ∈ person|event|place|work|other */
const KEY_ENTITY_DICT = Object.freeze([
  // 三国/历史高频（首期覆盖；长尾主题走 LLM 兜底）
  { name: '关羽', type: 'person' },
  { name: '刘备', type: 'person' },
  { name: '张飞', type: 'person' },
  { name: '曹操', type: 'person' },
  { name: '陈寿', type: 'person' },
  { name: '张辽', type: 'person' },
  { name: '徐晃', type: 'person' },
  { name: '张郃', type: 'person' },
  { name: '程昱', type: 'person' },
  { name: '郭嘉', type: 'person' },
  { name: '颜良', type: 'person' },
  { name: '于禁', type: 'person' },
  { name: '庞德', type: 'person' },
  { name: '曹仁', type: 'person' },
  { name: '曹魏', type: 'other' },
  { name: '蜀汉', type: 'other' },
  { name: '三国志', type: 'work' },
  { name: '春秋笔法', type: 'other' },
  { name: '白马之战', type: 'event' },
  { name: '襄樊之战', type: 'event' },
  { name: '水淹七军', type: 'event' },
  { name: '威震华夏', type: 'event' },
  { name: '桃园结义', type: 'event' },
  { name: '官渡之战', type: 'event' },
  { name: '汉寿亭侯', type: 'other' },
  { name: '万人之敌', type: 'other' },
])

/**
 * 内置词典抽取：返回文案中命中的实体（子串包含，长度 ≥ 2）。
 * @param {string} text
 * @returns {Array<{name:string, type:string}>}
 */
function extractDictEntities (text) {
  const source = String(text || '')
  const seen = new Set()
  const hits = []
  for (const entity of KEY_ENTITY_DICT) {
    if (entity.name.length < 2) continue
    if (source.includes(entity.name) && !seen.has(entity.name)) {
      seen.add(entity.name)
      hits.push({ name: entity.name, type: entity.type })
    }
  }
  return hits
}

/**
 * 抽取文案关键实体（词典优先，LLM 兜底）。
 * @param {unknown} text
 * @param {object} [options]
 * @param {boolean} [options.llmExtractFallback]
 * @param {(system: string, user: string) => Promise<string>} [options.extractLlm]
 * @returns {Promise<{entities: string[], source: 'dict'|'llm'|'mixed', degraded: boolean}>}
 */
async function extractKeyEntities (text, options = {}) {
  const source = String(text || '').trim()
  const dictHits = extractDictEntities(source)
  const llmFallback = options.llmExtractFallback !== false
  const extractLlm = typeof options.extractLlm === 'function' ? options.extractLlm : null

  if (!source) return { entities: [], source: 'dict', degraded: false }
  if (!llmFallback || !extractLlm || dictHits.length >= DEFAULT_OPTIONS.dictFallbackMinHits) {
    return { entities: dictHits.map(e => e.name), source: 'dict', degraded: false }
  }

  // LLM 兜底：要求输出 JSON 字符串数组（人物/事件/地点/作品等关键实体）
  try {
    const system = '你是文本实体抽取器。从用户文案中抽取关键实体（人物/事件/地点/作品/专有名词），只输出 JSON 字符串数组，不要多余文字。'
    const user = '文案：\n' + source.slice(0, 2000)
    const raw = await extractLlm(system, user)
    const parsed = JSON.parse(raw)
    const names = Array.isArray(parsed)
      ? parsed.filter(item => typeof item === 'string' && item.trim().length >= 2).map(item => item.trim())
      : []
    const merged = Array.from(new Set([...dictHits.map(e => e.name), ...names]))
    return { entities: merged, source: merged.length > dictHits.length ? 'mixed' : 'dict', degraded: false }
  } catch (error) {
    // LLM 兜底失败：降级用词典结果，标记 degraded（不阻断）
    return { entities: dictHits.map(e => e.name), source: 'dict', degraded: true }
  }
}

/**
 * 场景对齐校验。
 * @param {unknown} scenes
 * @param {unknown} entities
 * @param {number} [minCoverage]
 * @returns {{ isValid: boolean, pass: boolean, coverage: number, matched: string[], missing: string[], entityCount: number, warning?: string }}
 */
function checkSceneAlignment (scenes, entities, minCoverage = DEFAULT_OPTIONS.minCoverage) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { isValid: false, pass: false, coverage: 0, matched: [], missing: [], entityCount: 0 }
  }
  const list = Array.isArray(entities)
    ? entities.filter(e => typeof e === 'string' && e.trim().length >= 2).map(e => e.trim())
    : []
  const target = Number(minCoverage)
  const effective = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : DEFAULT_OPTIONS.minCoverage

  if (list.length === 0) {
    return {
      isValid: true,
      pass: true,
      coverage: 1,
      matched: [],
      missing: [],
      entityCount: 0,
      warning: '无实体可校验（文案未命中词典且未启用 LLM 兜底）',
    }
  }

  const sceneText = scenes
    .map(s => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object') return String(s.prompt || s.text || '')
      return ''
    })
    .join('\n')

  const matched = []
  const missing = []
  for (const entity of list) {
    if (sceneText.includes(entity)) matched.push(entity)
    else missing.push(entity)
  }
  const coverage = list.length > 0 ? matched.length / list.length : 1
  return {
    isValid: true,
    pass: coverage >= effective,
    coverage: Math.round(coverage * 100) / 100,
    matched,
    missing,
    entityCount: list.length,
  }
}

/**
 * 视觉层一致性评估桩（S5）。本期未接入真实 VLM，恒返回 not_implemented。
 * 流水线不得因视觉评估缺失而失败。
 * @returns {{status: 'not_implemented'}}
 */
function assessVisualConsistency () {
  return { status: 'not_implemented' }
}

module.exports = {
  DEFAULT_OPTIONS,
  KEY_ENTITY_DICT,
  extractDictEntities,
  extractKeyEntities,
  checkSceneAlignment,
  assessVisualConsistency,
}
