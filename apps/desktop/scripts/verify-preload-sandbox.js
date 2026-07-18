'use strict'

const { spawn } = require('child_process')
const path = require('path')

const DEFAULT_VERIFICATION_TIMEOUT_MS = 30000
const PLAYWRIGHT_WORKER_ARG = '--playwright-worker'
const ELECTRON_HARNESS_ARG = path.join(__dirname, 'preload-sandbox-electron-harness.js')
const SUCCESS_MARKER = 'PRELOAD_SANDBOX_BOTH_MODES_OK'
const MODE_SUCCESS_MARKERS = {
  true: 'PRELOAD_SANDBOX_TRUE_OK',
  false: 'PRELOAD_SANDBOX_FALSE_OK',
}

function getVerificationTimeout(env = process.env) {
  const configured = Number.parseInt(env.PRELOAD_SANDBOX_TIMEOUT_MS, 10)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_VERIFICATION_TIMEOUT_MS
}

function assertApi(result, sandbox) {
  if (!result || !result.exposed || !result.getVersion ||
      !result.publishWechat || !result.adminHidden) {
    throw new Error(`sandbox=${sandbox} 时 window.electronAPI 暴露不完整`)
  }
  if (!result.getVersionResult || result.getVersionResult.code !== 0 ||
      !result.publishResult || result.publishResult.code !== 0) {
    throw new Error(`sandbox=${sandbox} 时真实 IPC 调用失败`)
  }
  if (result.accessLevel !== 'authenticated') {
    throw new Error(`sandbox=${sandbox} 时访问级别异常：${result.accessLevel}`)
  }
}

async function verifyMode({
  electronLauncher,
  executablePath,
  sandbox,
  timeoutMs,
  env,
}) {
  let electronApp
  try {
    electronApp = await electronLauncher.launch({
      executablePath,
      args: [ELECTRON_HARNESS_ARG, `--preload-sandbox-mode=${sandbox}`],
      env,
      timeout: timeoutMs,
    })
    const page = await electronApp.firstWindow({ timeout: timeoutMs })
    await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs })
    const result = await page.evaluate(async () => {
      const api = window.electronAPI
      return {
        exposed: typeof api === 'object' && api !== null,
        getVersion: typeof api?.getVersion === 'function',
        publishWechat: typeof api?.publishWechat === 'function',
        adminHidden: typeof api?.paymentComplete === 'undefined',
        accessLevel: api?.getAccessLevel?.(),
        getVersionResult: await api?.getVersion?.(),
        publishResult: await api?.publishWechat?.({ title: 'sandbox-smoke' }),
      }
    })
    assertApi(result, sandbox)
    return result
  } finally {
    if (electronApp) await electronApp.close()
  }
}

async function runPlaywrightVerification({
  electronLauncher,
  executablePath,
  timeoutMs,
  env,
  output = (message) => process.stdout.write(message),
} = {}) {
  const launcher = electronLauncher || require('playwright')._electron
  const electronPath = executablePath || require('electron')
  const effectiveTimeout = timeoutMs || getVerificationTimeout(env)
  const effectiveEnv = env || process.env

  for (const sandbox of [true, false]) {
    await verifyMode({
      electronLauncher: launcher,
      executablePath: electronPath,
      sandbox,
      timeoutMs: effectiveTimeout,
      env: effectiveEnv,
    })
    output(MODE_SUCCESS_MARKERS[String(sandbox)] + '\n')
  }
  output(SUCCESS_MARKER + '\n')
}

function evaluateVerificationResult({ code, stdout, stderr }) {
  if (code !== 0) {
    throw new Error(`preload sandbox 工作进程退出码为 ${code}：${stderr}`)
  }
  const missingMode = Object.values(MODE_SUCCESS_MARKERS)
    .find((marker) => !stdout.includes(marker))
  if (missingMode) throw new Error(`缺少模式成功标记：${missingMode}`)
  if (!stdout.includes(SUCCESS_MARKER)) throw new Error('缺少总成功标记')
}

function runChildVerification(spawnImpl = spawn, env = process.env) {
  return new Promise((resolve, reject) => {
    const timeoutMs = getVerificationTimeout(env)
    const child = spawnImpl(process.execPath, [__filename, PLAYWRIGHT_WORKER_ARG], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      try {
        if (timedOut) throw new Error(`preload sandbox 验证超过 ${timeoutMs}ms`)
        evaluateVerificationResult({ code, stdout, stderr })
        process.stdout.write(stdout)
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  })
}

function failVerification(error) {
  console.error('preload sandbox 双模式验证失败：', error)
  process.exitCode = 1
}

if (require.main === module) {
  const verification = process.argv.includes(PLAYWRIGHT_WORKER_ARG)
    ? runPlaywrightVerification()
    : runChildVerification()
  verification.catch(failVerification)
}

module.exports = {
  DEFAULT_VERIFICATION_TIMEOUT_MS,
  ELECTRON_HARNESS_ARG,
  MODE_SUCCESS_MARKERS,
  PLAYWRIGHT_WORKER_ARG,
  SUCCESS_MARKER,
  assertApi,
  evaluateVerificationResult,
  getVerificationTimeout,
  runChildVerification,
  runPlaywrightVerification,
  verifyMode,
}
