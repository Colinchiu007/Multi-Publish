// @ts-check
/**
 * AuthView CDP — WebContentsView 调试器检测模块
 */

/**
 * 为 View 附加 CDP 登录检测（蚂蚁搬家公司方案）
 * @param {import('electron').WebContentsView} view
 * @param {Function} onLoginSuccess
 */
function attachCdpDetection(view, onLoginSuccess) {
  try {
    view.webContents.debugger.attach()
    // M-1 修复：sendCommand 返回 Promise，必须 .catch() 否则 rejection 无人处理
    view.webContents.debugger.sendCommand('Fetch.enable', {
      patterns: [
        { urlPattern: '*passport.bilibili.com/login*', resourceType: 'XHR', requestStage: 'Response' },
        { urlPattern: '*passport.bilibili.com/x/passport-login/web/*', resourceType: 'XHR', requestStage: 'Response' },
      ]
    }).catch(function () { /* Fetch.enable 失败忽略 */ })
    view.webContents.debugger.on('message', async (/** @type {any} */ _, /** @type {string} */ method, /** @type {any} */ params) => {
      if (method !== 'Fetch.requestPaused') return
      try {
        const { body, base64Encoded } = await view.webContents.debugger.sendCommand(
          'Fetch.getResponseBody', { requestId: params.requestId }
        )
        const data = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString() : body)
        if (isLoginSuccess(data)) onLoginSuccess(data)
      } catch (_e) { /* ignore */ }
      // M-2 修复：sendCommand 返回 Promise，try/catch 无法捕获 async rejection，需 .catch()
      view.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId: params.requestId }).catch(function () { /* ignore */ })
    })
  } catch (_e) { /* debugger may already be attached */ }
}

/**
 * 判断 API 响应是否为登录成功信号
 * @param {any} data
 * @returns {boolean}
 */
function isLoginSuccess(data) {
  if (!data || !data.data) return false
  return (data.code === 0 && (
    data.data.isLogin === true ||
    !!data.data.dedeUserID ||
    !!data.data.mid ||
    !!data.data.access_token
  )) || data.data.isLogin === true
}

module.exports = { attachCdpDetection, isLoginSuccess }
