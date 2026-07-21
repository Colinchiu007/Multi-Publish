// @vitest-environment node
import { EventEmitter } from 'events'
import { existsSync } from 'fs'
import { PassThrough } from 'stream'
import fs from 'fs'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

const COMPLETE_RESULT = {
  exposed: true,
  getVersion: true,
  publishWechat: true,
  identityGetState: true,
  identitySwitchAccount: true,
  adminHidden: true,
  accessLevel: 'authenticated',
  getVersionResult: { code: 0, data: 'preload-sandbox-test' },
  publishResult: { code: 0, data: { accepted: true } },
  identityStateResult: {
    code: 0,
    data: { status: 'disabled', user: null, error: null },
  },
  identityStateJson: JSON.stringify({
    code: 0,
    data: { status: 'disabled', user: null, error: null },
  }),
  identitySwitchResult: { code: -3, message: 'IDENTITY_NOT_CONFIGURED' },
  identitySwitchJson: JSON.stringify({ code: -3, message: 'IDENTITY_NOT_CONFIGURED' }),
}

function createElectronApplication(result = COMPLETE_RESULT) {
  const page = {
    waitForLoadState: vi.fn(async () => {}),
    evaluate: vi.fn(async () => result),
  }
  return {
    app: {
      firstWindow: vi.fn(async () => page),
      close: vi.fn(async () => {}),
    },
    page,
  }
}

describe('preload sandbox 真实验证器', () => {
  it('API 方法、真实 IPC 返回值和权限边界都正确时通过', () => {
    const { assertApi } = require('../../scripts/verify-preload-sandbox')

    expect(() => assertApi(COMPLETE_RESULT, true)).not.toThrow()
    expect(() => assertApi({ ...COMPLETE_RESULT, publishWechat: false }, false))
      .toThrow(/暴露不完整/)
    expect(() => assertApi({ ...COMPLETE_RESULT, getVersionResult: { code: -1 } }, true))
      .toThrow(/IPC 调用失败/)
    expect(() => assertApi({ ...COMPLETE_RESULT, adminHidden: false }, false))
      .toThrow(/暴露不完整/)
    expect(() => assertApi({ ...COMPLETE_RESULT, identityGetState: false }, true))
      .toThrow(/身份 IPC 暴露不完整/)
    expect(() => assertApi({ ...COMPLETE_RESULT, identitySwitchAccount: false }, true))
      .toThrow(/身份 IPC 暴露不完整/)
    expect(() => assertApi({
      ...COMPLETE_RESULT,
      identityStateResult: { code: 0, data: { status: 'signed_out' } },
    }, true)).toThrow(/身份 IPC 返回异常/)
    expect(() => assertApi({ ...COMPLETE_RESULT, identityStateJson: '{invalid' }, true))
      .toThrow(/身份 IPC 返回值不是纯 JSON/)
    expect(() => assertApi({ ...COMPLETE_RESULT, identitySwitchJson: '{invalid' }, true))
      .toThrow(/身份 IPC 返回值不是纯 JSON/)
  })

  it.each([true, false])('通过 Playwright 启动 sandbox=%s 的真实 Electron', async (sandbox) => {
    const { verifyMode, ELECTRON_HARNESS_ARG } = require('../../scripts/verify-preload-sandbox')
    const { app, page } = createElectronApplication()
    const electronLauncher = { launch: vi.fn(async () => app) }

    await expect(verifyMode({
      electronLauncher,
      executablePath: 'electron.exe',
      sandbox,
      timeoutMs: 1500,
      env: { PATH: 'test-path' },
    })).resolves.toEqual(COMPLETE_RESULT)

    expect(electronLauncher.launch).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: 'electron.exe',
      args: expect.arrayContaining([
        ELECTRON_HARNESS_ARG,
        `--preload-sandbox-mode=${sandbox}`,
        '--disable-gpu',
        expect.stringMatching(/^--user-data-dir=/),
      ]),
      timeout: 1500,
    }))
    const launchArgs = electronLauncher.launch.mock.calls[0][0].args
    const profileArgument = launchArgs.find((argument) => {
      return argument.startsWith('--preload-sandbox-user-data-dir=')
    })
    expect(profileArgument).toBeTruthy()
    expect(existsSync(profileArgument.split('=').slice(1).join('='))).toBe(false)
    expect(page.evaluate).toHaveBeenCalledTimes(1)
    expect(app.close).toHaveBeenCalledTimes(1)
  })

  it('验证失败时也关闭 Electron，避免门禁挂死', async () => {
    const { verifyMode } = require('../../scripts/verify-preload-sandbox')
    const { app } = createElectronApplication({ ...COMPLETE_RESULT, exposed: false })

    await expect(verifyMode({
      electronLauncher: { launch: vi.fn(async () => app) },
      executablePath: 'electron.exe',
      sandbox: true,
      timeoutMs: 1500,
      env: {},
    })).rejects.toThrow(/暴露不完整/)
    expect(app.close).toHaveBeenCalledTimes(1)
  })

  it('Playwright 工作进程必须完成两个模式后才输出总成功标记', async () => {
    const {
      MODE_SUCCESS_MARKERS,
      SUCCESS_MARKER,
      runPlaywrightVerification,
    } = require('../../scripts/verify-preload-sandbox')
    const { app } = createElectronApplication()
    const output = vi.fn()

    await runPlaywrightVerification({
      electronLauncher: { launch: vi.fn(async () => app) },
      executablePath: 'electron.exe',
      timeoutMs: 1500,
      env: {},
      output,
    })

    const combined = output.mock.calls.map(([message]) => message).join('')
    expect(combined).toContain(MODE_SUCCESS_MARKERS.true)
    expect(combined).toContain(MODE_SUCCESS_MARKERS.false)
    expect(combined).toContain(SUCCESS_MARKER)
  })

  it('Electron harness 在 app.ready 前隔离可写目录并关闭硬件加速', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/preload-sandbox-electron-harness.js'),
      'utf8',
    )
    const setUserDataAt = source.indexOf("app.setPath('userData'")
    const setCacheAt = source.indexOf("app.setPath('cache'")
    const whenReadyAt = source.indexOf('app.whenReady()')

    expect(setUserDataAt).toBeGreaterThan(-1)
    expect(setCacheAt).toBeGreaterThan(-1)
    expect(source).toContain('app.disableHardwareAcceleration()')
    expect(setUserDataAt).toBeLessThan(whenReadyAt)
    expect(setCacheAt).toBeLessThan(whenReadyAt)
  })

  it('Electron harness 使用内联页面，避免临时 HTTP 导航导致窗口提前关闭', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../scripts/preload-sandbox-electron-harness.js'),
      'utf8',
    )

    expect(source).not.toContain("require('http')")
    expect(source).not.toContain('http.createServer')
    expect(source).toContain('data:text/html')
  })

  it('外层门禁同时校验退出码、两个模式标记和总成功标记', () => {
    const {
      MODE_SUCCESS_MARKERS,
      SUCCESS_MARKER,
      evaluateVerificationResult,
    } = require('../../scripts/verify-preload-sandbox')
    const completeStdout = [
      MODE_SUCCESS_MARKERS.true,
      MODE_SUCCESS_MARKERS.false,
      SUCCESS_MARKER,
    ].join('\n')

    expect(() => evaluateVerificationResult({ code: 0, stdout: completeStdout, stderr: '' }))
      .not.toThrow()
    expect(() => evaluateVerificationResult({ code: 0, stdout: SUCCESS_MARKER, stderr: '' }))
      .toThrow(/模式成功标记/)
    expect(() => evaluateVerificationResult({ code: 1, stdout: completeStdout, stderr: '失败' }))
      .toThrow(/退出码/)
  })

  it('父门禁使用 Node 工作进程并传递可配置超时', async () => {
    const {
      MODE_SUCCESS_MARKERS,
      PLAYWRIGHT_WORKER_ARG,
      SUCCESS_MARKER,
      runChildVerification,
    } = require('../../scripts/verify-preload-sandbox')
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = vi.fn()
    const spawnImpl = vi.fn(() => child)
    const verification = runChildVerification(spawnImpl, {
      PRELOAD_SANDBOX_TIMEOUT_MS: '1500',
    })

    child.stdout.write([
      MODE_SUCCESS_MARKERS.true,
      MODE_SUCCESS_MARKERS.false,
      SUCCESS_MARKER,
    ].join('\n'))
    child.stdout.end()
    child.stderr.end()
    child.emit('close', 0)

    await expect(verification).resolves.toBeUndefined()
    expect(spawnImpl).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([PLAYWRIGHT_WORKER_ARG]),
      expect.objectContaining({ env: expect.objectContaining({ PRELOAD_SANDBOX_TIMEOUT_MS: '1500' }) }),
    )
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('超时可配置且非法值回退到安全默认值', () => {
    const {
      DEFAULT_VERIFICATION_TIMEOUT_MS,
      getChildVerificationTimeout,
      getVerificationTimeout,
    } = require('../../scripts/verify-preload-sandbox')

    expect(getVerificationTimeout({})).toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: '1500' })).toBe(1500)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: 'invalid' }))
      .toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: '-1' }))
      .toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
    expect(getChildVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: '1500' }))
      .toBeGreaterThan(3000)
  })

  it('Electron 子进程超时时保留 stderr，便于定位渲染器启动失败', async () => {
    const { runChildVerification } = require('../../scripts/verify-preload-sandbox')
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = vi.fn()
    const spawnImpl = vi.fn(() => child)

    vi.useFakeTimers()
    try {
      const verification = runChildVerification(spawnImpl, {
        PRELOAD_SANDBOX_TIMEOUT_MS: '20',
      })
      child.stderr.write('GPU process fatal')
      await vi.advanceTimersByTimeAsync(25)
      child.emit('close', null)

      await expect(verification).rejects.toThrow(/GPU process fatal/)
      expect(child.kill).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
