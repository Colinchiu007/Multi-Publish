// @ts-check
/**
 * AI 生成 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { aiGenerator, aiWriter, BrowserWindow, log } = deps

  ipcMain.handle('ai:list-providers', (_event, type) => {
    try {
      return { code: 0, data: aiGenerator.listProviders(type || null) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('ai:get-config', (_event, providerId) => {
    try {
      return { code: 0, data: aiGenerator.getProviderConfig(providerId) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('ai:list-models', (_event, providerId) => {
    try {
      return { code: 0, data: aiGenerator.listModels(providerId) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  })

  ipcMain.handle('ai:generate', async (event, arg) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (p) => win?.webContents.send('ai:progress', p)
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { type, provider, params } = arg
      const result = await aiGenerator.generate(type, provider, params, onProgress)
      win?.webContents.send('ai:complete', result)
      return { code: 0, data: result }
    } catch (e) {
      const err = { code: EC.REQUEST_ERROR, message: e.message }
      win?.webContents.send('ai:error', err)
      return err
    }
  })

  ipcMain.handle('ai:test-connection', async (_event, providerId) => {
    try {
      return { code: 0, data: await aiGenerator.testConnection(providerId) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('ai:save-config', (_event, providerId, config) => {
    try {
      return { code: 0, data: aiGenerator.updateProviderConfig(providerId, config) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  // AiWriter 辅助写作 API（AiWriterPanel.vue 使用）
  ipcMain.handle('ai:is-configured', () => {
    try {
      return { code: 0, data: aiWriter.isConfigured() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('ai:generate-titles', async (_event, topic) => {
    try {
      const titles = await aiWriter.generateTitles(topic)
      return { code: 0, data: titles }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('ai:enhance-content', async (_event, content, style) => {
    try {
      const enhanced = await aiWriter.enhanceContent(content, style)
      return { code: 0, data: enhanced }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  ipcMain.handle('ai:generate-summary', async (_event, content) => {
    try {
      const summary = await aiWriter.generateSummary(content)
      return { code: 0, data: summary }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
