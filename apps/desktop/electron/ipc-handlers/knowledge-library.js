// @ts-check
/**
 * 知识库 IPC handlers
 */
function registerHandlers(ipcMain, deps) {
  const { withSenderCheck } = require('./helpers')
  const EC = require('../core/error-codes').ERROR
  const { knowledgeLibraryService } = deps

  if (!knowledgeLibraryService) return

  // ─── 爆款库 ───
  ipcMain.handle('knowledge-library:add-viral', withSenderCheck(async (_event, item) => {
    try { return knowledgeLibraryService.addToViral(item) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:add-viral-batch', withSenderCheck(async (_event, items) => {
    try { return knowledgeLibraryService.addViralBatch(items) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:list-viral', async (_event, params) => {
    try { return knowledgeLibraryService.listViral(params) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('knowledge-library:get-viral', async (_event, id) => {
    try { return knowledgeLibraryService.getViral(id) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('knowledge-library:update-viral', withSenderCheck(async (_event, id, updates) => {
    try { return knowledgeLibraryService.updateViral(id, updates) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:delete-viral', withSenderCheck(async (_event, id) => {
    try { return knowledgeLibraryService.deleteViral(id) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:search-viral', async (_event, query, limit) => {
    try { return knowledgeLibraryService.searchViral(query, limit) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })

  // ─── 个人知识库 ───
  ipcMain.handle('knowledge-library:add-personal', withSenderCheck(async (_event, item) => {
    try { return knowledgeLibraryService.addPersonal(item) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:add-personal-batch', withSenderCheck(async (_event, items) => {
    try { return knowledgeLibraryService.addPersonalBatch(items) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:list-personal', async (_event, params) => {
    try { return knowledgeLibraryService.listPersonal(params) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('knowledge-library:get-personal', async (_event, id) => {
    try { return knowledgeLibraryService.getPersonal(id) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
  ipcMain.handle('knowledge-library:update-personal', withSenderCheck(async (_event, id, updates) => {
    try { return knowledgeLibraryService.updatePersonal(id, updates) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:delete-personal', withSenderCheck(async (_event, id) => {
    try { return knowledgeLibraryService.deletePersonal(id) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('knowledge-library:search-personal', async (_event, query, limit) => {
    try { return knowledgeLibraryService.searchPersonal(query, limit) } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  })
}

module.exports = registerHandlers
