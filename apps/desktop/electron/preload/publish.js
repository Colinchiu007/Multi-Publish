/**
 * 发布相关 preload API（Phase 3.3 拆分自原 preload.js）
 *
 * 工厂函数：createPublishApi(ipcRenderer)
 *   - ipcRenderer 由调用方（preload/index.js）注入，便于测试 mock
 *   - 不在此处 require('electron')，保持子模块独立可测
 *
 * 涵盖方法（保持公开方法名和 IPC 通道稳定）：
 *   - 发布：publishWechat / publishBatch / listAccounts
 *   - 渲染：renderStart / renderCancel / renderGetStatus / renderInstallDeps
 *           onRenderProgress / onRenderComplete / onRenderError / onRenderInstallProgress
 *           renderListCompositions / renderGetComposition / renderValidateProps
 *   - 流水线（对象）：pipelines.list / pipelines.get
 *   - 内容情报：intelligenceSuggestTags / intelligenceGetOptimalTime
 *   - 队列：getQueueStatus / getQueueHistory / cancelTask / retryTask
 *   - 历史：historyList / historyGet
 *   - 仪表盘：dashboardStats
 *   - 定时发布：schedulerCreate / schedulerList / schedulerCancel
 *   - 进度监听：onProgress
 *   - Pipeline：pipelineList / pipelineGet / pipelineStart / pipelinePause / pipelineResume
 *               pipelineCancel / pipelineStatus / pipelineAdvance / pipelineHistory / pipelineFetch
 *   - 云发布：cloudPublishSubmit / cloudPublishListTasks / cloudPublishGetTask / cloudPublishPlatforms
 *   - URL 采集：urlCollectFetch
 *   - 爆款分析：viralAnalyze / viralGenerate / viralTrending
 *   - 评论管理：commentList / commentReply / commentStartPolling / commentStopPolling / commentStatus / onCommentReplied
 */

/**
 * 创建发布相关 API 对象
 * @param {Electron.IpcRenderer} ipcRenderer - 由 index.js 注入
 * @returns {Object} 发布相关方法集合
 */
function createPublishApi(ipcRenderer) {
  return {
    // 发布 API
    publishWechat: (articleData) => ipcRenderer.invoke('publish:wechat', articleData),
    publishBatch: (platforms, article) => ipcRenderer.invoke('publish:batch', { platforms, article }),
    listAccounts: () => ipcRenderer.invoke('accounts:list'),

    // 渲染 API
    renderStart: (data) => ipcRenderer.invoke('render:start', data),
    renderCancel: () => ipcRenderer.invoke('render:cancel'),
    renderGetStatus: () => ipcRenderer.invoke('render:status'),
    renderInstallDeps: () => ipcRenderer.invoke('render:install-deps'),
    onRenderProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:progress', h); return () => ipcRenderer.removeListener('render:progress', h); },
    onRenderComplete: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:complete', h); return () => ipcRenderer.removeListener('render:complete', h); },
    onRenderError: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:error', h); return () => ipcRenderer.removeListener('render:error', h); },
    onRenderInstallProgress: (callback) => { const h = (_e, p) => callback(p); ipcRenderer.on('render:install-progress', h); return () => ipcRenderer.removeListener('render:install-progress', h); },
    renderListCompositions: () => ipcRenderer.invoke('render:list-compositions'),
    renderGetComposition: (id) => ipcRenderer.invoke('render:get-composition', id),
    renderValidateProps: (compositionId, props) => ipcRenderer.invoke('render:validate-props', compositionId, props),

    // 流水线 API（嵌套对象）
    pipelines: {
      list: () => ipcRenderer.invoke('pipeline:list'),
      get: (name) => ipcRenderer.invoke('pipeline:get', name),
    },

    // 内容情报 API（已注册于 services/content-intelligence.js）
    intelligenceSuggestTags: (content, opts) => ipcRenderer.invoke('intelligence:suggest-tags', { content, opts }),
    intelligenceGetOptimalTime: (keyword) => ipcRenderer.invoke('intelligence:get-optimal-time', { keyword }),
    intelligenceSearch: (query, opts) => ipcRenderer.invoke('intelligence:search', { query, opts }),
    // handler 解构 { title, opts }，前端用 query 作为标题
    intelligenceSearchTitles: (query, opts) => ipcRenderer.invoke('intelligence:search-titles', { title: query, opts }),
    intelligenceFetchTrending: (opts) => ipcRenderer.invoke('intelligence:fetch-trending', opts),
    // handler 解构 { text, opts }，前端用 url 作为搜索文本
    intelligenceFindReferences: (url, opts) => ipcRenderer.invoke('intelligence:find-references', { text: url, opts }),
    // handler 解构 { title, opts }，前端传 { keyword, sampleSize }
    intelligenceGetBenchmark: (opts) => {
      const o = opts || {}
      return ipcRenderer.invoke('intelligence:get-benchmark', { title: o.keyword || o.title, opts: o })
    },

    // 队列 API
    getQueueStatus: () => ipcRenderer.invoke('queue:status'),
    getQueueHistory: () => ipcRenderer.invoke('queue:history'),
    cancelTask: (taskId) => ipcRenderer.invoke('queue:cancel', taskId),
    retryTask: (taskId) => ipcRenderer.invoke('queue:retry', taskId),

    // 发布历史 API
    historyList: (opts) => ipcRenderer.invoke('history:list', opts),
    historyGet: (id) => ipcRenderer.invoke('history:get', id),

    // 发布统计 API
    dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),

    // 定时发布 API
    schedulerCreate: (schedule) => ipcRenderer.invoke('scheduler:create', schedule),
    schedulerList: () => ipcRenderer.invoke('scheduler:list'),
    schedulerCancel: (id) => ipcRenderer.invoke('scheduler:cancel', id),

    // 进度监听
    onProgress: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('publish:progress', handler)
      return () => ipcRenderer.removeListener('publish:progress', handler)
    },

    // Pipeline 流水线 API（Phase 3）
    pipelineList: () => ipcRenderer.invoke('pipeline:list'),
    pipelineGet: (name) => ipcRenderer.invoke('pipeline:get', name),
    pipelineStart: (name, params) => ipcRenderer.invoke('pipeline:start', name, params),
    pipelinePause: () => ipcRenderer.invoke('pipeline:pause'),
    pipelineResume: () => ipcRenderer.invoke('pipeline:resume'),
    pipelineCancel: () => ipcRenderer.invoke('pipeline:cancel'),
    pipelineStatus: (name) => ipcRenderer.invoke('pipeline:status', name),
    pipelineAdvance: () => ipcRenderer.invoke('pipeline:advance'),
    pipelineHistory: () => ipcRenderer.invoke('pipeline:history'),
    pipelineFetch: (name) => ipcRenderer.invoke('pipeline:fetch', name),

    // Cloud Publisher API
    cloudPublishSubmit: (params) => ipcRenderer.invoke('cloud-publisher:submit', params),
    cloudPublishListTasks: () => ipcRenderer.invoke('cloud-publisher:list-tasks'),
    cloudPublishGetTask: (taskId) => ipcRenderer.invoke('cloud-publisher:get-task', taskId),
    cloudPublishPlatforms: () => ipcRenderer.invoke('cloud-publisher:platforms'),

    // URL Collect API
    urlCollectFetch: (url) => ipcRenderer.invoke('url-collect:fetch', { url }),

    // Viral Analysis API
    viralAnalyze: (articles, topic) => ipcRenderer.invoke('viral:analyze', { articles, topic }),
    viralGenerate: (opts) => ipcRenderer.invoke('viral:generate', opts),
    viralTrending: (articles) => ipcRenderer.invoke('viral:trending', { articles }),

    // Draft API
    draftSave: (draft) => ipcRenderer.invoke('draftSave', draft),
    draftList: () => ipcRenderer.invoke('draftList'),
    draftDelete: (draftId) => ipcRenderer.invoke('draftDelete', draftId),
    // Comment Management API (PRD F13)
    commentList: (platform, accountId, maxDays) => ipcRenderer.invoke('comment:list', { platform, accountId, maxDays }),
    commentReply: (platform, accountId, commentId, content) => ipcRenderer.invoke('comment:reply', { platform, accountId, commentId, content }),
    commentStartPolling: (opts = {}) => ipcRenderer.invoke('comment:start-polling', {
      platform: opts.platform,
      accountId: opts.accountId,
      interval: opts.interval,
      maxDays: opts.maxDays,
      template: opts.template,
    }),
    commentStopPolling: (key) => ipcRenderer.invoke('comment:stop-polling', { key }),
    commentStatus: () => ipcRenderer.invoke('comment:status'),
    onCommentReplied: (cb) => {
      const h = (_, data) => cb(data); ipcRenderer.on('comment:replied', h); return () => ipcRenderer.removeListener('comment:replied', h)
    },
  }
}

module.exports = { createPublishApi }
