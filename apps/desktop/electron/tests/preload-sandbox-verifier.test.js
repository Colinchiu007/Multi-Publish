// @vitest-environment node
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { describe, expect, it, vi } from 'vitest'

const COMPLETE_RESULT = {
  exposed: true,
  getVersion: true,
  publishWechat: true,
  adminHidden: true,
  accessLevel: 'authenticated',
  getVersionResult: { code: 0, data: 'preload-sandbox-test' },
  publishResult: { code: 0, data: { accepted: true } },
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
      ]),
      timeout: 1500,
    }))
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
    const { DEFAULT_VERIFICATION_TIMEOUT_MS, getVerificationTimeout } = require('../../scripts/verify-preload-sandbox')

    expect(getVerificationTimeout({})).toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: '1500' })).toBe(1500)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: 'invalid' }))
      .toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
    expect(getVerificationTimeout({ PRELOAD_SANDBOX_TIMEOUT_MS: '-1' }))
      .toBe(DEFAULT_VERIFICATION_TIMEOUT_MS)
  })
})
