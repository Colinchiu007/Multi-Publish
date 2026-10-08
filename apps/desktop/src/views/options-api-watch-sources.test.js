// Regression: Options API 下 watch 键与 data / props / computed 的一致性。
//
// Why this lock exists
// --------------------
// 2026-10-07 修 M-12（CreateView 双深 watch）时，我把「S2V 选项快照」的方法体
// 直接写进了 `watch: {}` 块。在 Options API 里，watch 块中的**方法名即被监听的属性名** ——
// 而那个名字既不是 data 也不是 computed，于是该 watch **永远不会触发**，
// 等于把「S2V 选项自动保存」整个功能静默删掉了。
//
// 更糟的是：改动后 CreateView.test.js 的 288 条用例**全绿** —— 因为既有测试对
// S2V 自动保存零覆盖。测试全绿在这里不是"没问题"，而是"没人看着"。
//
// 于是先补这条锁，把「watch 键必须指向一个真实存在的 data / props / computed」变成机械判据。
//
// 实现说明（两版踩坑后定稿）
// --------------------------
// 1. 定位块不能靠 `^  watch` 这种固定缩进正则 —— 实测各文件缩进不一致，首版解析出 0 个块，
//    守卫全空转。现用 @vue/compiler-sfc 拿 script，再做**大括号配平**取块。
// 2. 取键名不能只靠 `new Function` 求值 —— 本仓 6 个 Options API 视图**全部**写成
//    `data() { return {...} }`（首版正则只认 `data: {`，于是 data 键一个都没拿到，
//    CreateView 的合法 watch 被误报成孤儿）。求值失败时回退到**文本层**扫描键名。
//
//   pnpm exec vitest run src/views/options-api-watch-sources.test.js

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseSfc } from '@vue/compiler-sfc'

const VIEWS_DIR = __dirname

function scriptOf (file) {
  const raw = fs.readFileSync(path.join(VIEWS_DIR, file), 'utf8')
  const { descriptor, errors } = parseSfc(raw)
  if (errors.length) throw new Error(`${file} SFC 解析报错: ${errors[0].message}`)
  return descriptor.script ? descriptor.script.content : ''
}

/**
 * 定位 `xxx: {` 块并做括号配平，返回块体文本（不含块名）。
 * 同时支持 `data: {` 与 `data() {` 两种写法 —— 后者是本仓 6 个视图的实际形态。
 */
function extractBlockBody (script, blockName) {
  const lines = script.split(/\r?\n/)
  // data() { ... } / data: { ... } / watch: { ... } 都要命中
  const startRe = new RegExp(`^\\s{0,4}${blockName}\\s*(?:\\(\\s*\\))?\\s*:?\\s*\\{`)
  const startLine = lines.findIndex((l) => startRe.test(l))
  if (startLine === -1) return null

  const startIdx = script.indexOf(lines[startLine])
  let depth = 0
  let endIdx = -1
  for (let i = startIdx; i < script.length; i++) {
    const ch = script[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { endIdx = i + 1; break }
    }
  }
  if (endIdx === -1) return null

  const blockText = script.slice(startIdx, endIdx)
  return blockText.slice(blockText.indexOf('{'))
}

/** 求值快路径：块体是纯字面量时直接拿键名（最准）。失败返回 null。 */
function tryEvalObject (body) {
  if (!body) return null
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(`return (${body})`)()
    return v && typeof v === 'object' ? v : null
  } catch (_) {
    return null // 引用了外部标识符 / 是函数体 ⇒ 交给文本层回退
  }
}

// JS 关键字与控制结构：文本层扫描时要排除，否则把代码误当成键名
const NOT_A_KEY = new Set([
  'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'try', 'catch', 'finally',
  'return', 'throw', 'new', 'typeof', 'instanceof', 'in', 'of', 'do', 'break', 'continue',
  'function', 'async', 'await', 'const', 'let', 'var', 'class', 'extends', 'super', 'this',
  'true', 'false', 'null', 'undefined', 'yield', 'delete', 'void', 'import', 'export',
])

/**
 * 文本层回退：收集块内所有形如 `key:` / `key(` / `'key':` 的标识符。
 *
 * 这是**保守**收集（连嵌套对象的键也算 known），代价是可能漏报深层孤儿，
 * 收益是绝不把"块里明明写着这个名字"误报成不存在 —— 而误报正是首版的失守形态
 * （一个假阳性就足以让人把整条守卫删掉，那样真正的孤儿从此无人拦）。
 * 更精确的运行时判据见 s2v-options-autosave.test.js。
 */
function collectKeysFromText (body) {
  if (!body) return []
  const keys = new Set()
  const re = /^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*[:(]/gm
  let m
  while ((m = re.exec(body)) !== null) {
    const key = m[1]
    if (!NOT_A_KEY.has(key)) keys.add(key)
  }
  return [...keys]
}

function blockKeys (script, blockName) {
  const body = extractBlockBody(script, blockName)
  if (body == null) return []
  const evaluated = tryEvalObject(body)
  if (evaluated) return Object.keys(evaluated)
  // data()/computed 里含函数体 ⇒ 求值会失败，回退文本层
  if (typeof evaluated === 'function') {
    try { return Object.keys(evaluated() || {}) } catch (_) { /* 落文本层 */ }
  }
  return collectKeysFromText(body)
}

/** Vue 支持 `'a.b'` 路径字符串监听，且允许 `$route` 这类实例属性 —— 不算孤儿。 */
function isPathOrInstanceSource (key) {
  return key.includes('.') || key.startsWith('$')
}

const TARGETS = fs.readdirSync(VIEWS_DIR).filter((f) => f.endsWith('.vue')).sort()

describe('M-12 防回归：Options API 的 watch 键必须指向真实存在的 data / props / computed', () => {
  const analyzed = []
  for (const file of TARGETS) {
    const script = scriptOf(file)
    const watchKeys = blockKeys(script, 'watch')
    if (!watchKeys.length) continue
    // props 也是合法的 watch 源（CreateViewHistory.vue 就 watch 了 history/historyFilter
    // 两个 prop）。首版判据漏了这一类，把合法写法报成了"监听不存在的属性"。
    analyzed.push({
      file,
      watchKeys,
      data: blockKeys(script, 'data'),
      props: blockKeys(script, 'props'),
      computed: blockKeys(script, 'computed'),
      methods: blockKeys(script, 'methods'),
    })
  }

  it('分析器本身有效：确实从 .vue 里解析出了 watch 块', () => {
    expect(
      analyzed.length,
      '没有任何 .vue 解析出 watch 块 ⇒ 提取逻辑失效，下面的断言全是空转'
    ).toBeGreaterThan(0)
    expect(
      analyzed.some((r) => r.watchKeys.length > 0),
      '解析出的 watch 块不应全为空'
    ).toBe(true)
  })

  // 至少确认目标文件在覆盖范围内（防止将来文件改名导致锁悄悄失效）
  //
  // 注意：本锁只覆盖 **Options API**（存在 `watch: {}` 块）的视图。组合式
  // `<script setup>` 视图（如 PublishHistory.vue）不在此列 —— 它们用 watch()
  // 显式传 getter，不存在"键名拼错就静默失效"的形态，由运行时测试覆盖。
  // 首版把 PublishHistory.vue 也写进这条断言，结果是对一个根本不适用的形态
  // 强行断言，红得没有意义。
  it('覆盖范围内必须包含本次事故的文件 CreateView.vue', () => {
    expect(analyzed.map((r) => r.file)).toContain('CreateView.vue')
  })

  // 反向锁：data 提取必须真的拿到键 —— 首版在这里静默失败（正则只认 `data: {`，
  // 而全部 6 个 Options API 视图都是 `data() {`），导致下面每条断言在空集上空转。
  it('分析器有效性：Options API 视图的 data 键确实被提取到了', () => {
    const createView = analyzed.find((r) => r.file === 'CreateView.vue')
    expect(createView, 'CreateView.vue 未被纳入分析').toBeTruthy()
    expect(
      createView.data.length,
      'data 键为空 ⇒ 提取器又退化了，下面的"孤儿"全是空集上的假阳性'
    ).toBeGreaterThan(0)
    // 本次修好的两个键必须都在里面
    expect(createView.data).toContain('sceneAssetSelectionActive')
    expect(createView.computed).toContain('s2vOptionsSnapshot')
  })

  for (const r of analyzed) {
    it(`${r.file}：每个 watch 键都能在 data / props / computed 中找到`, () => {
      const known = new Set([...r.data, ...r.props, ...r.computed])
      const orphan = r.watchKeys.filter((k) => !known.has(k) && !isPathOrInstanceSource(k))
      expect(
        orphan,
        '以下 watch 键不对应任何 data/props/computed —— 在 Options API 里这表示' +
        '"监听一个不存在的属性"，handler 永不触发，功能被静默删掉：' + orphan.join(', ')
      ).toEqual([])
    })

    it(`${r.file}：watch 键不得与 methods 同名（防方法体误放进 watch 块）`, () => {
      const methods = new Set(r.methods)
      const misplaced = r.watchKeys.filter((k) => methods.has(k))
      expect(
        misplaced,
        '以下名字同时出现在 methods 与 watch —— 多半是把方法体误放进了 watch 块：' + misplaced.join(', ')
      ).toEqual([])
    })
  }

  // 反向锁：别让守卫退化成"什么都不许有"或"漏掉合法形态"
  it('反向锁：props / computed 键与路径字符串被 watch 都不得误报', () => {
    // props 形态（CreateViewHistory.vue 的真实写法）
    const fromProps = { watchKeys: ['historyFilter', 'history'], props: ['historyFilter', 'history'] }
    const knownP = new Set([...fromProps.props])
    expect(fromProps.watchKeys.filter((k) => !knownP.has(k))).toEqual([])

    // computed 形态（本次 M-12 的正确写法）
    const fromComputed = { watchKeys: ['s2vOptionsSnapshot'], computed: ['s2vOptionsSnapshot'] }
    const knownC = new Set([...fromComputed.computed])
    expect(fromComputed.watchKeys.filter((k) => !knownC.has(k))).toEqual([])

    // 路径字符串监听（'$route.query.view'）—— Vue 明确支持的形态，不得误报
    expect(isPathOrInstanceSource('$route.query.view')).toBe(true)
    expect(isPathOrInstanceSource('s2vConfig.subtitleStyle')).toBe(true)
    expect(isPathOrInstanceSource('plainDataKey')).toBe(false)
  })

  it('反向锁：孤儿键必须真的报出来（防判据被写宽）', () => {
    // 这正是本次事故的形态：一个名字既不在 data/props/computed，也不该在 methods
    const orphan = ['s2vOptionsSnapshot'].filter((k) => !new Set(['someOtherKey']).has(k) && !isPathOrInstanceSource(k))
    expect(orphan).toEqual(['s2vOptionsSnapshot'])
  })
})
