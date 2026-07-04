/**
 * AI Writer IPC handlers
 * 桥接 AiWriter 模块到前端
 */
function registerHandlers(ipcMain, deps) {
  let aiWriter = deps.aiWriter

  ipcMain.handle("ai:generate-titles", async function(event, topic) {
    try {
      let titles = await aiWriter.generateTitles(topic)
      return { code: 0, data: titles }
    } catch (e) { return { code: -1, message: e.message, data: [] } }
  })

  ipcMain.handle("ai:generate-summary", async function(event, content) {
    try {
      let summary = await aiWriter.generateSummary(content)
      return { code: 0, data: summary }
    } catch (e) { return { code: -1, message: e.message, data: "" } }
  })

  ipcMain.handle("ai:enhance-content", async function(event, content, style) {
    try {
      let result = await aiWriter.enhanceContent(content, style)
      return { code: 0, data: result }
    } catch (e) { return { code: -1, message: e.message, data: content } }
  })

  ipcMain.handle("ai:is-configured", async function() {
    try {
      return { code: 0, data: aiWriter.isConfigured() }
    } catch (e) { return { code: -1, message: e.message, data: false } }
  })
}

module.exports = registerHandlers
