#!/usr/bin/env node
// @ts-check
'use strict'
/**
 * film-auto-mode-driver.js — 影视工程「自动」模式的**真机 E2E 驱动**（CDP 直连）
 *
 * 为什么要有这个驱动（而不是只跑单测）：
 *   单测里 `window.electronAPI` 是被注入的假对象，preload bundle、IPC 注册、路由与
 *   Element Plus 的真实渲染都不会被覆盖。真机 E2E 才能回答「用户点下去到底会发生什么」。
 *
 * 两个阶段（默认只跑 Phase 1 —— **零 provider 调用**）：
 *   Phase 1（默认）：三标签 Hub → 自动面板 → preload 通道存在性 → 输入校验 →
 *                    长文剧本规划 → 确认卡逐项核对（镜数/批次/Provider/警告/预估/确认门槛）
 *   Phase 2（`MP_E2E_RUN=1` 显式开启）：勾选确认 → 开始生成（**会真实调用视频模型并产生费用**）
 *                    → 观察进度与逐镜状态 → 可选 `MP_E2E_STOP=1` 验证批间停止
 *
 * 运行前提：应用已以 `--remote-debugging-port=<port>` 启动（`node scripts/dev.js` 或 launcher），
 *           且设置了 `MP_CDP_ALLOW_ALL_ORIGINS=1`。
 *
 * 用法：
 *   node tests/e2e/film-auto-mode-driver.js
 *   MP_E2E_RUN=1 MP_VITE_PORT=5513 MP_CDP_PORT=9561 node tests/e2e/film-auto-mode-driver.js
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败（报告 JSON 里逐条列出）。
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { CdpClient } = require('./lib/cdp-client')

const CDP_PORT = Number(process.env.MP_CDP_PORT || 9561)
const VITE_PORT = Number(process.env.MP_VITE_PORT || 5513)
const VITE_ORIGIN = process.env.MP_VITE_ORIGIN || ('http://127.0.0.1:' + VITE_PORT)
const OUT_DIR = process.env.MP_E2E_OUT || path.join(os.tmpdir(), 'film-auto-e2e')
const SCRIPT_FILE = process.env.MP_E2E_SCRIPT || path.join(__dirname, 'fixtures', 'film-auto-long-script.txt')
const RUN_GENERATION = process.env.MP_E2E_RUN === '1'
const ALSO_STOP = process.env.MP_E2E_STOP === '1'
const TARGET_DURATION_SEC = Number(process.env.MP_E2E_DURATION || 60)

const steps = []
function record (name, ok, detail) {
  const entry = { name, ok: Boolean(ok), detail: detail === undefined ? null : detail }
  steps.push(entry)
  console.log((entry.ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 400)))
  return entry
}

function ev (exp) { return `(function(){ ${exp} })()` }

async function main () {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const script = fs.readFileSync(SCRIPT_FILE, 'utf8')
  const report = { cdpPort: CDP_PORT, viteOrigin: VITE_ORIGIN, runGeneration: RUN_GENERATION, scriptChars: script.length, steps, ok: false }

  const cdp = await CdpClient.attach(CDP_PORT, VITE_ORIGIN, { retries: 20, backoffMs: 3000 })
  console.log('[e2e] attached to CDP ' + CDP_PORT + ' @ ' + VITE_ORIGIN)
  try {
    // ── 0. 先重载页面：面板会从 localStorage 恢复上次任务（这是设计行为），
    //        不重载就会带着上一轮的状态做「空剧本按钮禁用」这类断言 —— 属测试假象，非产品缺陷。
    if (process.env.MP_E2E_NO_RELOAD !== '1') {
      await cdp.evaluate(`location.hash = '#/film-engineering'; location.reload(); true`).catch(() => {})
      await new Promise((r) => setTimeout(r, 3000))
      await cdp.waitFor(`!!document.querySelector('[data-testid="film-hub"]')`, { label: 'after-reload', timeout: 60000 })
      record('page-reloaded-fresh', true)
    }

    // ── 1. 三标签 Hub ────────────────────────────────────────────────────
    await cdp.evaluate(`location.hash = '#/film-engineering'; true`)
    await cdp.waitFor(`!!document.querySelector('[data-testid="film-hub"]')`, { label: 'film-hub', timeout: 60000 })
    record('hub-mounted', true)

    const tabs = JSON.parse(await cdp.evaluate(ev(`
      return JSON.stringify(Array.from(document.querySelectorAll('[data-testid^="fh-tab-"]')).map(function (e) {
        return { id: e.getAttribute('data-testid'), selected: e.getAttribute('aria-selected'), text: (e.textContent || '').trim(), role: e.getAttribute('role') }
      }))
    `)))
    record('three-tabs-present', tabs.length === 3 && tabs.every((t) => t.role === 'tab'), tabs)
    record('default-tab-is-auto', tabs[0] && tabs[0].id === 'fh-tab-auto' && tabs[0].selected === 'true', tabs[0])
    record('auto-panel-mounted', await cdp.evaluate(ev(`return !!document.querySelector('[data-testid="film-auto-panel"]')`)))

    // 切到画布 / 工程案例再切回：验证懒挂载与内嵌（embedded）都不炸
    await cdp.evaluate(ev(`document.querySelector('[data-testid="fh-tab-canvas"]').click(); return true`))
    await cdp.waitFor(`!!document.querySelector('[data-testid="fh-panel-canvas"]')`, { label: 'canvas-panel', timeout: 30000 })
    record('canvas-tab-switch', true)
    await cdp.evaluate(ev(`document.querySelector('[data-testid="fh-tab-classic"]').click(); return true`))
    await cdp.waitFor(`!!document.querySelector('[data-testid="fh-panel-classic"]')`, { label: 'classic-panel', timeout: 30000 })
    record('classic-tab-switch', true)
    await cdp.evaluate(ev(`document.querySelector('[data-testid="fh-tab-auto"]').click(); return true`))
    await cdp.waitFor(`!!document.querySelector('[data-testid="film-auto-panel"]')`, { label: 'auto-back', timeout: 30000 })
    record('back-to-auto', true)

    // ── 2. preload 通道面（真实 bundle，不是测试假对象）──────────────────
    const api = JSON.parse(await cdp.evaluate(ev(`
      var fe = window.electronAPI && window.electronAPI.filmEngineering
      if (!fe) return JSON.stringify({ missing: 'filmEngineering' })
      var want = ['autoPlan','autoStart','autoStop','autoStatus','autoUpdateShot','autoRegenerateShot','autoCompose','onAutoUpdate']
      var missing = want.filter(function (k) { return typeof fe[k] !== 'function' })
      return JSON.stringify({ missing: missing, total: Object.keys(fe).length })
    `)))
    record('preload-auto-methods', Array.isArray(api.missing) && api.missing.length === 0, api)

    // ── 3. 输入校验（零调用路径）─────────────────────────────────────────
    const emptyState = JSON.parse(await cdp.evaluate(ev(`
      var btn = document.querySelector('[data-testid="fa-plan"]')
      return JSON.stringify({ planDisabled: btn ? btn.disabled : null })
    `)))
    record('plan-disabled-on-empty-script', emptyState.planDisabled === true, emptyState)

    // ── 4. 长文剧本规划（auto-plan 不调用 provider，零费用）─────────────
    await cdp.evaluate(ev(`
      var ta = document.querySelector('[data-testid="fa-script"] textarea') || document.querySelector('[data-testid="fa-script"]')
      if (!ta) return false
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, ${JSON.stringify(script)})
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    `))
    await cdp.evaluate(ev(`
      var inp = document.querySelector('[data-testid="fa-duration"] input') || document.querySelector('[data-testid="fa-duration"]')
      if (inp) {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(inp, '${TARGET_DURATION_SEC}')
        inp.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return true
    `))
    await cdp.waitFor(`!document.querySelector('[data-testid="fa-plan"]').disabled`, { label: 'plan-enabled', timeout: 20000 })
    record('script-filled-plan-enabled', true)

    await cdp.evaluate(ev(`document.querySelector('[data-testid="fa-plan"]').click(); return true`))
    await cdp.waitFor(
      `!!document.querySelector('[data-testid="fa-preview"]') || !!document.querySelector('[data-testid="fa-error"]')`,
      { label: 'plan-result', timeout: 120000 },
    )
    const planOutcome = JSON.parse(await cdp.evaluate(ev(`
      var err = document.querySelector('[data-testid="fa-error"]')
      var prev = document.querySelector('[data-testid="fa-preview"]')
      var kv = {}
      ;['fa-kv-task','fa-kv-shots','fa-kv-disk','fa-kv-wallclock'].forEach(function (id) {
        var el = document.querySelector('[data-testid="' + id + '"]')
        kv[id] = el ? (el.textContent || '').trim() : null
      })
      var warnNodes = Array.from(document.querySelectorAll('[data-testid^="fa-warning-"]')).map(function (e) { return e.getAttribute('data-testid') + '=' + (e.textContent || '').trim().slice(0, 60) })
      var startBtn = document.querySelector('[data-testid="fa-start"]')
      var chk = document.querySelector('[data-testid="fa-confirm-check"]')
      return JSON.stringify({
        hasPreview: !!prev, error: err ? (err.textContent || '').trim() : null,
        kv: kv, warnings: warnNodes,
        startDisabledBeforeConfirm: startBtn ? startBtn.disabled : null,
        hasConfirmCheckbox: !!chk,
      })
    `)))
    record('plan-outcome-observed', planOutcome.hasPreview || Boolean(planOutcome.error), planOutcome)

    if (planOutcome.hasPreview) {
      record('preview-shows-shot-count', planOutcome.kv['fa-kv-shots'] !== null && Number(planOutcome.kv['fa-kv-shots']) > 0, planOutcome.kv)
      record('preview-shows-disk-estimate', Boolean(planOutcome.kv['fa-kv-disk']), planOutcome.kv['fa-kv-disk'])
      record('preview-shows-wallclock-estimate', Boolean(planOutcome.kv['fa-kv-wallclock']), planOutcome.kv['fa-kv-wallclock'])
      record('confirm-gates-start', planOutcome.hasConfirmCheckbox === true && planOutcome.startDisabledBeforeConfirm === true, { checkbox: planOutcome.hasConfirmCheckbox, disabled: planOutcome.startDisabledBeforeConfirm })

      // 勾选后开始按钮必须可点（仍未开始）
      await cdp.evaluate(ev(`document.querySelector('[data-testid="fa-confirm-check"]').click(); return true`))
      await cdp.waitFor(`!document.querySelector('[data-testid="fa-start"]').disabled`, { label: 'start-enabled', timeout: 15000 })
      record('start-enabled-after-confirm', true)
    }

    // ── 5. Phase 2（显式开启才真实出片）─────────────────────────────────
    if (RUN_GENERATION && planOutcome.hasPreview) {
      await cdp.evaluate(ev(`document.querySelector('[data-testid="fa-start"]').click(); return true`))
      await cdp.waitFor(`!!document.querySelector('[data-testid="fa-run"]')`, { label: 'run-section', timeout: 60000 })
      record('generation-started', true)
      const running = JSON.parse(await cdp.evaluate(ev(`
        var stopBtn = document.querySelector('[data-testid="fa-stop"]')
        var rows = document.querySelectorAll('[data-testid="fa-shots"] tbody tr').length
        return JSON.stringify({ hasStopButton: !!stopBtn, shotRows: rows, summary: (document.querySelector('[data-testid="fa-run"]') || {}).textContent ? document.querySelector('[data-testid="fa-run"]').textContent.trim().slice(0, 120) : null })
      `)))
      record('run-section-has-stop-and-shots', Boolean(running.hasStopButton), running)

      const waitMs = Number(process.env.MP_E2E_WAIT_MS || 0)
      if (waitMs > 0) {
        const startedAt = Date.now()
        let last = null
        while (Date.now() - startedAt < waitMs) {
          last = JSON.parse(await cdp.evaluate(ev(`
            var rows = Array.from(document.querySelectorAll('[data-testid="fa-shots"] tbody tr')).map(function (tr) {
              return { id: tr.getAttribute('data-testid') || '', status: ((tr.children[1] || {}).textContent || '').trim(), error: ((tr.children[2] || {}).textContent || '').trim().slice(0, 80) }
            })
            return JSON.stringify({ rows: rows })
          `)))
          const settled = last.rows.filter((r) => /已完成|失败/.test(r.status)).length
          console.log('[e2e] progress ' + settled + '/' + last.rows.length + ' :: ' + JSON.stringify(last.rows.slice(0, 4)))
          if (last.rows.length > 0 && last.rows.every((r) => /已完成|失败/.test(r.status))) break
          await new Promise((r) => setTimeout(r, 15000))
        }
        const converged = Boolean(last && last.rows.length > 0 && last.rows.every((r) => /已完成|失败/.test(r.status)))
        record('generation-converged', converged, last)
        const taskId = planOutcome.kv['fa-kv-task']
        const compose = JSON.parse(await cdp.evaluate(`
          (async function () {
            var res = await window.electronAPI.filmEngineering.autoCompose({ taskId: ${JSON.stringify('__TASK__')} })
            return JSON.stringify({ code: res.code, errorCode: res.errorCode || null, clips: res.data && res.data.renderManifest ? res.data.renderManifest.length : null, message: res.message || null })
          })()
        `.replace('__TASK__', String(taskId))))
        record('compose-manifest-check', compose.code === 0 || compose.errorCode === 'AUTO_MANIFEST_INCOMPLETE', compose)
      }

      if (ALSO_STOP) {
        await cdp.evaluate(ev(`document.querySelector('[data-testid="fa-stop"]').click(); return true`))
        await cdp.waitFor(`!!document.querySelector('[data-testid="fa-stopping-hint"]')`, { label: 'stopping-hint', timeout: 30000 })
        record('stop-requested-shows-hint', true)
      }
    } else {
      record('generation-skipped', true, RUN_GENERATION ? 'no preview' : 'MP_E2E_RUN!=1（默认零费用路径）')
    }

    // ── 6. 截图留证 ─────────────────────────────────────────────────────
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const file = path.join(OUT_DIR, 'film-auto-' + (planOutcome.hasPreview ? 'preview' : 'error') + '.png')
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
      record('screenshot-saved', true, file)
    } catch (e) {
      record('screenshot-saved', false, (e && e.message) || String(e))
    }

    report.ok = steps.every((s) => s.ok)
  } catch (e) {
    record('driver-exception', false, (e && e.message) || String(e))
    report.ok = false
  } finally {
    try { cdp.close() } catch { /* 忽略 */ }
  }

  const reportFile = path.join(OUT_DIR, 'film-auto-e2e-report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8')
  console.log('\n[e2e] report: ' + reportFile)
  console.log('[e2e] result: ' + (report.ok ? 'PASS' : 'FAIL') + ' (' + steps.filter((s) => s.ok).length + '/' + steps.length + ')')
  process.exit(report.ok ? 0 : 1)
}

main().catch((e) => {
  console.error('[e2e] fatal: ' + ((e && e.stack) || String(e)))
  process.exit(1)
})
