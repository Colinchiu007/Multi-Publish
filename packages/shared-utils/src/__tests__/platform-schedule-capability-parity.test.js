/**
 * 平台侧定时能力注册表：CJS / ESM 孪生的 parity 回归。
 *
 * 背景 Bug（2026-10-07，PR #3011）：
 *   渲染层 publish-schedule-contract.js 直接具名 import 了 CommonJS 的
 *   platform-schedule-capability.js，而 vite alias 没有为它登记 .browser.js 孪生。
 *   后果只在 **dev server** 暴露：/create 与 /publish 等路由整页渲染失败
 *   （"does not provide an export named 'getPlatformScheduleCapability'"）。
 *   打包（rollup commonjs 插件兜底）与 vitest（自带 CJS interop）都绿，
 *   只有视觉回归会红 —— 属于「构建成功 ≠ 能跑」的典型盲区。
 *
 * 本文件锁两件事：
 *   1) ESM 孪生导出齐全，且与 CJS 版逐函数同源同值（数据都来自同一份 JSON）；
 *   2) 渲染层若直接 import 该模块，必须是走 alias 的孪生路径，而不是裸 CJS。
 */
import { describe, expect, it } from 'vitest'

import cjsModule from '../platform-schedule-capability.js'
import * as browserModule from '../platform-schedule-capability.browser.js'

/** 孪生两侧必须齐备的导出清单（少一个渲染层就会在 dev server 崩） */
const PARITY_EXPORTS = [
  'PLATFORM_SCHEDULE_CAPABILITY',
  'getPlatformScheduleCapability',
  'isPlatformSideScheduleSupported',
  'getScheduleCapablePlatforms',
  'resolveScheduleMode',
  'validateScheduleCapabilityRegistry',
]

/** 取一批代表平台：已取证的、显式阻断的、未知的三类都要覆盖 */
const PROBE_IDS = [
  'toutiao',
  'wechat_mp',
  'zhihu',
  'bilibili',
  'some-unknown-platform',
  '',
  null,
  undefined,
  123,
]

describe('platform-schedule-capability：ESM 孪生与 CJS 版 parity', () => {
  it('孪生导出齐全（缺一个就是渲染层 dev server 崩）', () => {
    for (const name of PARITY_EXPORTS) {
      expect(browserModule, `孪生缺少导出 ${name}`).toHaveProperty(name)
      expect(cjsModule, `CJS 版缺少导出 ${name}`).toHaveProperty(name)
    }
  })

  it('注册表数据同源：平台 key 集合完全一致', () => {
    expect(Object.keys(browserModule.PLATFORM_SCHEDULE_CAPABILITY).sort())
      .toEqual(Object.keys(cjsModule.PLATFORM_SCHEDULE_CAPABILITY).sort())
  })

  it('注册表逐平台取值同源', () => {
    for (const id of Object.keys(cjsModule.PLATFORM_SCHEDULE_CAPABILITY)) {
      expect(browserModule.getPlatformScheduleCapability(id))
        .toEqual(cjsModule.getPlatformScheduleCapability(id))
    }
  })

  it('getPlatformScheduleCapability 对各类入参判定一致（含未知平台 fail-closed）', () => {
    for (const id of PROBE_IDS) {
      expect(browserModule.getPlatformScheduleCapability(id))
        .toEqual(cjsModule.getPlatformScheduleCapability(id))
    }
    // 未知平台必须阻断，绝不静默立即发布
    expect(browserModule.getPlatformScheduleCapability('some-unknown-platform').mode).toBe('unsupported')
  })

  it('支持判定 / 模式解析 / 可用平台列表一致', () => {
    for (const id of PROBE_IDS) {
      expect(browserModule.isPlatformSideScheduleSupported(id))
        .toBe(cjsModule.isPlatformSideScheduleSupported(id))
      expect(browserModule.resolveScheduleMode(id))
        .toBe(cjsModule.resolveScheduleMode(id))
    }
    expect(browserModule.getScheduleCapablePlatforms().sort())
      .toEqual(cjsModule.getScheduleCapablePlatforms().sort())
  })

  it('结构自检两侧都通过且结论一致', () => {
    expect(browserModule.validateScheduleCapabilityRegistry()).toEqual([])
    expect(browserModule.validateScheduleCapabilityRegistry())
      .toEqual(cjsModule.validateScheduleCapabilityRegistry())
  })

  it('注册表深冻结：调用方无法通过返回值改写全局真源', () => {
    const cap = browserModule.PLATFORM_SCHEDULE_CAPABILITY.toutiao
    expect(Object.isFrozen(cap)).toBe(true)
    expect(Object.isFrozen(browserModule.PLATFORM_SCHEDULE_CAPABILITY)).toBe(true)
  })
})

describe('渲染层跨边界导入必须走 ESM 孪生', () => {
  it('publish-schedule-contract.js 不得裸 import CJS 能力注册表', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'desktop', 'src', 'features', 'publish', 'publish-schedule-contract.js'),
      'utf8'
    )
    // 裸 CJS 路径在 vite dev server 会整页渲染失败；必须走 alias（见 vite.config.js）。
    expect(src).toContain("from '@multi-publish/shared-utils/src/platform-schedule-capability'")
    // 该 specifier 必须在 vite.config.js 里 alias 到 .browser.js 孪生
    const viteConfig = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', '..', 'apps', 'desktop', 'vite.config.js'),
      'utf8'
    )
    expect(viteConfig).toMatch(/'@multi-publish\/shared-utils\/src\/platform-schedule-capability':/)
    expect(viteConfig).toContain('platform-schedule-capability.browser.js')
  })
})