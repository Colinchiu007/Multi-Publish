/**
 * AuthView CDP 鈥?WebContentsView 璋冭瘯鍣ㄦ娴嬫ā鍧? */

/**
 * 涓?View 闄勫姞 CDP 鐧诲綍妫€娴嬶紙铓佸皬浜屾柟妗堬級
 */
function attachCdpDetection(view, onLoginSuccess) {
  try {
    view.webContents.debugger.attach()
    view.webContents.debugger.sendCommand('Fetch.enable', {
      patterns: [
        { urlPattern: '*passport.bilibili.com/login*', resourceType: 'XHR', requestStage: 'Response' },
        { urlPattern: '*passport.bilibili.com/x/passport-login/web/*', resourceType: 'XHR', requestStage: 'Response' },
      ]
    })
    view.webContents.debugger.on('message', async (_, method, params) => {
      if (method !== 'Fetch.requestPaused') return
      try {
        const { body, base64Encoded } = await view.webContents.debugger.sendCommand(
          'Fetch.getResponseBody', { requestId: params.requestId }
        )
        const data = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString() : body)
        if (isLoginSuccess(data)) onLoginSuccess(data)
      // eslint-disable-next-line no-unused-vars
      } catch (e) { /* ignore */ }
      // eslint-disable-next-line no-unused-vars
      try { view.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId: params.requestId }) } catch (e) { /* ignore */ }
    })
  // eslint-disable-next-line no-unused-vars
  } catch (e) { /* debugger may already be attached */ }
}

/**
 * 鍒ゆ柇 API 鍝嶅簲鏄惁涓虹櫥褰曟垚鍔熶俊鍙? */
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