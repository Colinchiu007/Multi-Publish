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
    const { PublisherRouter } = require(path.join(ELECTRON_DIR, 'services', 'publisher-router'))
    publisherRouter = new PublisherRouter()
  })

  test('ROUTE_TABLE covers all 15 platforms', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'services', 'publisher-router'))
    for (const p of EXPECTED_PLATFORMS) {
      expect(ROUTE_TABLE).toHaveProperty(p)
    }
  })

  test('ROUTE_TABLE 模式按平台显式登记（api 直调 / xhs_draft 仅存草稿 / 其余 rpa_vm）', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'services', 'publisher-router'))
    // Tier-A 自包含签名的平台走 api 直调（baijiahao 图文 / bilibili 视频，均已活体验证）
    const API_MODE_PLATFORMS = ['baijiahao', 'bilibili']
    // 小红书硬约束（2026-10-09，用户要求）：风控严格 ⇒ 不得真实发布，只调 API 存平台草稿箱。
    // 该轨同样"非 RPA"，因此**必须在此显式登记**：漏登记会让本用例对它放行成 rpa_vm，
    // 从而在"路由被改回 RPA 真实发布"时毫无察觉（这正是本条断言存在的意义）。
    const XHS_DRAFT_PLATFORMS = ['xiaohongshu']
    for (const [platform, route] of Object.entries(ROUTE_TABLE)) {
      if (platform.startsWith('_') || platform === 'shipinhao') continue
      if (API_MODE_PLATFORMS.includes(platform)) {
        expect(route.mode).toBe('api')
        continue
      }
      if (XHS_DRAFT_PLATFORMS.includes(platform)) {
        expect(route.mode).toBe('xhs_draft')
        continue
      }
      expect(route.mode).toBe('rpa_vm')
    }
  })

  test('no extra platforms in ROUTE_TABLE', () => {
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'services', 'publisher-router'))
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
.toThrow(/平台未配置/)
  })

  test('listPlatforms returns all platform ids', () => {
    const platforms = publisherRouter.listPlatforms()
    expect(platforms.length).toBeGreaterThanOrEqual(15)
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
    'services/logger', 'services/python-bridge', 'publishers/account-manager',
    'services/scheduler', 'services/publish-history', 'services/auto-updater', 'services/first-run',
    'services/auth-view-manager', 'services/webview-manager', 'services/rpa-view-manager',
    'services/publisher-router', 'services/callback-server', 'services/qrcode-login', 'services/store',
    'services/oauth-manager', 'services/batch-manager', 'services/url-collector',
    'services/publish-alert', 'services/publish-monitor', 'services/system-tray', 'services/hotkeys',
  ]

  test('all main.js local require paths resolve', () => {
    const requires = extractRequires(path.join(ELECTRON_DIR, 'main.js'))
    // main.js 已重构为委托 bootstrap/window/shutdown 三件套，仅 3 个本地 require
    expect(requires.length).toBeGreaterThanOrEqual(3)
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
    const resolved = nativeRequire.resolve('./services/playwright-manager')
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
    const { ROUTE_TABLE } = require(path.join(ELECTRON_DIR, 'services', 'publisher-router'))
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
