var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// electron/preload/publish.js
var require_publish = __commonJS({
  "electron/preload/publish.js"(exports2, module2) {
    function createPublishApi2(ipcRenderer2) {
      return {
        // 发布 API
        publishWechat: (articleData) => ipcRenderer2.invoke("publish:wechat", articleData),
        publishBatch: (platforms, article) => ipcRenderer2.invoke("publish:batch", { platforms, article }),
        listAccounts: () => ipcRenderer2.invoke("accounts:list"),
        // 渲染 API
        renderStart: (data) => ipcRenderer2.invoke("render:start", data),
        renderCancel: () => ipcRenderer2.invoke("render:cancel"),
        renderGetStatus: () => ipcRenderer2.invoke("render:status"),
        renderInstallDeps: () => ipcRenderer2.invoke("render:install-deps"),
        onRenderProgress: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("render:progress", h);
          return () => ipcRenderer2.removeListener("render:progress", h);
        },
        onRenderComplete: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("render:complete", h);
          return () => ipcRenderer2.removeListener("render:complete", h);
        },
        onRenderError: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("render:error", h);
          return () => ipcRenderer2.removeListener("render:error", h);
        },
        onRenderInstallProgress: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("render:install-progress", h);
          return () => ipcRenderer2.removeListener("render:install-progress", h);
        },
        renderListCompositions: () => ipcRenderer2.invoke("render:list-compositions"),
        renderGetComposition: (id) => ipcRenderer2.invoke("render:get-composition", id),
        renderValidateProps: (compositionId, props) => ipcRenderer2.invoke("render:validate-props", compositionId, props),
        // 流水线 API（嵌套对象）
        pipelines: {
          list: () => ipcRenderer2.invoke("pipeline:list"),
          get: (name) => ipcRenderer2.invoke("pipeline:get", name)
        },
        // 内容情报 API（已注册于 services/content-intelligence.js）
        intelligenceSuggestTags: (content, opts) => ipcRenderer2.invoke("intelligence:suggest-tags", { content, opts }),
        intelligenceGetOptimalTime: (keyword) => ipcRenderer2.invoke("intelligence:get-optimal-time", { keyword }),
        intelligenceSearch: (query, opts) => ipcRenderer2.invoke("intelligence:search", { query, opts }),
        // handler 解构 { title, opts }，前端用 query 作为标题
        intelligenceSearchTitles: (query, opts) => ipcRenderer2.invoke("intelligence:search-titles", { title: query, opts }),
        intelligenceFetchTrending: (opts) => ipcRenderer2.invoke("intelligence:fetch-trending", opts),
        // handler 解构 { text, opts }，前端用 url 作为搜索文本
        intelligenceFindReferences: (url, opts) => ipcRenderer2.invoke("intelligence:find-references", { text: url, opts }),
        // handler 解构 { title, opts }，前端传 { keyword, sampleSize }
        intelligenceGetBenchmark: (opts) => {
          const o = opts || {};
          return ipcRenderer2.invoke("intelligence:get-benchmark", { title: o.keyword || o.title, opts: o });
        },
        // 队列 API
        getQueueStatus: () => ipcRenderer2.invoke("queue:status"),
        getQueueHistory: () => ipcRenderer2.invoke("queue:history"),
        cancelTask: (taskId) => ipcRenderer2.invoke("queue:cancel", taskId),
        retryTask: (taskId) => ipcRenderer2.invoke("queue:retry", taskId),
        // 发布历史 API
        historyList: (opts) => ipcRenderer2.invoke("history:list", opts),
        historyGet: (id) => ipcRenderer2.invoke("history:get", id),
        // 发布统计 API
        dashboardStats: () => ipcRenderer2.invoke("dashboard:stats"),
        // 定时发布 API
        schedulerCreate: (schedule) => ipcRenderer2.invoke("scheduler:create", schedule),
        schedulerList: () => ipcRenderer2.invoke("scheduler:list"),
        schedulerCancel: (id) => ipcRenderer2.invoke("scheduler:cancel", id),
        // 进度监听
        onProgress: (callback) => {
          const handler = (_, data) => callback(data);
          ipcRenderer2.on("publish:progress", handler);
          return () => ipcRenderer2.removeListener("publish:progress", handler);
        },
        // Pipeline 流水线 API（Phase 3）
        pipelineList: () => ipcRenderer2.invoke("pipeline:list"),
        pipelineGet: (name) => ipcRenderer2.invoke("pipeline:get", name),
        pipelineStart: (name, params) => ipcRenderer2.invoke("pipeline:start", name, params),
        pipelinePause: () => ipcRenderer2.invoke("pipeline:pause"),
        pipelineResume: () => ipcRenderer2.invoke("pipeline:resume"),
        pipelineCancel: () => ipcRenderer2.invoke("pipeline:cancel"),
        pipelineStatus: (name) => ipcRenderer2.invoke("pipeline:status", name),
        pipelineAdvance: () => ipcRenderer2.invoke("pipeline:advance"),
        pipelineHistory: () => ipcRenderer2.invoke("pipeline:history"),
        pipelineFetch: (name) => ipcRenderer2.invoke("pipeline:fetch", name),
        // Cloud Publisher API
        cloudPublishSubmit: (params) => ipcRenderer2.invoke("cloud-publisher:submit", params),
        cloudPublishListTasks: () => ipcRenderer2.invoke("cloud-publisher:list-tasks"),
        cloudPublishGetTask: (taskId) => ipcRenderer2.invoke("cloud-publisher:get-task", taskId),
        cloudPublishPlatforms: () => ipcRenderer2.invoke("cloud-publisher:platforms"),
        // URL Collect API
        urlCollectFetch: (url) => ipcRenderer2.invoke("url-collect:fetch", { url }),
        // Viral Analysis API
        viralAnalyze: (articles, topic) => ipcRenderer2.invoke("viral:analyze", { articles, topic }),
        viralGenerate: (opts) => ipcRenderer2.invoke("viral:generate", opts),
        viralTrending: (articles) => ipcRenderer2.invoke("viral:trending", { articles }),
        // Draft API
        draftSave: (draft) => ipcRenderer2.invoke("draftSave", draft),
        draftList: () => ipcRenderer2.invoke("draftList"),
        draftDelete: (draftId) => ipcRenderer2.invoke("draftDelete", draftId),
        // Comment Management API (PRD F13)
        commentList: (platform, accountId, maxDays) => ipcRenderer2.invoke("comment:list", { platform, accountId, maxDays }),
        commentReply: (platform, accountId, commentId, content) => ipcRenderer2.invoke("comment:reply", { platform, accountId, commentId, content }),
        commentStartPolling: (opts = {}) => ipcRenderer2.invoke("comment:start-polling", {
          platform: opts.platform,
          accountId: opts.accountId,
          interval: opts.interval,
          maxDays: opts.maxDays,
          template: opts.template
        }),
        commentStopPolling: (key) => ipcRenderer2.invoke("comment:stop-polling", { key }),
        commentStatus: () => ipcRenderer2.invoke("comment:status"),
        onCommentReplied: (cb) => {
          const h = (_, data) => cb(data);
          ipcRenderer2.on("comment:replied", h);
          return () => ipcRenderer2.removeListener("comment:replied", h);
        }
      };
    }
    module2.exports = { createPublishApi: createPublishApi2 };
  }
});

// electron/preload/account.js
var require_account = __commonJS({
  "electron/preload/account.js"(exports2, module2) {
    function createAccountApi2(ipcRenderer2) {
      return {
        // 账号管理 API
        accountAdd: (platform) => ipcRenderer2.invoke("account:add", platform),
        accountDelete: (accountId) => ipcRenderer2.invoke("account:delete", accountId),
        accountCheckLogin: (platform, accountId) => ipcRenderer2.invoke("account:check-login", { platform, accountId }),
        accountList: () => ipcRenderer2.invoke("account:list"),
        accountSetDefault: (platform, accountId) => ipcRenderer2.invoke("store:set-default-account", { platform, accountId }),
        accountGetDefault: (platform) => ipcRenderer2.invoke("store:get-default-account", platform),
        accountUpdate: (id, fields) => ipcRenderer2.invoke("store:update-account", { id, fields }),
        // 内嵌浏览器登录 API
        authOpenLogin: (platform) => ipcRenderer2.invoke("auth:open-login", platform),
        authCompleteLogin: () => ipcRenderer2.invoke("auth:complete-login"),
        authClose: () => ipcRenderer2.invoke("auth:close"),
        onAuthViewOpened: (callback) => {
          const h = (_, data) => callback(data);
          ipcRenderer2.on("auth:view-opened", h);
          return () => ipcRenderer2.removeListener("auth:view-opened", h);
        },
        onAuthCompleted: (callback) => {
          const h = (_, data) => callback(data);
          ipcRenderer2.on("auth:completed", h);
          return () => ipcRenderer2.removeListener("auth:completed", h);
        },
        onAuthViewClosed: (callback) => {
          const h = () => callback();
          ipcRenderer2.on("auth:view-closed", h);
          return () => ipcRenderer2.removeListener("auth:view-closed", h);
        },
        // Auth API（静默登录）
        authLoginSilent: (platform, accountId) => ipcRenderer2.invoke("auth:login-silent", { platform, accountId }),
        // 扫码登录 API
        authOpenQrCodeLogin: (platform) => ipcRenderer2.invoke("auth:open-qrcode-login", platform),
        authQrCodeClose: () => ipcRenderer2.invoke("auth:qrcode-close"),
        onQrCodeOpened: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("qrcode:opened", h);
          return () => ipcRenderer2.removeListener("qrcode:opened", h);
        },
        onQrCodeDetected: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("qrcode:detected", h);
          return () => ipcRenderer2.removeListener("qrcode:detected", h);
        },
        onQrCodeCompleted: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("qrcode:completed", h);
          return () => ipcRenderer2.removeListener("qrcode:completed", h);
        },
        onQrCodeClosed: (cb) => {
          const h = () => cb();
          ipcRenderer2.on("qrcode:closed", h);
          return () => ipcRenderer2.removeListener("qrcode:closed", h);
        },
        onAccountStatusChanged: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("account:status-changed", h);
          return () => ipcRenderer2.removeListener("account:status-changed", h);
        },
        // OAuth 认证 API
        oauthStart: (opts) => ipcRenderer2.invoke("oauth:start", opts),
        oauthClose: () => ipcRenderer2.invoke("oauth:close"),
        oauthGetConfigs: () => ipcRenderer2.invoke("oauth:get-configs"),
        onOAuthOpened: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("oauth:opened", h);
          return () => ipcRenderer2.removeListener("oauth:opened", h);
        },
        onOAuthCompleted: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("oauth:completed", h);
          return () => ipcRenderer2.removeListener("oauth:completed", h);
        },
        onOAuthFailed: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("oauth:failed", h);
          return () => ipcRenderer2.removeListener("oauth:failed", h);
        },
        onOAuthClosed: (cb) => {
          const h = () => cb();
          ipcRenderer2.on("oauth:closed", h);
          return () => ipcRenderer2.removeListener("oauth:closed", h);
        },
        // 统一数据存储 API
        storeAddAccount: (account) => ipcRenderer2.invoke("store:add-account", account),
        storeGetAccount: (id) => ipcRenderer2.invoke("store:get-account", id),
        storeListAccounts: (platform) => ipcRenderer2.invoke("store:list-accounts", platform),
        storeDeleteAccount: (id) => ipcRenderer2.invoke("store:delete-account", id),
        storeAddPublishRecord: (record) => ipcRenderer2.invoke("store:add-publish-record", record),
        storeListPublishHistory: (opts) => ipcRenderer2.invoke("store:list-publish-history", opts),
        storeGetPublishStats: () => ipcRenderer2.invoke("store:get-publish-stats"),
        storeAddScheduledTask: (task) => ipcRenderer2.invoke("store:add-scheduled-task", task),
        storeListScheduledTasks: () => ipcRenderer2.invoke("store:list-scheduled-tasks"),
        storeDeleteTask: (id) => ipcRenderer2.invoke("store:delete-task", id),
        storeGetSetting: (key) => ipcRenderer2.invoke("store:get-setting", key),
        storeSetSetting: (key, value) => ipcRenderer2.invoke("store:set-setting", key, value),
        storeListCallbackLogs: (limit) => ipcRenderer2.invoke("store:list-callback-logs", limit)
      };
    }
    module2.exports = { createAccountApi: createAccountApi2 };
  }
});

// electron/preload/system.js
var require_system = __commonJS({
  "electron/preload/system.js"(exports2, module2) {
    function createSystemApi2(ipcRenderer2) {
      return {
        // 系统 API
        getVersion: () => ipcRenderer2.invoke("app:get-version"),
        getPlatform: () => ipcRenderer2.invoke("app:get-platform"),
        // 自动更新 API
        updateCheck: () => ipcRenderer2.invoke("update:check"),
        updateDownload: () => ipcRenderer2.invoke("update:download"),
        updateInstall: () => ipcRenderer2.invoke("update:install"),
        onUpdateStatus: (callback) => {
          const handler = (_event, payload) => callback(payload);
          ipcRenderer2.on("update:status", handler);
          return () => ipcRenderer2.removeListener("update:status", handler);
        },
        // 首次运行引导 API
        firstRunCheck: () => ipcRenderer2.invoke("first-run:check"),
        onFirstRunStatus: (callback) => {
          const handler = (_event, payload) => callback(payload);
          ipcRenderer2.on("first-run:status", handler);
          return () => ipcRenderer2.removeListener("first-run:status", handler);
        },
        // 平台配置 API
        platformList: () => ipcRenderer2.invoke("platform:list"),
        platformGet: (id) => ipcRenderer2.invoke("platform:get", id),
        getPlatformDefinitions: () => ipcRenderer2.invoke("platform:definitions"),
        // 敏感词预检 API
        sensitiveCheck: (text) => ipcRenderer2.invoke("sensitive:check", { text }),
        sensitiveReplace: (text) => ipcRenderer2.invoke("sensitive:replace", { text }),
        // 数据同步 API
        syncAll: () => ipcRenderer2.invoke("sync:all"),
        syncPlatform: (platform) => ipcRenderer2.invoke("sync:platform", platform),
        syncCached: () => ipcRenderer2.invoke("sync:cached"),
        // 通知 API
        showNotification: (data) => ipcRenderer2.invoke("show-notification", data),
        onNotification: (cb) => {
          const h = (_, data) => cb(data);
          ipcRenderer2.on("notification", h);
          return () => ipcRenderer2.removeListener("notification", h);
        },
        // 分屏监控 API
        webviewSetLayout: (count) => ipcRenderer2.invoke("webview:set-layout", count),
        webviewOpenTab: (opts) => ipcRenderer2.invoke("webview:open-tab", opts),
        webviewCloseTab: (tabId) => ipcRenderer2.invoke("webview:close-tab", tabId),
        webviewCloseAll: () => ipcRenderer2.invoke("webview:close-all"),
        webviewListTabs: () => ipcRenderer2.invoke("webview:list-tabs"),
        onWebviewLayoutChanged: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("webview:layout-changed", h);
          return () => ipcRenderer2.removeListener("webview:layout-changed", h);
        },
        onWebviewTabOpened: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("webview:tab-opened", h);
          return () => ipcRenderer2.removeListener("webview:tab-opened", h);
        },
        onWebviewTabClosed: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("webview:tab-closed", h);
          return () => ipcRenderer2.removeListener("webview:tab-closed", h);
        },
        onWebviewNav: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("webview:navigated", h);
          return () => ipcRenderer2.removeListener("webview:navigated", h);
        },
        onWebviewAllClosed: (cb) => {
          const h = () => cb();
          ipcRenderer2.on("webview:all-closed", h);
          return () => ipcRenderer2.removeListener("webview:all-closed", h);
        },
        // 回调服务器 API
        onCallbackReceived: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("callback:received", h);
          return () => ipcRenderer2.removeListener("callback:received", h);
        },
        // 离线模式 API
        offlineStatus: () => ipcRenderer2.invoke("offline:status"),
        offlineIsOffline: () => ipcRenderer2.invoke("offline:is-offline"),
        offlineCachedTasks: () => ipcRenderer2.invoke("offline:cached-tasks"),
        offlineAddToCache: (task) => ipcRenderer2.invoke("offline:add-to-cache", task),
        offlineClearCache: () => ipcRenderer2.invoke("offline:clear-cache"),
        onOfflineRestored: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("offline:restored", h);
          return () => ipcRenderer2.removeListener("offline:restored", h);
        },
        // Onboarding API
        onboardingComplete: () => ipcRenderer2.invoke("onboarding:complete"),
        onboardingGetSteps: () => ipcRenderer2.invoke("onboarding:get-steps"),
        onboardingStatus: () => ipcRenderer2.invoke("onboarding:status"),
        // 支付 API
        paymentCreateOrder: (options) => ipcRenderer2.invoke("payment:create-order", options),
        paymentListOrders: () => ipcRenderer2.invoke("payment:list-orders"),
        paymentGetOrder: (orderId) => ipcRenderer2.invoke("payment:get-order", orderId),
        paymentComplete: (orderId, txnId) => ipcRenderer2.invoke("payment:complete", { orderId, txnId }),
        paymentSimulate: (orderId) => ipcRenderer2.invoke("payment:simulate", { orderId }),
        paymentCancel: (orderId) => ipcRenderer2.invoke("payment:cancel", orderId),
        // 全局导航 API（快捷键触发）
        onNavigate: (cb) => {
          const h = (_, route) => cb(route);
          ipcRenderer2.on("app:navigate", h);
          return () => ipcRenderer2.removeListener("app:navigate", h);
        },
        // Analytics API
        analyticsOverview: () => ipcRenderer2.invoke("analytics:overview"),
        analyticsPlatform: (platform) => ipcRenderer2.invoke("analytics:platform", { platform }),
        analyticsPlatforms: () => ipcRenderer2.invoke("analytics:platforms"),
        // Hotkeys API
        hotkeysList: () => ipcRenderer2.invoke("hotkeys:list"),
        // Keyword API
        keywordStart: (keyword, opts) => ipcRenderer2.invoke("keyword:start", { keyword, opts }),
        keywordStop: (keyword) => ipcRenderer2.invoke("keyword:stop", { keyword }),
        keywordStatus: () => ipcRenderer2.invoke("keyword:status"),
        keywordHistory: (keyword) => ipcRenderer2.invoke("keyword:history", { keyword }),
        keywordStopAll: () => ipcRenderer2.invoke("keyword:stop-all"),
        // Proxy API
        proxyAdd: (host, port, type) => ipcRenderer2.invoke("proxy:add", { host, port, type }),
        proxyAddBatch: (proxies) => ipcRenderer2.invoke("proxy:add-batch", { proxies }),
        proxyList: () => ipcRenderer2.invoke("proxy:list"),
        proxyRemove: (id) => ipcRenderer2.invoke("proxy:remove", { id }),
        proxyTest: (id, timeout) => ipcRenderer2.invoke("proxy:test", { id, timeout }),
        proxyTestAll: (timeout) => ipcRenderer2.invoke("proxy:test-all", { timeout }),
        proxyStatus: () => ipcRenderer2.invoke("proxy:status"),
        proxyGetNext: () => ipcRenderer2.invoke("proxy:get-next"),
        proxyReset: () => ipcRenderer2.invoke("proxy:reset"),
        proxyRemoveDead: () => ipcRenderer2.invoke("proxy:remove-dead"),
        // Upload API
        uploadChunked: (filePath) => ipcRenderer2.invoke("upload:chunked", { filePath }),
        uploadCancel: () => ipcRenderer2.invoke("upload:cancel"),
        // Template API
        templateList: () => ipcRenderer2.invoke("template:list"),
        templateGet: (id) => ipcRenderer2.invoke("template:get", id),
        templateAdd: (tpl) => ipcRenderer2.invoke("template:add", tpl),
        templateUpdate: (id, updates) => ipcRenderer2.invoke("template:update", { id, updates }),
        templateDelete: (id) => ipcRenderer2.invoke("template:delete", id),
        templateListByCategory: (category) => ipcRenderer2.invoke("template:list-by-category", category),
        templateGetPresets: () => ipcRenderer2.invoke("template:get-presets"),
        // 许可证 API
        licenseInfo: () => ipcRenderer2.invoke("license:info"),
        licenseActivate: (key) => ipcRenderer2.invoke("license:activate", key),
        licenseDeactivate: () => ipcRenderer2.invoke("license:deactivate"),
        licenseActivateTrial: () => ipcRenderer2.invoke("license:activate-trial"),
        licenseHasFeature: (name) => ipcRenderer2.invoke("license:has-feature", name),
        licenseFeatures: () => ipcRenderer2.invoke("license:features"),
        // Provider API
        providerList: () => ipcRenderer2.invoke("provider:list"),
        providerCreate: (data) => ipcRenderer2.invoke("provider:create", data),
        providerUpdate: (name, data) => ipcRenderer2.invoke("provider:update", name, data),
        providerDelete: (name) => ipcRenderer2.invoke("provider:delete", name),
        providerTest: (name) => ipcRenderer2.invoke("provider:test", name),
        providerListUser: () => ipcRenderer2.invoke("provider:list-user"),
        providerGetUser: (name) => ipcRenderer2.invoke("provider:get-user", name),
        providerSetUserKey: (name, apiKey, baseUrl) => ipcRenderer2.invoke("provider:set-user-key", name, apiKey, baseUrl),
        providerDeleteUserKey: (name) => ipcRenderer2.invoke("provider:delete-user-key", name),
        // AI 生成 API（Phase 2）
        aiListProviders: (type) => ipcRenderer2.invoke("ai:list-providers", type),
        aiGetConfig: (providerId) => ipcRenderer2.invoke("ai:get-config", providerId),
        aiListModels: (providerId) => ipcRenderer2.invoke("ai:list-models", providerId),
        aiGenerate: (type, provider, params) => ipcRenderer2.invoke("ai:generate", { type, provider, params }),
        aiTestConnection: (providerId) => ipcRenderer2.invoke("ai:test-connection", providerId),
        aiSaveConfig: (providerId, config) => ipcRenderer2.invoke("ai:save-config", providerId, config),
        aiIsConfigured: () => ipcRenderer2.invoke("ai:is-configured"),
        aiGenerateTitles: (topic) => ipcRenderer2.invoke("ai:generate-titles", topic),
        aiEnhanceContent: (content, style) => ipcRenderer2.invoke("ai:enhance-content", content, style),
        aiGenerateSummary: (content) => ipcRenderer2.invoke("ai:generate-summary", content),
        onAIProgress: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("ai:progress", h);
          return () => ipcRenderer2.removeListener("ai:progress", h);
        },
        onAIComplete: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("ai:complete", h);
          return () => ipcRenderer2.removeListener("ai:complete", h);
        },
        onAIError: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("ai:error", h);
          return () => ipcRenderer2.removeListener("ai:error", h);
        },
        // 视频处理 API（Phase 2）
        videoStatus: () => ipcRenderer2.invoke("video:status"),
        videoListProcessTypes: () => ipcRenderer2.invoke("video:list-process-types"),
        videoListAnalyzeTypes: () => ipcRenderer2.invoke("video:list-analyze-types"),
        videoListStockSources: () => ipcRenderer2.invoke("video:list-stock-sources"),
        videoProcess: (type, params) => ipcRenderer2.invoke("video:process", { type, params }),
        videoAnalyze: (type, filePath) => ipcRenderer2.invoke("video:analyze", type, filePath),
        videoMixAudio: (params) => ipcRenderer2.invoke("video:mix-audio", params),
        videoSearchStock: (query, source, limit) => ipcRenderer2.invoke("video:search-stock", query, source, limit),
        videoGenerateSubtitle: (audioPath, language) => ipcRenderer2.invoke("video:generate-subtitle", audioPath, language),
        onVideoProgress: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("video:progress", h);
          return () => ipcRenderer2.removeListener("video:progress", h);
        },
        onVideoComplete: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("video:complete", h);
          return () => ipcRenderer2.removeListener("video:complete", h);
        },
        onVideoError: (callback) => {
          const h = (_e, p) => callback(p);
          ipcRenderer2.on("video:error", h);
          return () => ipcRenderer2.removeListener("video:error", h);
        },
        // 批量发布 API（批量管理工具，不是单次发布）
        batchCreate: (batch) => ipcRenderer2.invoke("batch:create", batch),
        batchExecute: (id) => ipcRenderer2.invoke("batch:execute", id),
        batchSchedule: (id) => ipcRenderer2.invoke("batch:schedule", id),
        batchList: () => ipcRenderer2.invoke("batch:list"),
        batchGet: (id) => ipcRenderer2.invoke("batch:get", id),
        batchDelete: (id) => ipcRenderer2.invoke("batch:delete", id),
        batchDuplicateArticle: (article) => ipcRenderer2.invoke("batch:duplicate-article", article),
        onBatchProgress: (cb) => {
          const h = (_, d) => cb(d);
          ipcRenderer2.on("batch:progress", h);
          return () => ipcRenderer2.removeListener("batch:progress", h);
        },
        // 模型服务商管理 API（5 类模型 CRUD + 默认设置 + 调用日志）
        modelProviderList: (category) => ipcRenderer2.invoke("model-provider:list", category),
        modelProviderGet: (id) => ipcRenderer2.invoke("model-provider:get", id),
        modelProviderCreate: (data) => ipcRenderer2.invoke("model-provider:create", data),
        modelProviderUpdate: (id, data) => ipcRenderer2.invoke("model-provider:update", id, data),
        modelProviderDelete: (id) => ipcRenderer2.invoke("model-provider:delete", id),
        modelProviderSetDefault: (category, id) => ipcRenderer2.invoke("model-provider:set-default", category, id),
        modelProviderGetDefault: (category) => ipcRenderer2.invoke("model-provider:get-default", category),
        modelProviderTest: (id) => ipcRenderer2.invoke("model-provider:test", id),
        modelProviderPresets: (category) => ipcRenderer2.invoke("model-provider:presets", category),
        modelProviderIsConfigured: (category) => ipcRenderer2.invoke("model-provider:is-configured", category),
        modelProviderLogs: (filter) => ipcRenderer2.invoke("model-provider:logs", filter),
        modelProviderCleanLogs: (days) => ipcRenderer2.invoke("model-provider:clean-logs", days)
      };
    }
    module2.exports = { createSystemApi: createSystemApi2 };
  }
});

// electron/preload/project.js
var require_project = __commonJS({
  "electron/preload/project.js"(exports2, module2) {
    function createProjectApi2(ipcRenderer2) {
      return {
        project: {
          list: () => ipcRenderer2.invoke("project:list"),
          get: (projectId) => ipcRenderer2.invoke("project:get", { projectId }),
          del: (projectId) => ipcRenderer2.invoke("project:delete", { projectId })
        }
      };
    }
    module2.exports = { createProjectApi: createProjectApi2 };
  }
});

// electron/preload/board.js
var require_board = __commonJS({
  "electron/preload/board.js"(exports2, module2) {
    function createBoardApi2(ipcRenderer2) {
      const updateListeners = /* @__PURE__ */ new Set();
      ipcRenderer2.on("board:update", (_event, payload) => {
        const board = payload && payload.board;
        if (board) {
          for (const cb of updateListeners) {
            try {
              cb(board);
            } catch (_) {
              void _;
            }
          }
        }
      });
      return {
        board: {
          subscribe: (projectId) => ipcRenderer2.invoke("board:subscribe", { projectId }),
          unsubscribe: () => ipcRenderer2.invoke("board:unsubscribe"),
          get: (projectId) => ipcRenderer2.invoke("board:get", { projectId }),
          onUpdate: (callback) => {
            updateListeners.add(callback);
            return () => updateListeners.delete(callback);
          }
        }
      };
    }
    module2.exports = { createBoardApi: createBoardApi2 };
  }
});

// electron/preload/contact-sheet.js
var require_contact_sheet = __commonJS({
  "electron/preload/contact-sheet.js"(exports2, module2) {
    function createContactSheetApi2(ipcRenderer2) {
      const approvalListeners = /* @__PURE__ */ new Set();
      ipcRenderer2.on("approval:request", (_event, payload) => {
        if (payload && payload.type === "contact_sheet") {
          for (const cb of approvalListeners) {
            try {
              cb(payload);
            } catch (_) {
              void _;
            }
          }
        }
      });
      return {
        contactSheet: {
          list: (projectId) => ipcRenderer2.invoke("contact-sheet:list", { projectId }),
          approve: (sceneId, selectedTakeId) => ipcRenderer2.invoke("contact-sheet:approve", { sceneId, selectedTakeId }),
          reject: (sceneId, feedback) => ipcRenderer2.invoke("contact-sheet:reject", { sceneId, feedback }),
          onApprovalRequest: (callback) => {
            approvalListeners.add(callback);
            return () => approvalListeners.delete(callback);
          }
        }
      };
    }
    module2.exports = { createContactSheetApi: createContactSheetApi2 };
  }
});

// electron/preload/approval-gate.js
var require_approval_gate = __commonJS({
  "electron/preload/approval-gate.js"(exports2, module2) {
    function createApprovalGateApi2(ipcRenderer2) {
      const gateListeners = /* @__PURE__ */ new Set();
      ipcRenderer2.on("approval:request", (_event, payload) => {
        if (payload && payload.type === "approval_gate") {
          for (const cb of gateListeners) {
            try {
              cb(payload);
            } catch (_) {
              void _;
            }
          }
        }
      });
      return {
        approvalGate: {
          get: (projectId) => ipcRenderer2.invoke("approval-gate:get", { projectId }),
          approve: (gateId, decision, modification) => ipcRenderer2.invoke("approval-gate:approve", { gateId, decision, modification }),
          onApprovalRequest: (callback) => {
            gateListeners.add(callback);
            return () => gateListeners.delete(callback);
          }
        }
      };
    }
    module2.exports = { createApprovalGateApi: createApprovalGateApi2 };
  }
});

// electron/preload/replay.js
var require_replay = __commonJS({
  "electron/preload/replay.js"(exports2, module2) {
    function createReplayApi2(ipcRenderer2) {
      return {
        replay: {
          get: (projectId) => ipcRenderer2.invoke("replay:get", { projectId })
        }
      };
    }
    module2.exports = { createReplayApi: createReplayApi2 };
  }
});

// electron/preload/identity.js
var require_identity = __commonJS({
  "electron/preload/identity.js"(exports2, module2) {
    function createIdentityApi2(ipcRenderer2) {
      return {
        identityGetState: () => ipcRenderer2.invoke("identity:get-state"),
        identitySignIn: () => ipcRenderer2.invoke("identity:sign-in"),
        identitySwitchAccount: () => ipcRenderer2.invoke("identity:switch-account"),
        identitySignOut: () => ipcRenderer2.invoke("identity:sign-out"),
        onIdentityStateChanged: (callback) => {
          const handler = (_event, state) => callback(state);
          ipcRenderer2.on("identity:state-changed", handler);
          return () => ipcRenderer2.removeListener("identity:state-changed", handler);
        }
      };
    }
    module2.exports = { createIdentityApi: createIdentityApi2 };
  }
});

// electron/preload/access-control.js
var require_access_control = __commonJS({
  "electron/preload/access-control.js"(exports2, module2) {
    "use strict";
    var AUTH_ERROR = -3;
    var ADMIN_ONLY_METHODS2 = [
      "paymentComplete",
      "paymentSimulate",
      "proxyTest",
      "proxyTestAll",
      "proxyReset"
    ];
    var PUBLIC_METHODS2 = [
      "getVersion",
      "getPlatform",
      "updateCheck",
      "updateDownload",
      "updateInstall",
      "onUpdateStatus",
      "firstRunCheck",
      "onFirstRunStatus",
      "showNotification",
      "onNotification",
      "onNavigate",
      "onboardingComplete",
      "onboardingGetSteps",
      "onboardingStatus",
      "licenseInfo",
      "licenseActivate",
      "licenseDeactivate",
      "licenseActivateTrial",
      "licenseHasFeature",
      "licenseFeatures",
      "paymentCreateOrder",
      "paymentListOrders",
      "paymentGetOrder",
      "paymentCancel",
      "authOpenLogin",
      "authClose",
      "onAuthViewOpened",
      "onAuthCompleted",
      "onAuthViewClosed",
      "authLoginSilent",
      "authOpenQrCodeLogin",
      "authQrCodeClose",
      "onQrCodeOpened",
      "onQrCodeDetected",
      "onQrCodeCompleted",
      "onQrCodeClosed",
      "oauthStart",
      "oauthClose",
      "oauthGetConfigs",
      "onOAuthOpened",
      "onOAuthCompleted",
      "onOAuthFailed",
      "onOAuthClosed",
      "platformList",
      "platformGet",
      "getPlatformDefinitions",
      "offlineStatus",
      "offlineIsOffline",
      "offlineCachedTasks",
      "offlineAddToCache",
      "offlineClearCache",
      "onOfflineRestored",
      "onCallbackReceived",
      "hotkeysList",
      "sensitiveCheck",
      "sensitiveReplace",
      "syncAll",
      "syncPlatform",
      "syncCached",
      "webviewSetLayout",
      "webviewOpenTab",
      "webviewCloseTab",
      "webviewCloseAll",
      "webviewListTabs",
      "onWebviewLayoutChanged",
      "onWebviewTabOpened",
      "onWebviewTabClosed",
      "onWebviewNav",
      "onWebviewAllClosed",
      "modelProviderList",
      "modelProviderGet",
      "modelProviderCreate",
      "modelProviderUpdate",
      "modelProviderDelete",
      "modelProviderSetDefault",
      "modelProviderGetDefault",
      "modelProviderTest",
      "modelProviderPresets",
      "modelProviderIsConfigured",
      "modelProviderLogs",
      "modelProviderCleanLogs",
      "renderGetStatus",
      "renderInstallDeps",
      "onRenderInstallProgress",
      "pipelineList",
      "pipelineGet",
      "identityGetState",
      "identitySignIn",
      "identitySwitchAccount",
      "identitySignOut",
      "onIdentityStateChanged"
    ];
    function hasAccess(currentLevel, requiredLevel) {
      if (requiredLevel === "public") return true;
      if (requiredLevel === "authenticated") {
        return currentLevel === "authenticated" || currentLevel === "admin";
      }
      return currentLevel === "admin";
    }
    function requiredLevelForMethod(methodName, inheritedLevel = "public") {
      if (inheritedLevel !== "public") return inheritedLevel;
      if (ADMIN_ONLY_METHODS2.includes(methodName)) return "admin";
      if (PUBLIC_METHODS2.includes(methodName)) return "public";
      return "authenticated";
    }
    function createPermissionError(methodName) {
      const error = new Error(`许可证权限不足，无法调用 ${methodName}`);
      error.name = "LicensePermissionError";
      error.code = AUTH_ERROR;
      return error;
    }
    function readAccessLevel(getCurrentAccessLevel) {
      try {
        const level = getCurrentAccessLevel();
        if (level === "public" || level === "authenticated" || level === "admin") return level;
      } catch (_) {
        void _;
      }
      return "public";
    }
    function createDynamicAccessApi2(api, getCurrentAccessLevel, inheritedLevel = "public") {
      const exposed = {};
      const initialLevel = readAccessLevel(getCurrentAccessLevel);
      for (const key of Object.keys(api)) {
        const value = api[key];
        const requiredLevel = requiredLevelForMethod(key, inheritedLevel);
        if (requiredLevel === "admin" && initialLevel !== "admin") continue;
        if (typeof value === "function") {
          if (requiredLevel === "public") {
            exposed[key] = value;
            continue;
          }
          exposed[key] = function(...args) {
            if (!hasAccess(readAccessLevel(getCurrentAccessLevel), requiredLevel)) {
              throw createPermissionError(key);
            }
            return value.apply(this, args);
          };
        } else if (value && typeof value === "object") {
          exposed[key] = createDynamicAccessApi2(value, getCurrentAccessLevel, requiredLevel);
        }
      }
      return exposed;
    }
    function filterApiByAccessLevel2(api, level) {
      const filtered = {};
      for (const key of Object.keys(api)) {
        const value = api[key];
        const requiredLevel = requiredLevelForMethod(key);
        if (!hasAccess(level, requiredLevel)) continue;
        if (typeof value === "function") filtered[key] = value;
        else if (value && typeof value === "object") filtered[key] = value;
      }
      return filtered;
    }
    module2.exports = {
      ADMIN_ONLY_METHODS: ADMIN_ONLY_METHODS2,
      PUBLIC_METHODS: PUBLIC_METHODS2,
      createDynamicAccessApi: createDynamicAccessApi2,
      filterApiByAccessLevel: filterApiByAccessLevel2,
      hasAccess
    };
  }
});

// electron/preload/index.js
var { contextBridge, ipcRenderer } = require("electron");
var { createPublishApi } = require_publish();
var { createAccountApi } = require_account();
var { createSystemApi } = require_system();
var { createProjectApi } = require_project();
var { createBoardApi } = require_board();
var { createContactSheetApi } = require_contact_sheet();
var { createApprovalGateApi } = require_approval_gate();
var { createReplayApi } = require_replay();
var { createIdentityApi } = require_identity();
var {
  ADMIN_ONLY_METHODS,
  PUBLIC_METHODS,
  createDynamicAccessApi,
  filterApiByAccessLevel
} = require_access_control();
function getAccessLevel() {
  try {
    if (typeof ipcRenderer.sendSync === "function") {
      const level = ipcRenderer.sendSync("auth:get-access-level");
      if (level === "admin" || level === "authenticated" || level === "public") {
        return level;
      }
    }
  } catch (_) {
    void _;
  }
  const isDevMode = process.env.NODE_ENV === "development" || process.env.ELECTRON_IS_DEV === "1";
  return isDevMode ? "admin" : "public";
}
var fullApi = {
  ...createPublishApi(ipcRenderer),
  ...createAccountApi(ipcRenderer),
  ...createSystemApi(ipcRenderer),
  ...createProjectApi(ipcRenderer),
  ...createBoardApi(ipcRenderer),
  ...createContactSheetApi(ipcRenderer),
  ...createApprovalGateApi(ipcRenderer),
  ...createReplayApi(ipcRenderer),
  ...createIdentityApi(ipcRenderer)
};
var exposedApi = createDynamicAccessApi(fullApi, getAccessLevel);
exposedApi.getAccessLevel = getAccessLevel;
contextBridge.exposeInMainWorld("electronAPI", exposedApi);
module.exports = {
  getAccessLevel,
  filterApiByAccessLevel,
  createDynamicAccessApi,
  ADMIN_ONLY_METHODS,
  PUBLIC_METHODS
};
