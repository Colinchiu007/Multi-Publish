// @ts-check
/**
 * AI 生成 IPC handlers
 */

function registerHandlers(ipcMain, deps) {
  const { aiGenerator, BrowserWindow, log } = deps

  ipcMain.handle('ai:list-providers', (_event, type) => {
    return aiGenerator.listProviders(type || null);
  })

  ipcMain.handle('ai:get-config', (_event, providerId) => {
    return aiGenerator.getProviderConfig(providerId);
  })

  ipcMain.handle('ai:list-models', (_event, providerId) => {
    return aiGenerator.listModels(providerId);
  })

  ipcMain.handle('ai:generate', async (event, { type, provider, params }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const onProgress = (p) => win?.webContents.send('ai:progress', p)
    try {
      const result = await aiGenerator.generate(type, provider, params, onProgress)
      win?.webContents.send('ai:complete', result)
      return result
    } catch (e) {
      const err = { success: false, error: e.message }
      win?.webContents.send('ai:error', err)
      return err
    }
  })

  ipcMain.handle('ai:test-connection', async (_event, providerId) => {
    return await aiGenerator.testConnection(providerId)
  })

  ipcMain.handle('ai:save-config', (_event, providerId, config) => {
    return aiGenerator.updateProviderConfig(providerId, config)
  })
}

module.exports = registerHandlers
