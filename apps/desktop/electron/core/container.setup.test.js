// container.setup 加载所有服务模块，多数 require electron + fs + path
__enableElectronMock()

// 夹具只对**本测试的沙箱目录**谎报文件系统，沙箱外一律委托真实 fs（#2794 同族收敛，形状同
// apps/desktop/electron/services/asset-generator.test.js）。
// 为什么这个文件必须有牙齿：它 require 全部服务模块，其中 store → sqlite-wrapper → sql.js 会
// 用 fs.readFileSync 读 .wasm —— 一律返回 "[]" 的谎报正是 BF-TEST-01 那次
// `WebAssembly.instantiate(): BufferSource argument is empty` 崩溃的成因（下面对 sql.js 的
// mock 是同一根因的第二处规避）。同 realm 还会经 deps.inline:['electron'] 带进真 electron 入口，
// existsSync()=>false 会让它以为二进制没备好并当场 spawn install.js。
// 判定按**路径段**比：裸 startsWith 会把 <沙箱>-evil 判进沙箱，对真实存在的目录持续谎报"不存在"。
const nodeOs = require('node:os')
const nodePath = require('node:path')
const realFs = require('node:fs')
const CONTAINER_SANDBOX = nodePath.join(nodeOs.tmpdir(), 'multi-publish-container-setup-' + process.pid)
const isSandboxPath = (target) => {
  const normalized = String(target).replace(/\\/g, '/')
  const sandbox = CONTAINER_SANDBOX.replace(/\\/g, '/')
  return normalized === sandbox || normalized.startsWith(sandbox + '/')
}
// 只委托"读"。写类动词继续全部空转：夹具不得因为"委托"而把东西真的写到磁盘上。
__registerMock("fs", {
  existsSync: vi.fn((target) => (isSandboxPath(target) ? false : realFs.existsSync(target))),
  readFileSync: vi.fn((target, ...rest) => (isSandboxPath(target) ? '' : realFs.readFileSync(target, ...rest))),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn((target, ...rest) => (isSandboxPath(target) ? [] : realFs.readdirSync(target, ...rest))),
  statSync: vi.fn((target, ...rest) => (isSandboxPath(target) ? { size: 0, mtime: new Date() } : realFs.statSync(target, ...rest))),
  unlinkSync: vi.fn(),
  createWriteStream: vi.fn(),
  createReadStream: vi.fn((target, ...rest) => (isSandboxPath(target) ? { on: vi.fn() } : realFs.createReadStream(target, ...rest))),
})

__registerMock("path", {
  join: vi.fn(function() { return "/mock/path"; }),
  dirname: vi.fn(function(p) { return p; }),
  basename: vi.fn(function(p) { return p; }),
  resolve: vi.fn(function() { return "/mock/resolved"; }),
  extname: vi.fn(function() { return ""; }),
})

// api-publish-engine/src/api-router.js require './logger' 缺失，mock 整个包规避
__registerMock("@multi-publish/api-publish-engine", {
  supportsApi: vi.fn().mockReturnValue(false),
  publishViaApi: vi.fn(),
})

// ── BF-TEST-01 修复 ──────────────────────────────
// Bug: sql.js WebAssembly 在测试环境中加载失败
//   RuntimeError: Aborted(CompileError: WebAssembly.instantiate(): BufferSource argument is empty)
//
// 根因链：
//   container.setup.test.js → require('./container.setup')
//     → require('../services/store') → require('./sqlite-wrapper')
//       → require('sql.js') → initSqlJs() → 读取 .wasm 二进制
//         → fs.readFileSync 被 mock 返回 "[]"（字符串而非 Buffer）
//           → WebAssembly.instantiate(empty) → 崩溃
//
// 修复：在 require container.setup 之前，先 mock 掉 sql.js 模块，
//       让 sqlite-wrapper.js 拿到一个安全的 mock 对象（含 .Database 构造器）。
const mockSqlDatabase = {
  run: vi.fn(),
  exec: vi.fn(),
  prepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    all: vi.fn().mockReturnValue([]),
    bind: vi.fn().mockReturnThis(),
  }),
  close: vi.fn(),
}

__registerMock("sql.js", {
  __esModule: true,
  default: vi.fn().mockResolvedValue({ Database: vi.fn().mockReturnValue(mockSqlDatabase) }),
})
// ────────────────────────────────────────────────

const { createContainer } = require('./container.setup');

describe('Container setup', () => {
  test('creates container with all services', () => {
    var c = createContainer();
    expect(c.get('store')).toBeDefined();
    expect(c.get('authViewManager')).toBeDefined();
    expect(c.get('rpaViewManager')).toBeDefined();
    expect(c.get('taskQueue')).toBeDefined();
  });

  test('lazy initialization works', () => {
    var c = createContainer();
    var svc = c.get('rpaViewManager');
    expect(svc).toBeDefined();
    expect(c.get('rpaViewManager')).toBe(svc);
  });

  test('wires QR code login into the virtual login tab lifecycle', () => {
    var c = createContainer();
    var webviewManager = c.get('webviewManager');
    var qrCodeLogin = c.get('qrCodeLogin');

    expect(webviewManager._qrCodeLogin).toBe(qrCodeLogin);
    expect(typeof qrCodeLogin.onOpened).toBe('function');
    expect(typeof qrCodeLogin.onClosed).toBe('function');
  });

  test('dependency injection works', () => {
    var c = createContainer();
    var ci = c.get('contentIntelligence');
    expect(ci).toBeDefined();
    var track = c.get('publishImpactTracker');
    expect(track).toBeDefined();
  });

  test('assertRequired passes', () => {
    expect(() => createContainer()).not.toThrow();
  });
});
