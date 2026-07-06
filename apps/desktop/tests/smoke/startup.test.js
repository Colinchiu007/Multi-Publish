/**
 * 启动冒烟测试 — 验证 Electron 启动前所有模块能正确解析
 *
 * 覆盖：P2-E dangling reference 模式、模块缺失模式
 */

const path = require('path')
const fs = require('fs')
const { createRequire } = require('module')

const EXPECTED_PLATFORMS = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
  'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
  'bilibili', 'baijiahao', 'twitter', 'facebook', 'instagram',
]

const ELECTRON_DIR = path.resolve(__dirname, '..', '..', 'electron')
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..')
const CONFIG_YAML = path.join(PROJECT_ROOT, 'config', 'platforms.yaml')
const nativeRequire = createRequire(path.join(ELECTRON_DIR, 'index.js'))

// ============================================================
// PublisherRouter
// ============================================================
describe('PublisherRouter', () => {
  let publisherRouter

  beforeAll(() => {
    const { PublisherRouter } = require(path.join(ELECTRON_DIR, 'publisher-router'))
    publisherRouter = new PublisherRouter()
  })

  test('ROUTE_TABLE covers all 12 platforms', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'publisher-router'))
    for (const p of EXPECTED_PLATFORMS) {
      expect(ROUTE_TABLE).toHaveProperty(p)
    }
  })

  test('all ROUTE_TABLE entries mode=rpa_vm', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'publisher-router'))
    for (const [platform, route] of Object.entries(ROUTE_TABLE)) {
      if (platform.startsWith('_') || platform === 'shipinhao') continue
      expect(route.mode).toBe('rpa_vm')
    }
  })

  test('no extra platforms in ROUTE_TABLE', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'publisher-router'))
    const routePlatforms = Object.keys(ROUTE_TABLE).filter(p => !p.startsWith('_') && p !== 'shipinhao')
    for (const p of routePlatforms) {
      expect(EXPECTED_PLATFORMS).toContain(p)
    }
  })

  test('getRoute returns correct structure', () => {
    const route = publisherRouter.getRoute('wechat_mp')
    expect(route).toHaveProperty('platform', 'wechat_mp')
    expect(route).toHaveProperty('mode')
    expect(route).toHaveProperty('timeout')
    expect(route).toHaveProperty('type')
    expect(route).toHaveProperty('publishUrl')
  })

  test('getRoute throws for unknown platform', () => {
    expect(() => publisherRouter.getRoute('nonexistent_platform'))
.toThrow(/Platform not configured/)
  })

  test('listPlatforms returns all platform ids', () => {
    const platforms = publisherRouter.listPlatforms()
    expect(platforms.length).toBeGreaterThanOrEqual(12)
    const ids = platforms.map(p => p.id || p)
    for (const p of EXPECTED_PLATFORMS) {
      expect(ids).toContain(p)
    }
  })
})

// ============================================================
// require path resolution
// ============================================================
describe('模块依赖解析', () => {
  function extractRequires(filePath) {
    const src = fs.readFileSync(filePath, 'utf-8')
    const requires = []
    const re = /require\((['"])((?:\.\/|\.\.\/|@multi-publish\/)[^'"]+)\1\)/g
    let match
    while ((match = re.exec(src)) !== null) {
      requires.push(match[2])
    }
    return requires
  }

  const CORE_MODULES = [
    'logger', 'python-bridge', 'publishers/account-manager',
    'scheduler', 'publish-history', 'auto-updater', 'first-run',
    'auth-view-manager', 'webview-manager', 'rpa-view-manager',
    'publisher-router', 'callback-server', 'qrcode-login', 'store',
    'oauth-manager', 'batch-manager', 'url-collector',
    'publish-alert', 'publish-monitor', 'system-tray', 'hotkeys',
  ]

  test('all main.js local require paths resolve', () => {
    const requires = extractRequires(path.join(ELECTRON_DIR, 'main.js'))
    expect(requires.length).toBeGreaterThan(10)
    for (const req of requires) {
      try {
        const resolved = require.resolve(req, { paths: [ELECTRON_DIR] })
        expect(resolved).toBeTruthy()
      } catch (e) {
        throw new Error('Failed to resolve: "' + req + '" - ' + e.message)
      }
    }
  })

  test('core module files exist in electron/', () => {
    for (const mod of CORE_MODULES) {
      const filePath = path.join(ELECTRON_DIR, mod + '.js')
      expect(fs.existsSync(filePath)).toBe(true)
    }
  })

  test('url-collector playwright-manager resolves', () => {
    const resolved = nativeRequire.resolve('./playwright-manager')
    expect(resolved).toBeTruthy()
    expect(resolved.endsWith('playwright-manager.js')).toBe(true)
  })

  test('package.json declares @multi-publish/shared-utils', () => {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'))
    expect(pkg.dependencies).toHaveProperty('@multi-publish/shared-utils')
  })
})

// ============================================================
// Config consistency: platforms.yaml <-> ROUTE_TABLE
// ============================================================
describe('平台配置一致性', () => {
  test('all platforms.yaml keys have ROUTE_TABLE entry', () => {
    const yaml = require('js-yaml')
    const raw = fs.readFileSync(CONFIG_YAML, 'utf-8')
    const config = yaml.load(raw)
    const yamlPlatforms = Object.keys(config.platforms)
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'publisher-router'))
    for (const p of yamlPlatforms) {
      expect(ROUTE_TABLE).toHaveProperty(p)
    }
  })

  test('platforms.yaml matches EXPECTED_PLATFORMS', () => {
    const yaml = require('js-yaml')
    const raw = fs.readFileSync(CONFIG_YAML, 'utf-8')
    const config = yaml.load(raw)
    const yamlPlatforms = Object.keys(config.platforms)
    expect(yamlPlatforms.sort()).toEqual([...EXPECTED_PLATFORMS].sort())
  })
})
