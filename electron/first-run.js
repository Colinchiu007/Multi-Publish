/**
 * 首次运行引导
 * 自动安装 Python 依赖 + Playwright 浏览器
 */
const { execSync } = require('child_process')
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

let _mainWin = null

/**
 * 检查首次运行
 * @returns {boolean} true=已完成首次引导
 */
function isSetupDone () {
  const markerPath = path.join(app.getPath('userData'), 'first-run-done')
  return fs.existsSync(markerPath)
}

/**
 * 重置首次运行标记（用于调试）
 */
function reset () {
  const markerPath = path.join(app.getPath('userData'), 'first-run-done')
  if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath)
}

/**
 * 运行首次引导
 * @param {BrowserWindow} mainWin
 */
async function runSetup (mainWin) {
  _mainWin = mainWin

  if (isSetupDone()) {
    mainWin.webContents.send('first-run:status', { type: 'done' })
    return
  }

  const pythonDir = path.join(__dirname, '..', 'python')
  const pipCmd = process.platform === 'win32' ? 'pip' : 'pip3'

  try {
    // Python 依赖
    mainWin.webContents.send('first-run:status', { type: 'step', step: 'python', message: '正在安装 Python 依赖...' })
    execSync(`${pipCmd} install -r "${pythonDir}/requirements-runtime.txt"`, {
      stdio: 'inherit',
      windowsHide: true
    })

    // Playwright 浏览器
    mainWin.webContents.send('first-run:status', { type: 'step', step: 'playwright', message: '正在安装 Playwright 浏览器...' })
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      windowsHide: true,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    })

    // 标记完成
    const markerPath = path.join(app.getPath('userData'), 'first-run-done')
    fs.writeFileSync(markerPath, `done:${new Date().toISOString()}`)

    mainWin.webContents.send('first-run:status', { type: 'done' })
    console.log('[firstRun] Setup complete')
  } catch (e) {
    console.error('[firstRun] Setup error:', e.message)
    mainWin.webContents.send('first-run:status', { type: 'error', data: e.message })
  }
}

/**
 * 检查依赖是否已安装（不执行安装）
 * @returns {{ python: boolean, playwright: boolean }}
 */
function checkDeps () {
  const pythonDir = path.join(__dirname, '..', 'python')
  const reqFile = path.join(pythonDir, 'requirements-runtime.txt')
  const markerPath = path.join(app.getPath('userData'), 'first-run-done')
  return {
    setupDone: fs.existsSync(markerPath),
    reqFileExists: fs.existsSync(reqFile)
  }
}

module.exports = { isSetupDone, runSetup, reset, checkDeps }