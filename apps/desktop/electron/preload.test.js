/**
 * Preload 拆分测试 — Phase 3.3
 *
 * 测试策略（避开 vi.mock('electron') 的局限）：
 *   - 直接调用工厂函数 createPublishApi / createAccountApi / createSystemApi
 *   - 传入 mock ipcRenderer，合并后得到与 contextBridge.exposeInMainWorld
 *     等价的方法集合，绕过 contextBridge.exposeInMainWorld
 *   - 子模块内部不调用 require('electron')，因此无需启用 electron mock
 *
 * 验证维度：
 *   1. 三个工厂函数存在且为函数，返回对象
 *   2. 所有原 preload.js 方法在新 API 对象中存在且为函数
 *   3. pipelines 嵌套对象有 list / get 方法
 *   4. invoke 类方法调用时转发到 ipcRenderer.invoke，channel 与原 preload.js 一致
 *   5. 监听器类方法返回 cancel 函数
 *   6. 总方法数符合预期（防止漏迁移或重复）
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let ipcRenderer, api

beforeEach(() => {
  ipcRenderer = {
    invoke: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  }
  const { createPublishApi } = require('./preload/publish')
  const { createAccountApi } = require('./preload/account')
  const { createSystemApi } = require('./preload/system')
  api = {
    ...createPublishApi(ipcRenderer),
    ...createAccountApi(ipcRenderer),
    ...createSystemApi(ipcRenderer),
  }
})

// === 方法名清单（从原 preload.js 351 行提取，不改变任何名称/IPC 通道/参数顺序）===
const PUBLISH_METHODS = [
  'publishWechat', 'publishBatch', 'listAccounts',
  'renderStart', 'renderCancel', 'renderGetStatus', 'renderInstallDeps',
  'onRenderProgress', 'onRenderComplete', 'onRenderError', 'onRenderInstallProgress',
  'renderListCompositions', 'renderGetComposition', 'renderValidateProps',
  'intelligenceSuggestTags', 'intelligenceGetOptimalTime',
  'intelligenceSearch', 'intelligenceSearchTitles', 'intelligenceFetchTrending',
  'intelligenceFindReferences', 'intelligenceGetBenchmark',
  'getQueueStatus', 'getQueueHistory', 'cancelTask',
  'historyList', 'historyGet',
  'dashboardStats',
  'schedulerCreate', 'schedulerList', 'schedulerCancel',
  'onProgress',
  'pipelineList', 'pipelineGet', 'pipelineStart', 'pipelinePause', 'pipelineResume',
  'pipelineCancel', 'pipelineStatus', 'pipelineAdvance', 'pipelineHistory', 'pipelineFetch',
  'cloudPublishSubmit', 'cloudPublishListTasks', 'cloudPublishGetTask', 'cloudPublishPlatforms',
  'urlCollectFetch',
  'viralAnalyze', 'viralGenerate', 'viralTrending',
  'commentList', 'commentReply', 'commentStartPolling', 'commentStopPolling', 'commentStatus', 'onCommentReplied',
]

const ACCOUNT_METHODS = [
  'accountAdd', 'accountDelete', 'accountCheckLogin', 'accountList',
  'accountSetDefault', 'accountGetDefault', 'accountUpdate',
  'authOpenLogin', 'authClose', 'authSaveCredentials', 'authLoginSilent',
  'onAuthViewOpened', 'onAuthCompleted', 'onAuthViewClosed',
  'authOpenQrCodeLogin', 'authQrCodeClose',
  'onQrCodeOpened', 'onQrCodeDetected', 'onQrCodeCompleted', 'onQrCodeClosed',
  'oauthStart', 'oauthClose', 'oauthGetConfigs',
  'onOAuthOpened', 'onOAuthCompleted', 'onOAuthFailed', 'onOAuthClosed',
  'storeAddAccount', 'storeGetAccount', 'storeListAccounts', 'storeDeleteAccount',
  'storeAddPublishRecord', 'storeListPublishHistory', 'storeGetPublishStats',
  'storeAddScheduledTask', 'storeListScheduledTasks', 'storeDeleteTask',
  'storeGetSetting', 'storeSetSetting', 'storeListCallbackLogs',
]

const SYSTEM_METHODS = [
  'getVersion', 'getPlatform',
  'updateCheck', 'updateDownload', 'updateInstall', 'onUpdateStatus',
  'firstRunCheck', 'onFirstRunStatus',
  'platformList', 'platformGet', 'getPlatformDefinitions',
  'sensitiveCheck', 'sensitiveReplace',
  'syncAll', 'syncPlatform', 'syncCached',
  'showNotification', 'onNotification',
  'webviewSetLayout', 'webviewOpenTab', 'webviewCloseTab', 'webviewCloseAll', 'webviewListTabs',
  'onWebviewLayoutChanged', 'onWebviewTabOpened', 'onWebviewTabClosed', 'onWebviewNav', 'onWebviewAllClosed',
  'onCallbackReceived',
  'offlineStatus', 'offlineIsOffline', 'offlineCachedTasks', 'offlineAddToCache', 'offlineClearCache', 'onOfflineRestored',
  'onboardingComplete', 'onboardingGetSteps', 'onboardingStatus',
  'paymentCreateOrder', 'paymentListOrders', 'paymentGetOrder', 'paymentComplete', 'paymentSimulate', 'paymentCancel',
  'onNavigate',
  'analyticsOverview', 'analyticsPlatform', 'analyticsPlatforms',
  'hotkeysList',
  'keywordStart', 'keywordStop', 'keywordStatus', 'keywordHistory', 'keywordStopAll',
  'proxyAdd', 'proxyAddBatch', 'proxyList', 'proxyRemove', 'proxyTest', 'proxyTestAll',
  'proxyStatus', 'proxyGetNext', 'proxyReset', 'proxyRemoveDead',
  'uploadChunked', 'uploadCancel',
  'templateList', 'templateGet', 'templateAdd', 'templateUpdate', 'templateDelete',
  'templateListByCategory', 'templateGetPresets',
  'licenseInfo', 'licenseActivate', 'licenseDeactivate', 'licenseActivateTrial',
  'licenseHasFeature', 'licenseFeatures',
  'providerList', 'providerCreate', 'providerUpdate', 'providerDelete', 'providerTest',
  'providerListUser', 'providerGetUser', 'providerSetUserKey', 'providerDeleteUserKey',
  'aiListProviders', 'aiGetConfig', 'aiListModels', 'aiGenerate', 'aiTestConnection', 'aiSaveConfig',
  'aiIsConfigured', 'aiGenerateTitles', 'aiEnhanceContent', 'aiGenerateSummary',
  'onAIProgress', 'onAIComplete', 'onAIError',
  'videoStatus', 'videoListProcessTypes', 'videoListAnalyzeTypes', 'videoListStockSources',
  'videoProcess', 'videoAnalyze', 'videoMixAudio', 'videoSearchStock', 'videoGenerateSubtitle',
  'onVideoProgress', 'onVideoComplete', 'onVideoError',
  'batchCreate', 'batchExecute', 'batchSchedule', 'batchList', 'batchGet', 'batchDelete',
  'batchDuplicateArticle', 'onBatchProgress',
  'modelProviderList', 'modelProviderGet', 'modelProviderCreate', 'modelProviderUpdate',
  'modelProviderDelete', 'modelProviderSetDefault', 'modelProviderGetDefault',
  'modelProviderTest', 'modelProviderPresets', 'modelProviderIsConfigured',
  'modelProviderLogs', 'modelProviderCleanLogs',
]

// === 工厂函数导出 ===
describe('preload 子模块工厂函数', () => {
  it('createPublishApi 应为函数', () => {
    const { createPublishApi } = require('./preload/publish')
    expect(typeof createPublishApi).toBe('function')
  })

  it('createAccountApi 应为函数', () => {
    const { createAccountApi } = require('./preload/account')
    expect(typeof createAccountApi).toBe('function')
  })

  it('createSystemApi 应为函数', () => {
    const { createSystemApi } = require('./preload/system')
    expect(typeof createSystemApi).toBe('function')
  })

  it('createPublishApi 返回非空对象', () => {
    const { createPublishApi } = require('./preload/publish')
    const r = createPublishApi(ipcRenderer)
    expect(typeof r).toBe('object')
    expect(r).not.toBe(null)
    expect(Object.keys(r).length).toBeGreaterThan(0)
  })

  it('createAccountApi 返回非空对象', () => {
    const { createAccountApi } = require('./preload/account')
    const r = createAccountApi(ipcRenderer)
    expect(typeof r).toBe('object')
    expect(r).not.toBe(null)
    expect(Object.keys(r).length).toBeGreaterThan(0)
  })

  it('createSystemApi 返回非空对象', () => {
    const { createSystemApi } = require('./preload/system')
    const r = createSystemApi(ipcRenderer)
    expect(typeof r).toBe('object')
    expect(r).not.toBe(null)
    expect(Object.keys(r).length).toBeGreaterThan(0)
  })
})

// === 总方法数验证（防止漏迁移或重复）===
describe('preload 子模块方法数', () => {
  it('publish 模块应导出 56 个键（55 方法 + pipelines 对象）', () => {
    const { createPublishApi } = require('./preload/publish')
    const r = createPublishApi(ipcRenderer)
    expect(Object.keys(r).length).toBe(56)
  })

  it('account 模块应导出 40 个方法', () => {
    const { createAccountApi } = require('./preload/account')
    const r = createAccountApi(ipcRenderer)
    expect(Object.keys(r).length).toBe(40)
  })

  it('system 模块应导出 133 个方法', () => {
    const { createSystemApi } = require('./preload/system')
    const r = createSystemApi(ipcRenderer)
    expect(Object.keys(r).length).toBe(133)
  })

  it('合并后 api 总键数应为 229', () => {
    expect(Object.keys(api).length).toBe(229)
  })

  it('PUBLISH_METHODS 常量长度应为 55', () => {
    expect(PUBLISH_METHODS.length).toBe(55)
  })

  it('ACCOUNT_METHODS 常量长度应为 40', () => {
    expect(ACCOUNT_METHODS.length).toBe(40)
  })

  it('SYSTEM_METHODS 常量长度应为 133', () => {
    expect(SYSTEM_METHODS.length).toBe(133)
  })
})

// === pipelines 嵌套对象结构 ===
describe('pipelines 嵌套对象结构', () => {
  it('api.pipelines 应为对象', () => {
    expect(typeof api.pipelines).toBe('object')
    expect(api.pipelines).not.toBe(null)
  })

  it('api.pipelines.list 应为函数', () => {
    expect(typeof api.pipelines.list).toBe('function')
  })

  it('api.pipelines.get 应为函数', () => {
    expect(typeof api.pipelines.get).toBe('function')
  })

  it('api.pipelines.list() 调用应转发到 ipcRenderer.invoke("pipeline:list")', () => {
    api.pipelines.list()
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('pipeline:list')
  })

  it('api.pipelines.get("foo") 调用应转发到 ipcRenderer.invoke("pipeline:get", "foo")', () => {
    api.pipelines.get('foo')
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('pipeline:get', 'foo')
  })
})

// === publish 模块方法存在性 + 类型（数据驱动）===
describe('publish 模块方法存在且为函数', () => {
  it.each(PUBLISH_METHODS)('%s 应存在于 api 且为函数', (name) => {
    expect(api).toHaveProperty(name)
    expect(typeof api[name]).toBe('function')
  })
})

// === account 模块方法存在性 + 类型（数据驱动）===
describe('account 模块方法存在且为函数', () => {
  it.each(ACCOUNT_METHODS)('%s 应存在于 api 且为函数', (name) => {
    expect(api).toHaveProperty(name)
    expect(typeof api[name]).toBe('function')
  })
})

// === system 模块方法存在性 + 类型（数据驱动）===
describe('system 模块方法存在且为函数', () => {
  it.each(SYSTEM_METHODS)('%s 应存在于 api 且为函数', (name) => {
    expect(api).toHaveProperty(name)
    expect(typeof api[name]).toBe('function')
  })
})

// === invoke 转发抽样测试（12 个：channel 与原 preload.js 一致）===
describe('invoke 类方法转发到 ipcRenderer.invoke', () => {
  const INVOKE_CASES = [
    ['publishWechat', 'publish:wechat', [{ id: 1 }]],
    ['listAccounts', 'accounts:list', []],
    ['getVersion', 'app:get-version', []],
    ['accountAdd', 'account:add', ['wechat']],
    ['storeGetSetting', 'store:get-setting', ['theme']],
    ['oauthStart', 'oauth:start', [{ platform: 'youtube' }]],
    ['videoStatus', 'video:status', []],
    ['paymentCreateOrder', 'payment:create-order', [{ amount: 100 }]],
    ['templateList', 'template:list', []],
    ['proxyAdd', 'proxy:add', [{ host: '127.0.0.1' }]],
    ['modelProviderLogs', 'model-provider:logs', [{ category: 'llm' }]],
    ['modelProviderCleanLogs', 'model-provider:clean-logs', [7]],
  ]

  beforeEach(() => {
    ipcRenderer.invoke.mockClear()
  })

  it.each(INVOKE_CASES)('%s() 应转发到 invoke("%s", ...)', (method, channel, args) => {
    api[method](...args)
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1)
    expect(ipcRenderer.invoke.mock.calls[0][0]).toBe(channel)
  })
})

// === 监听器类方法返回 cancel 函数（抽样 5 个）===
describe('监听器类方法返回 cancel 函数', () => {
  const LISTENER_CASES = [
    'onProgress',
    'onUpdateStatus',
    'onAuthViewOpened',
    'onWebviewLayoutChanged',
    'onQrCodeOpened',
  ]

  it.each(LISTENER_CASES)('%s(callback) 应返回 cancel 函数', (method) => {
    const cancel = api[method](() => {})
    expect(typeof cancel).toBe('function')
  })

  it.each(LISTENER_CASES)('%s 调用 cancel 后应调用 removeListener', (method) => {
    const cancel = api[method](() => {})
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled()
    cancel()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
  })
})

// === 无方法名重复校验 ===
describe('方法名清单无重复', () => {
  it('PUBLISH_METHODS 无重复', () => {
    const set = new Set(PUBLISH_METHODS)
    expect(set.size).toBe(PUBLISH_METHODS.length)
  })

  it('ACCOUNT_METHODS 无重复', () => {
    const set = new Set(ACCOUNT_METHODS)
    expect(set.size).toBe(ACCOUNT_METHODS.length)
  })

  it('SYSTEM_METHODS 无重复', () => {
    const set = new Set(SYSTEM_METHODS)
    expect(set.size).toBe(SYSTEM_METHODS.length)
  })

  it('三个模块间无方法名冲突', () => {
    const all = [...PUBLISH_METHODS, ...ACCOUNT_METHODS, ...SYSTEM_METHODS]
    const set = new Set(all)
    expect(set.size).toBe(all.length)
  })
})

// === 子模块路径解析（require 链可加载，确保 QM-2 require 路径校验）===
describe('子模块 require 链可加载', () => {
  it('require("./preload/publish") 不抛错', () => {
    expect(() => require('./preload/publish')).not.toThrow()
  })

  it('require("./preload/account") 不抛错', () => {
    expect(() => require('./preload/account')).not.toThrow()
  })

  it('require("./preload/system") 不抛错', () => {
    expect(() => require('./preload/system')).not.toThrow()
  })

  it('require("./preload/index") 不抛错（聚合入口）', () => {
    // index.js 内部 require('electron')，需启用 electron mock 才能在非 electron 进程中加载
    // 工厂函数子模块不依赖 electron，故前面所有测试均无需启用 mock
    __enableElectronMock()
    try {
      expect(() => require('./preload/index')).not.toThrow()
    } finally {
      __disableElectronMock()
    }
  })
})
