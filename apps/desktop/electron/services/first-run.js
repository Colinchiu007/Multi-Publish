/**
 * 首次运行引导
 *
 * P2-E: 移除了 Playwright 浏览器检查逻辑。RpaViewManager 无需额外浏览器资源。
 */
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const log = require('./logger')

// eslint-disable-next-line no-unused-vars
let _mainWin = null

function isSetupDone () {
  return fs.existsSync(path.join(app.getPath('userData'), 'first-run-done'))
}

function reset () {
  const p = path.join(app.getPath('userData'), 'first-run-done')
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

async function runSetup (mainWin) {
  _mainWin = mainWin

  if (isSetupDone()) {
    mainWin.webContents.send('first-run:status', { type: 'done' })
    return
  }

  try {
    // P2-E: 无需检查浏览器资源，直接标记首次运行完成
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'first-run-done'),
      `done:${new Date().toISOString()}`
    )
    mainWin.webContents.send('first-run:status', { type: 'done' })
    log.info('firstRun', 'Setup complete')
  } catch (/** @type {any} */ e) {
    log.error('firstRun', 'Setup error:', e.message)
    mainWin.webContents.send('first-run:status', { type: 'error', data: e.message })
  }
}

function checkDeps () {
  return { setupDone: isSetupDone() }
}

module.exports = { isSetupDone, runSetup, reset, checkDeps }