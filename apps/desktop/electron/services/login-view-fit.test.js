import { beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

let fitModule

beforeEach(async () => {
  vi.resetModules()
  __resetElectronMock()
  fitModule = await import('./login-view-fit.js')
})

/**
 * 可控探针视图：scrollWidths 为探针返回值队列（只剩一个值时重复返回），
 * calls.setZoom 记录全部 setZoomFactor 调用，getZoomFactor 跟随已应用的缩放。
 */
function createFitView (opts = {}) {
  const calls = { setZoom: [] }
  let zoom = typeof opts.zoom === 'number' && opts.zoom > 0 ? opts.zoom : 1
  const queue = (opts.scrollWidths || []).slice()
  const view = {
    getBounds: opts.getBounds || function () {
      return { x: 200, y: 76, width: typeof opts.width === 'number' ? opts.width : 1051, height: 800 }
    },
    webContents: {
      isDestroyed: function () { return false },
      executeJavaScript: vi.fn(function () {
        const value = queue.length > 1 ? queue.shift() : (queue[0] || 0)
        return Promise.resolve(value)
      }),
      getZoomFactor: function () { return zoom },
      setZoomFactor: vi.fn(function (z) { zoom = z; calls.setZoom.push(z) }),
    },
  }
  view.calls = calls
  return view
}

describe('login-view-fit 纯计算：computeLoginFitZoom', () => {
  // ── 2026-09-28 Bug 回归数字：1920x1200@125% 屏，非全屏窗口客户区 1267 DIP，
  //    登录视图 = 1267 - 16(边框) - 200(侧边栏) = 1051 DIP；
  //    快手 cp.kuaishou.com 固定内容宽 ≈1335 DIP（像素取证自用户两张截图）。
  //    全屏视图 1336 DIP 恰好容纳 → 用户看到「全屏正常、小窗口显示不全」。
  it('小窗口视图 1051 DIP 装不下 1335 DIP 登录页 → 目标缩放 1051/1335', () => {
    expect(fitModule.computeLoginFitZoom(1051, 1335, 1)).toBeCloseTo(1051 / 1335, 10)
  })

  it('全屏视图 1336 DIP 容纳 1335 DIP → 不缩放', () => {
    expect(fitModule.computeLoginFitZoom(1336, 1335, 1)).toBe(1)
  })

  it('2px 容差内视为容纳，不缩放；超出容差才缩放', () => {
    expect(fitModule.computeLoginFitZoom(1051, 1052, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(1051, 1053, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(1051, 1054, 1)).toBeCloseTo(1051 / 1054, 10)
  })

  it('已缩放后窗口再变窄 → 按新视图宽度继续缩小', () => {
    expect(fitModule.computeLoginFitZoom(900, 1335, 1051 / 1335)).toBeCloseTo(900 / 1335, 10)
  })

  it('窗口放大后页面在当前缩放下已容纳 → 目标恢复为 1', () => {
    expect(fitModule.computeLoginFitZoom(1336, 1336, 1051 / 1335)).toBe(1)
  })

  it('目标缩放低于 0.5 下限时保持当前值（半信纸不可读，宁可不缩）', () => {
    expect(fitModule.computeLoginFitZoom(500, 2000, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(500, 2000, 0.7)).toBe(0.7)
  })

  it('非法输入一律 no-op：返回当前缩放（非法当前缩放按 1 归一）', () => {
    expect(fitModule.computeLoginFitZoom(0, 1335, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(-5, 1335, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(NaN, 1335, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(1051, 0, 1)).toBe(1)
    expect(fitModule.computeLoginFitZoom(1051, -3, 0.6)).toBe(0.6)
    expect(fitModule.computeLoginFitZoom(1051, 1335, 0)).toBeCloseTo(1051 / 1335, 10)
    expect(fitModule.computeLoginFitZoom(1051, 1335, NaN)).toBeCloseTo(1051 / 1335, 10)
  })
})

describe('login-view-fit 应用：fitLoginViewZoom', () => {
  it('溢出页面被缩放到恰好容纳（快手小窗口回归）', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    await fitModule.fitLoginViewZoom(view)
    expect(view.calls.setZoom).toEqual([1051 / 1335])
  })

  it('页面本就容纳时不触碰缩放', async () => {
    const view = createFitView({ width: 1336, scrollWidths: [1335] })
    await fitModule.fitLoginViewZoom(view)
    expect(view.calls.setZoom).toEqual([])
  })

  it('窗口放大后恢复 1；若恢复后仍溢出则单次回缩（有界，不震荡）', async () => {
    // 当前 0.787、视图 1051：viewportCss=1335，页面 1335 已容纳 → 恢复 1；
    // 恢复后 viewportCss=1051，1335 溢出 → 单次回缩到 1051/1335，不再继续。
    const view = createFitView({ width: 1051, zoom: 1051 / 1335, scrollWidths: [1335, 1335] })
    await fitModule.fitLoginViewZoom(view)
    expect(view.calls.setZoom).toEqual([1, 1051 / 1335])
  })

  it('窗口放大且 1 下也容纳 → 只恢复 1 一次', async () => {
    const view = createFitView({ width: 1600, zoom: 1051 / 1335, scrollWidths: [1335, 1335] })
    await fitModule.fitLoginViewZoom(view)
    expect(view.calls.setZoom).toEqual([1])
  })

  it('目标低于下限时不缩放并留下 warn 日志', async () => {
    const warn = vi.fn()
    const view = createFitView({ width: 500, scrollWidths: [2000] })
    await fitModule.fitLoginViewZoom(view, { log: { info: function () {}, warn } })
    expect(view.calls.setZoom).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('并发 fit 以最后一次为准：过期探针不得再改缩放', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    let resolveFirstProbe
    view.webContents.executeJavaScript.mockImplementationOnce(function () {
      return new Promise(function (resolve) { resolveFirstProbe = resolve })
    })
    const first = fitModule.fitLoginViewZoom(view)
    const second = fitModule.fitLoginViewZoom(view)
    await second
    expect(view.calls.setZoom).toEqual([1051 / 1335])

    resolveFirstProbe(9999) // 过期探针晚到：页面超宽，若生效会把缩放打到下限
    await first
    expect(view.calls.setZoom).toEqual([1051 / 1335])
  })

  it('webContents 已销毁 → 静默返回，不发探针', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    view.webContents.isDestroyed = function () { return true }
    await expect(fitModule.fitLoginViewZoom(view)).resolves.toBeUndefined()
    expect(view.webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('探针失败（页面导航中上下文销毁）→ 不抛错不缩放', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    view.webContents.executeJavaScript.mockRejectedValueOnce(new Error('context destroyed'))
    await expect(fitModule.fitLoginViewZoom(view)).resolves.toBeUndefined()
    expect(view.calls.setZoom).toEqual([])
  })

  it('缺 view / 缺 webContents / getBounds 抛错 → 一律静默返回', async () => {
    await expect(fitModule.fitLoginViewZoom(null)).resolves.toBeUndefined()
    await expect(fitModule.fitLoginViewZoom({})).resolves.toBeUndefined()
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    view.getBounds = function () { throw new Error('view destroyed') }
    await expect(fitModule.fitLoginViewZoom(view)).resolves.toBeUndefined()
    expect(view.calls.setZoom).toEqual([])
  })

  it('缩放生效时留下 info 日志（含目标值与页面宽，便于线上归因）', async () => {
    const info = vi.fn()
    const view = createFitView({ width: 1051, scrollWidths: [1335] })
    await fitModule.fitLoginViewZoom(view, { log: { info, warn: function () {} } })
    expect(info).toHaveBeenCalled()
    const message = info.mock.calls.map(function (c) { return c.join(' ') }).join(' ')
    expect(message).toContain('0.78')
    expect(message).toContain('1335')
  })

  it('视图宽度未变化时不尝试恢复（延迟复测不产生 1↔fit 抖动）', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335, 1335] })
    await fitModule.fitLoginViewZoom(view) // → 0.787
    await fitModule.fitLoginViewZoom(view) // 同宽度复测：0.787 下恰好容纳 → 不恢复
    expect(view.calls.setZoom).toEqual([1051 / 1335])
  })

  it('视图宽度变化后才尝试恢复（窗口放大 → 恢复 1 并保持）', async () => {
    const view = createFitView({ width: 1051, scrollWidths: [1335, 1335] })
    await fitModule.fitLoginViewZoom(view) // → 0.787
    view.getBounds = function () { return { x: 200, y: 76, width: 1600, height: 800 } }
    await fitModule.fitLoginViewZoom(view) // 宽度变化 → 恢复 1；复测容纳 → 保持
    expect(view.calls.setZoom).toEqual([1051 / 1335, 1])
  })
})
