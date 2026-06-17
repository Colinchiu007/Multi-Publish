/**
 * 首次运行引导
 * Playwright 浏览器已打包在 resources/playwright-browsers 中，无需安装
 */
const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const log = require('./logger')

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
    mainWin.webContents.send('first-run:status', {
      type: 'step', step: 'playwright', message: '检查 Playwright 浏览器...'
    })

    const browsersPath = app.isPackaged
      ? path.join(process.resourcesPath, 'playwright-browsers')
      : path.join(__dirname, '..', '.playwright-browsers')
    log.info('firstRun', 'Browsers path:', browsersPath)
    log.info('firstRun', 'Exists:', fs.existsSync(browsersPath))

    fs.writeFileSync(
      path.join(app.getPath('userData'), 'first-run-done'),
      `done:${new Date().toISOString()}`
    )
    mainWin.webContents.send('first-run:status', { type: 'done' })
    log.info('firstRun', 'Setup complete')
  } catch (e) {
    log.error('firstRun', 'Setup error:', e.message)
    mainWin.webContents.send('first-run:status', { type: 'error', data: e.message })
  }
}

function checkDeps () {
  return { setupDone: isSetupDone() }
}

module.exports = { isSetupDone, runSetup, reset, checkDeps }