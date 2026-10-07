// M-10：S2V 父子契约的 fail-closed 是**单向**的 —— 白名单键在父级不存在时静默通过。
//
// 契约本意（s2v-panel-contract.js 的注释）是「未登记键访问显式抛错，防止拼错的键静默
// 返回 undefined 而丢失配置」。但 createS2VPanel 先用 Object.defineProperty 把每个
// S2V_PANEL_STATE 键都预置到了 state 上，随后 guard 的存在性检查
// `if (!(prop in target))` 对白名单内键**永远为假** —— 于是：
//
//   - 未登记键        → 抛错（防住了）
//   - 已登记但父级已删 → prop in target 为真 → 返回 undefined，**静默渲染为空/默认值**
//
// 这正是注释声称要防的那类 Bug，却恰好落在它唯一的缺口上：在 CreateView 里重命名或
// 删除任一 data / computed / methods 键，S2V 配置面板对应控件零报错地退化。
//
// 既有 S2vConfigPanels.test.js 结构上发现不了：它拿 S2V_PANEL_STATE 自身构造 mock vm，
// 白名单与真实 CreateView 之间没有任何交叉校验 —— 这条测试补的就是那一维。
//
// 静态提取走 SFC 编译 + Babel AST，不靠正则：CreateView.vue 有 5600+ 行，正则切
// Options API 的嵌套块在任何缩进/风格变化后都会静默给出错误键集合，与本条要防的缺陷
// 同构。末两条用例专门防「提取器自己坏了导致整条测试空转」。

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseJs } from '@babel/parser'
import { S2V_PANEL_STATE, S2V_PANEL_METHODS } from './s2v-panel-contract.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))   // src/views/video-creation
const CREATE_VIEW = path.resolve(HERE, '..', 'CreateView.vue')  // src/views/CreateView.vue

function keysOfObjectExpression(obj) {
  if (!obj || obj.type !== 'ObjectExpression') return []
  return obj.properties
    // 方法简写是 ObjectMethod 而非 ObjectProperty。只收 ObjectProperty 会把
    // computed/methods 里的每一个成员过滤掉，静默产出「0 键」的假账 ——
    // 这条锁自身就曾因此空转过。
    .map((p) => (p.type === 'ObjectProperty' || p.type === 'ObjectMethod') && !p.computed
      ? (p.key.name ?? p.key.value)
      : null)
    .filter(Boolean)
}

function keysOfDataMethod(objectMethod) {
  // data() { return { ... } }
  let found = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.type === 'ReturnStatement' && n.argument) {
      const ks = keysOfObjectExpression(n.argument)
      if (ks.length) found = found.concat(ks)
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue
      walk(n[k])
    }
  }
  walk(objectMethod.body)
  return found
}

function extractParentKeys(vueFile = CREATE_VIEW) {
  const { descriptor, errors } = parseSfc(fs.readFileSync(vueFile, 'utf8'))
  if (errors.length) throw new Error('SFC 解析报错：' + errors[0].message)
  const ast = parseJs(descriptor.script.content, {
    sourceType: 'module',
    plugins: ['optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread', 'classProperties', 'topLevelAwait'],
  })

  const data = new Set()
  const computed = new Set()
  const methods = new Set()

  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) walk(n); return }
    if ((node.type === 'ObjectProperty' || node.type === 'ObjectMethod') && node.key && !node.computed) {
      const k = node.key.name ?? node.key.value
      if (k === 'data') {
        const ks = node.type === 'ObjectMethod' ? keysOfDataMethod(node) : keysOfObjectExpression(node.value)
        for (const key of ks) data.add(key)
      } else if (k === 'computed') {
        for (const key of keysOfObjectExpression(node.value)) computed.add(key)
      } else if (k === 'methods') {
        for (const key of keysOfObjectExpression(node.value)) methods.add(key)
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue
      walk(node[key])
    }
  }
  walk(ast.program)

  return { data, computed, methods }
}

const parent = extractParentKeys()
const parentStateKeys = new Set([...parent.data, ...parent.computed])

describe('M-10 S2V 父子契约与 CreateView 的双向交叉校验', () => {
  it('提取器自身有效：确实取到了 CreateView 的三个键集合', () => {
    // 这条是整条锁的防空洞前提。提取器一旦静默失效（正则失配、AST 形状变化、
    // data 写成别的形态），下面两条会「全部通过」而不是「全部通过」——
    // 那种绿是装饰。这里用与真实规模同量级的下限把空转钉死。
    expect(parent.data.size).toBeGreaterThan(80)
    expect(parent.computed.size).toBeGreaterThan(30)
    expect(parent.methods.size).toBeGreaterThan(100)
  })

  it('提取器能识别「父级不存在的键」——否则下面的对账恒真', () => {
    // 反证锚点：构造一个必然不存在的键，断言它确实被判为缺失。
    // 若提取器返回的是全集或空集（两种典型失效），这条会转红。
    const bogus = '__s2v_definitely_not_on_parent__'
    expect(parentStateKeys.has(bogus)).toBe(false)
    expect(parent.methods.has(bogus)).toBe(false)
  })

  it('S2V_PANEL_STATE 的每个键在 CreateView 的 data/computed 中真实存在', () => {
    const missing = S2V_PANEL_STATE.filter((k) => !parentStateKeys.has(k))
    expect(
      missing,
      `以下 S2V 面板 state 键在 CreateView 的 data/computed 中不存在：` +
      `${missing.join(', ')}。\n` +
      '契约守卫只防「未登记键」，对「已登记但父级已删/改名」的键静默返回 undefined —— ' +
      '面板控件会退化为空值或默认值且零报错。要么在 CreateView 恢复该键，要么把它从 ' +
      'S2V_PANEL_STATE 移除。'
    ).toEqual([])
  })

  it('S2V_PANEL_METHODS 的每个键在 CreateView 的 methods 中真实存在', () => {
    const missing = S2V_PANEL_METHODS.filter((k) => !parent.methods.has(k))
    expect(
      missing,
      `以下 S2V 面板方法在 CreateView.methods 中不存在：${missing.join(', ')}。\n` +
      'fns 转发会变成 `(...args) => vm[key](...args)`，key 缺失时点击直接 TypeError；' +
      '若该方法被移出 methods 又留在白名单，面板上的按钮会在运行时才炸。'
    ).toEqual([])
  })

  it('白名单内部无重复登记', () => {
    expect(new Set(S2V_PANEL_STATE).size).toBe(S2V_PANEL_STATE.length)
    expect(new Set(S2V_PANEL_METHODS).size).toBe(S2V_PANEL_METHODS.length)
  })
})