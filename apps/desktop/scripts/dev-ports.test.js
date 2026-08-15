// @ts-check
/**
 * dev-ports.test.js — worktree 独立端口解析回归保护（node --test）
 * 覆盖：默认路径、派生范围、确定性、大小写不敏感、真实 worktree fleet 无碰撞、
 * 显式覆盖（含部分覆盖保持另一端口派生）、非法端口拒绝。
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveDevPorts, parsePort, DEFAULT_VITE_PORT, DEFAULT_CDP_PORT } = require('./dev-ports')

const WT = 'D:/Data/projects/mp-worktrees'

test('非 worktree 路径（主仓库/CI）使用默认 5174/9222', () => {
  const r = resolveDevPorts('D:/Data/projects/Multi-Publish', {})
  assert.equal(r.vite, DEFAULT_VITE_PORT)
  assert.equal(r.cdp, DEFAULT_CDP_PORT)
  assert.equal(r.derived, false)
})

test('mp-worktrees 下路径稳定派生端口且落在范围内', () => {
  const r1 = resolveDevPorts(WT + '/mp-desktop-dev', {})
  assert.equal(r1.derived, true)
  assert.ok(r1.vite >= 5174 && r1.vite <= 7973, 'vite ' + r1.vite + ' 超出范围')
  assert.ok(r1.cdp >= 9222 && r1.cdp <= 12021, 'cdp ' + r1.cdp + ' 超出范围')

  const r2 = resolveDevPorts(WT + '/mp-desktop-dev', {})
  assert.equal(r1.vite, r2.vite)
  assert.equal(r1.cdp, r2.cdp)
})

test('路径大小写/结尾分隔符不影响派生结果（Windows 不敏感）', () => {
  const a = resolveDevPorts(WT + '/mp-desktop-dev', {})
  const b = resolveDevPorts(WT + '/MP-DESKTOP-DEV/', {})
  assert.equal(a.vite, b.vite)
  assert.equal(a.cdp, b.cdp)
})

// 真实本地 worktree fleet 快照（2026-08-15）：span=900 时代 mp-content-type-auto-suggest 与
// mp-s2v-translation-optimize 曾同时派生 vite=5854/cdp=9902；span=2800 后必须全 fleet 无碰撞。
test('真实 worktree fleet 全量无端口碰撞（回归 span 900 碰撞对）', () => {
  const names = [
    'mp-account-card-creator-tab',
    'mp-content-type-auto-suggest',
    'mp-desktop-dev',
    'mp-engine-marketing-docs',
    'mp-engine-shared-core',
    'mp-film-engineering',
    'mp-higgsfield-p0',
    'mp-merge-domain-enrich',
    'mp-pe-round3bc-archive',
    'mp-pe-round3bc-contract',
    'mp-prompt-eval-video',
    'mp-s2v-compose-progress',
    'mp-s2v-duration-50min',
    'mp-s2v-history-fix',
    'mp-s2v-scene-multi-materials',
    'mp-s2v-translation-optimize',
  ]
  const vites = names.map((n) => resolveDevPorts(WT + '/' + n, {}).vite)
  const cdps = names.map((n) => resolveDevPorts(WT + '/' + n, {}).cdp)
  assert.equal(new Set(vites).size, vites.length, 'vite 撞车: ' + vites.join(','))
  assert.equal(new Set(cdps).size, cdps.length, 'cdp 撞车: ' + cdps.join(','))
})

test('显式 MP_VITE_PORT/MP_CDP_PORT 同时覆盖派生（应急/测试）', () => {
  const r = resolveDevPorts(WT + '/mp-desktop-dev', { MP_VITE_PORT: '5188', MP_CDP_PORT: '9333' })
  assert.equal(r.vite, 5188)
  assert.equal(r.cdp, 9333)
  assert.equal(r.derived, true)
})

test('只覆盖一个端口时，另一个仍按路径派生（不回落共享默认 9222）', () => {
  const base = resolveDevPorts(WT + '/mp-desktop-dev', {})
  const r = resolveDevPorts(WT + '/mp-desktop-dev', { MP_VITE_PORT: '5188' })
  assert.equal(r.vite, 5188)
  assert.equal(r.cdp, base.cdp)
  assert.equal(r.derived, true)

  const r2 = resolveDevPorts(WT + '/mp-desktop-dev', { MP_CDP_PORT: '9333' })
  assert.equal(r2.vite, base.vite)
  assert.equal(r2.cdp, 9333)
  assert.equal(r2.derived, true)
})

test('非 worktree 路径 + 显式覆盖也生效', () => {
  const r = resolveDevPorts('D:/Data/projects/Multi-Publish', { MP_VITE_PORT: '7777' })
  assert.equal(r.vite, 7777)
  assert.equal(r.cdp, DEFAULT_CDP_PORT)
  assert.equal(r.derived, true)
})

test('非法端口覆盖值抛错（NaN/越界）', () => {
  assert.throws(() => parsePort('abc'), /非法端口/)
  assert.throws(() => parsePort('99'), /非法端口/)
  assert.throws(() => parsePort('70000'), /非法端口/)
  assert.throws(() => resolveDevPorts(WT + '/mp-desktop-dev', { MP_VITE_PORT: 'not-a-port' }), /非法端口/)
})

test('MP_WORKTREES_ROOT 可配置（目录迁移后派生仍生效）', () => {
  const alt = 'D:/tmp/alt-worktrees'
  const r = resolveDevPorts(alt + '/mp-other-dev', { MP_WORKTREES_ROOT: alt })
  assert.equal(r.derived, true)
  assert.ok(r.vite >= 5174 && r.vite <= 7973)
})
