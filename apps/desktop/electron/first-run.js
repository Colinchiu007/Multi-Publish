/**
 * 首次运行引导
 * 自动安装 Playwright 浏览器
 */
const { spawnSync } = require('child_process')
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

/**
 * 找到 asar 内的 playwright 可执行文件路径
 */
function getPlaywrightExe () {
  // 在 asar 内 playwright 位于 app.asar/node_modules/.bin/playwright.cmd
  const asarDir = path.join(process.resourcesDir, 'app.asar')
  const isAsar = fs.existsSync(asarDir)
  if (isAsar) {
    return path.join(asarDir, 'node_modules', '.bin', 'playwright.cmd')
  }
  // 开发模式
  return path.join(__dirname, '..', 'node_modules', '.bin', 'playwright.cmd')
}

async function runSetup (mainWin) {
  _mainWin = mainWin

  if (isSetupDone()) {
    mainWin.webContents.send('first-run:status', { type: 'done' })
    return
  }

  try {
    mainWin.webContents.send('first-run:status', {
      type: 'step', step: 'playwright', message: '正在安装 Playwright 浏览器...'
    })

    const pwExe = getPlaywrightExe()
    log.info('firstRun', 'Playwright exe:', pwExe)
    log.info('firstRun', 'Exists:', fs.existsSync(pwExe))

    spawnSync(pwExe, ['install', 'chromium'], {
      stdio: 'inherit',
      windowsHide: true,
      cwd: path.dirname(pwExe)
    })

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