/**
 * 发布相关 preload API（Phase 3.3 拆分自原 preload.js）
 *
 * 工厂函数：createPublishApi(ipcRenderer)
 *   - ipcRenderer 由调用方（preload/index.js）注入，便于测试 mock
 *   - 不在此处 require('electron')，保持子模块独立可测
 *
 * 涵盖方法（与原 preload.js 完全一致，不改变方法名/IPC 通道/参数顺序）：
 *   - 发布：publishWechat / publishBatch / listAccounts
 *   - 渲染：renderStart / renderCancel / renderGetStatus / renderInstallDeps
 *           onRenderProgress / onRenderComplete / onRenderError / onRenderInstallProgress
 *           renderListCompositions / renderGetComposition / renderValidateProps
 *   - 管线（对象）：pipelines.list / pipelines.get
 *   - 内容情报：intelligenceSuggestTags / intelligenceGetOptimalTime
 *   - 队列：getQueueStatus / getQueueHistory / cancelTask
 *   - 历史：historyList / historyGet
 *   - 仪表盘：dashboardStats
 *   - 定时发布：schedulerCreate / schedulerList / schedulerCancel
 *   - 进度监听：onProgress
 *   - Pipeline：pipelineList / pipelineGet / pipelineStart / pipelinePause / pipelineResume
 *               pipelineCancel / pipelineStatus / pipelineAdvance / pipelineHistory / pipelineFetch
 *   - 云发布：cloudPublishSubmit / cloudPublishListTasks / cloudPublishGetTask / cloudPublishPlatforms
 *   - URL 采集：urlCollectFetch
 *   - 爆款分析：viralAnalyze / viralGenerate / viralTrending
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

    // 管线 API（嵌套对象）
    pipelines: {
      list: () => ipcRenderer.invoke('pipeline:list'),
      get: (name) => ipcRenderer.invoke('pipeline:get', name),
    },

    // 内容情报 API（预存未注册）
    intelligenceSuggestTags: (content, opts) => ipcRenderer.invoke('intelligence:suggest-tags', { content, opts }),
    intelligenceGetOptimalTime: (keyword) => ipcRenderer.invoke('intelligence:get-optimal-time', { keyword }),

    // 队列 API
    getQueueStatus: () => ipcRenderer.invoke('queue:status'),
    getQueueHistory: () => ipcRenderer.invoke('queue:history'),
    cancelTask: (taskId) => ipcRenderer.invoke('queue:cancel', taskId),

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

    // Pipeline 管线 API（Phase 3）
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
    urlCollectFetch: (url) => ipcRenderer.invoke('url-collect:fetch', url),

    // Viral Analysis API
    viralAnalyze: (content) => ipcRenderer.invoke('viral:analyze', content),
    viralGenerate: (prompt) => ipcRenderer.invoke('viral:generate', prompt),
    viralTrending: () => ipcRenderer.invoke('viral:trending'),
  }
}

module.exports = { createPublishApi }
