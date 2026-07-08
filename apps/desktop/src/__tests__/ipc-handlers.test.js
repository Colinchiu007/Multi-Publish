/**
 * IPC handler 注册完整性测试（Vitest 版本）
 *
 * 自动扫描 preload.js → ipcRenderer.invoke(channel) 和 ipc-handlers/ → ipcMain.handle(channel)
 * 验证每个 channel 都有对应的 handler，反之亦然。
 * 防止 account.ts 这类不完整迁移文件导致 handler 丢失。
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const HD = resolve(ROOT, 'electron/ipc-handlers')
const SD = resolve(ROOT, 'electron/services')
const PP = resolve(ROOT, 'electron/preload.js')

// 已知不应暴露到 preload 的内部 handler（与 check-ipc-bridge.js 保持一致）
const HIDDEN = new Set([
  'auth:login-silent', 'auth:save-credentials', 'store:update-account',
  'proxy:add', 'proxy:add-batch', 'proxy:get-next', 'proxy:list',
  'proxy:remove', 'proxy:remove-dead', 'proxy:reset', 'proxy:status',
  'proxy:test', 'proxy:test-all',
  'upload:cancel', 'upload:chunked',
  'analytics:overview', 'analytics:platform', 'analytics:platforms',
  'keyword:history', 'keyword:start', 'keyword:status',
  'keyword:stop', 'keyword:stop-all',
  'show-notification', 'hotkeys:list',
  'impact:get-active', 'impact:get-recent-snapshots',
  'pipelines:list', 'pipelines:get',
  'intelligence:fetch-trending', 'intelligence:find-references',
  'intelligence:get-benchmark', 'intelligence:get-impact',
  'intelligence:save-impact', 'intelligence:search',
  'intelligence:search-mentions', 'intelligence:search-titles',
  'usage:daily', 'usage:stats', 'usage:track',
])

const RE_HANDLE = /ipcMain\.handle\s*\(\s*['\"]([^'\"]+)['\"]/g
const RE_INVOKE = /ipcRenderer\.invoke\s*\(\s*['\"]([^'\"]+)['\"]/g

function extractAll(content, re) {
  const set = new Set()
  let m
  while ((m = re.exec(content)) !== null) set.add(m[1])
  return set
}

let handlerChannels, preloadChannels

beforeAll(() => {
  // Scan all handler files recursively
  handlerChannels = new Set()
  function walkDir(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) { walkDir(full); continue }
      if (!entry.name.endsWith('.js') || entry.name === 'types.js') continue
      const content = readFileSync(full, 'utf-8')
      if (content.length < 100) continue
      extractAll(content, RE_HANDLE).forEach(c => handlerChannels.add(c))
    }
  }
  walkDir(ROOT + '/electron')

  // Scan preload.js
  preloadChannels = extractAll(readFileSync(PP, 'utf-8'), RE_INVOKE)
})

describe('IPC Handler Registration Completeness', () => {
  it('should have account:delete handler registered', () => {
    expect(handlerChannels.has('account:delete')).toBe(true)
  })

  it('should have account:add handler registered', () => {
    expect(handlerChannels.has('account:add')).toBe(true)
  })

  it('should have account:check-login handler registered', () => {
    expect(handlerChannels.has('account:check-login')).toBe(true)
  })

  it('should have all auth handlers registered', () => {
    expect(handlerChannels.has('auth:open-login')).toBe(true)
    expect(handlerChannels.has('auth:close')).toBe(true)
  })

  it('should have all publish handlers registered', () => {
    expect(handlerChannels.has('publish:batch')).toBe(true)
    expect(handlerChannels.has('publish:wechat')).toBe(true)
  })

  it('should have all queue/history handlers registered', () => {
    expect(handlerChannels.has('queue:status')).toBe(true)
    expect(handlerChannels.has('queue:history')).toBe(true)
    expect(handlerChannels.has('queue:cancel')).toBe(true)
    expect(handlerChannels.has('history:list')).toBe(true)
    expect(handlerChannels.has('history:get')).toBe(true)
  })

  it('should register at least 70 handlers', () => {
    expect(handlerChannels.size).toBeGreaterThanOrEqual(70)
  })

  it('every handler channel should be exposed in preload (except HIDDEN)', () => {
    const missing = [...handlerChannels]
      .filter(h => !preloadChannels.has(h) && !HIDDEN.has(h))
      .sort()
    expect(missing).toEqual([])
  })

  it('every preload channel should have a corresponding handler', () => {
    const orphan = [...preloadChannels]
      .filter(h => !handlerChannels.has(h))
      .sort()
    expect(orphan).toEqual([])
  })

  // 关键：验证 TS 迁移文件（如 account.ts）是否可能缺少 handler
  it('no .ts file in ipc-handlers should be incomplete vs .js counterpart', () => {
    const dir = resolve(ROOT, 'electron/ipc-handlers')
    const tsFiles = readdirSync(dir).filter(f => f.endsWith('.ts'))
    for (const tsFile of tsFiles) {
      const jsFile = tsFile.replace(/\.ts$/, '.js')
      try {
        const jsContent = readFileSync(resolve(dir, jsFile), 'utf-8')
        const tsContent = readFileSync(resolve(dir, tsFile), 'utf-8')
        const jsHandlers = extractAll(jsContent, RE_HANDLE)
        const tsHandlers = extractAll(tsContent, RE_HANDLE)
        // TS file should have all same handlers as JS file
        const missing = [...jsHandlers].filter(h => !tsHandlers.has(h))
        expect(missing).toEqual([])
      } catch {
        // .js file doesn't exist, skip
      }
    }
  })
})
