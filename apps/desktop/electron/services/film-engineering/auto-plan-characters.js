// @ts-check
'use strict'
/**
 * auto-plan 的角色与参考绑定子模块（从 auto-plan.js 拆出，仅搬迁不改语义）
 *
 * 职责：角色槽位常量与停用词表、角色检出（用户标注 > 显式标记 > 对话动词 > 频次 + 停用词守卫）、
 *       槽位映射（ROKO/JAXX/LULU/REIN）、逐镜参考绑定（人物命中 / 场景轮转 / 单镜 ≤2 / 同图去重 /
 *       受控媒体根纵深防御）与参考相关警告 W1。
 * 拆分动因：.github/scripts/check-max-lines.js 禁止新代码引入 500 行以上文件。
 */
const os = require('os')
const path = require('path')
const { VIDEO_REFERENCE_PARAM_BY_PROVIDER } = require('./video-reference-inputs')

const MAX_CHARACTER_NAME_LENGTH = 20
const SLOT_ORDER = Object.freeze(['ROKO', 'JAXX', 'LULU', 'REIN'])

/** 常见非人名/功能词（对话动词前 2-3 字的高频误判来源） */
const STOPWORDS = new Set([
  '他们', '我们', '你们', '她们', '它们', '这个', '那个', '什么', '怎么', '为什么',
  '因为', '所以', '然后', '但是', '如果', '已经', '一个', '一下', '自己', '大家',
  '有人', '接着', '忽然', '此时', '现在', '之后', '之前', '里面', '外面', '上面',
  '下面', '时候', '事情', '东西', '地方', '声音', '眼睛', '手里', '身后', '面前',
  '一边', '一起', '之后', '最后', '首先', '于是', '而且', '并且', '不过', '只是',
])

const DIALOGUE_VERBS = ['说道', '说', '道', '喊道', '喊', '问道', '问', '答道', '答', '低语', '低声道', '开口']

function countOccurrences (text, needle) {
  if (!needle) return 0
  let count = 0
  let cursor = 0
  for (;;) {
    const at = text.indexOf(needle, cursor)
    if (at < 0) break
    count += 1
    cursor = at + needle.length
  }
  return count
}

/**
 * 角色检出（design D10）
 * 顺序：用户标注（强）> 显式标记（强）> 对话动词前名词（中，需频次 ≥2）> 频次候选
 * @param {{script: string, labeledRefs?: Array<{name: string}>}} opts
 * @returns {{characters: Array<{name: string, count: number, source: string}>, warnings: Array<{code: string, message: string}>}}
 */
function detectCharacters (opts) {
  const o = opts || {}
  const script = typeof o.script === 'string' ? o.script : ''
  const labeled = Array.isArray(o.labeledRefs) ? o.labeledRefs : []
  /** @type {Map<string, {name: string, count: number, source: string, order: number}>} */
  const found = new Map()
  let order = 0
  const add = (name, source, strong) => {
    const n = String(name || '').trim()
    if (!n || n.length > MAX_CHARACTER_NAME_LENGTH) return
    const count = countOccurrences(script, n)
    if (!strong && (count < 2 || STOPWORDS.has(n))) return
    const prev = found.get(n)
    if (prev) {
      if (strong && prev.source !== 'labeled') { prev.source = source; prev.count = count }
      return
    }
    found.set(n, { name: n, count, source, order: order++ })
  }

  // ① 用户标注（最高权重；即使频次 1 也保留——用户显式声明）
  for (const ref of labeled) {
    const name = ref && typeof ref.name === 'string' ? ref.name.trim() : ''
    if (name && script.includes(name)) add(name, 'labeled', true)
  }
  // ② 显式标记：【角色：X】 / 行首 X：（台词行，需排除 "X说道：" 这类动词结尾的伪角色名）
  for (const m of script.matchAll(/【角色[:：]\s*([^\s】]{1,20})】/g)) add(m[1], 'explicit', true)
  for (const m of script.matchAll(/^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_]{0,5})[:：](?![:：])/gm)) {
    const name = m[1]
    if (DIALOGUE_VERBS.some((v) => name.endsWith(v))) continue
    add(name, 'explicit', true)
  }
  // ③ 对话动词前名词（2-3 字，惰性取最近；需频次 ≥2 且非停用词）
  const verbGroup = DIALOGUE_VERBS.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|')
  const dialogueRe = new RegExp('([\\u4e00-\\u9fa5]{2,3}?)(?:' + verbGroup + ')', 'g')
  for (const m of script.matchAll(dialogueRe)) add(m[1], 'dialogue', false)

  const characters = [...found.values()]
    .sort((a, b) => (b.count - a.count) || (a.order - b.order))
    .map(({ name, count, source }) => ({ name, count, source }))
  const warnings = characters.length === 0
    ? [{ code: 'W4', message: '未检出角色，分镜将沿用模板自带的角色标识；可在人物参考图中填写角色名以提升人物一致性' }]
    : []
  return { characters, warnings }
}

/** 按频次降序填入槽位（不足 4 个只填前 K） */
function buildCharacterMap (characters) {
  const list = (Array.isArray(characters) ? characters : []).slice().sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0))
  const map = {}
  list.slice(0, SLOT_ORDER.length).forEach((c, i) => {
    if (c && typeof c.name === 'string' && c.name.trim()) map[SLOT_ORDER[i]] = c.name.trim()
  })
  return map
}

function isWithinRoot (root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * 逐镜参考绑定（design D11）
 * 人物：beat 文本命中角色名才注入；场景：按场景（title 首次出现序）轮转共享；单镜 ≤2 张、同图不重复。
 * 越界路径拒绝且不读取内容（纵深防御，与 reference-store 同口径）。
 * @returns {Array<{index: number, refPaths: string[], warnings: Array<{reason: string, path: string}>}>}
 */
function bindReferencePaths (opts) {
  const o = opts || {}
  const beats = Array.isArray(o.beats) ? o.beats : []
  const characterRefs = Array.isArray(o.characterRefs) ? o.characterRefs : []
  const sceneRefs = Array.isArray(o.sceneRefs) ? o.sceneRefs : []
  const mediaRoot = typeof o.mediaRoot === 'string' && o.mediaRoot ? o.mediaRoot : path.join(os.tmpdir(), 'film-engineering')
  const maxPerShot = Number.isInteger(o.maxPerShot) ? o.maxPerShot : 2

  const sceneIndexByTitle = new Map()
  const out = []
  for (const beat of beats) {
    const warnings = []
    const accepted = []
    const push = (p, kind) => {
      if (typeof p !== 'string' || !p) return
      if (!isWithinRoot(mediaRoot, p)) { warnings.push({ reason: 'outside-media-root', path: String(p).slice(0, 200) }); return }
      if (accepted.includes(p)) return
      if (accepted.length >= maxPerShot) return
      accepted.push(p)
      void kind
    }
    const charPaths = []
    for (const ref of characterRefs) {
      const name = ref && typeof ref.name === 'string' ? ref.name.trim() : ''
      if (!name) continue
      if (String(beat.text || '').includes(name)) charPaths.push(ref.path)
    }
    for (const p of charPaths) push(p, 'character')

    if (sceneRefs.length > 0 && accepted.length < maxPerShot) {
      const key = String(beat.title || ('#' + beat.index))
      if (!sceneIndexByTitle.has(key)) sceneIndexByTitle.set(key, sceneIndexByTitle.size)
      const sceneIdx = sceneIndexByTitle.get(key)
      push(sceneRefs[sceneIdx % sceneRefs.length], 'scene')
    }
    out.push({ index: Number.isInteger(beat.index) ? beat.index : out.length + 1, refPaths: accepted, warnings })
  }
  return out
}

/** 参考相关警告：provider 不在能力表且确有参考 → W1（不阻断，降级纯文本） */
function buildReferenceWarnings (opts) {
  const o = opts || {}
  const shotsWithReferences = Number(o.shotsWithReferences) || 0
  if (shotsWithReferences <= 0) return []
  const providerId = String(o.providerId || '')
  if (Object.prototype.hasOwnProperty.call(VIDEO_REFERENCE_PARAM_BY_PROVIDER, providerId)) return []
  return [{
    code: 'W1',
    message: '当前视频 Provider（' + (providerId || '未配置') + '）不支持参考图输入，参考图将被忽略并降级为纯文本出镜',
  }]
}

module.exports = {
  MAX_CHARACTER_NAME_LENGTH,
  SLOT_ORDER,
  STOPWORDS,
  countOccurrences,
  detectCharacters,
  buildCharacterMap,
  isWithinRoot,
  bindReferencePaths,
  buildReferenceWarnings,
}
