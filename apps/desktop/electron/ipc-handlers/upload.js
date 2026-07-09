// @ts-check
const path = require('path')

function registerHandlers(ipcMain, deps) {
  const { _chunkedUploader } = deps

  // 安全：校验路径不包含穿越序列（防止 ../../etc/passwd）
  function _isSafeFilePath(p) {
    if (!p || typeof p !== 'string') return false
    // 解析后必须不含 .. 段
    const normalized = path.resolve(p)
    if (normalized.includes('..')) return false
    // 必须是绝对路径或可解析的相对路径
    return true
  }

  ipcMain.handle('upload:chunked', async (_, { filePath }) => {
    try {
      // 安全：校验 filePath 防止路径穿越
      if (!_isSafeFilePath(filePath)) {
        return { code: -1, message: 'Invalid file path' }
      }
      // uploadChunkFn 无法跨 IPC 传递（结构化克隆丢弃函数）
      // 各平台分片上传逻辑应由主进程内部根据 platform/account 自行构造
      // 当前未实现具体上传后端，返回明确错误而非崩溃
      const uploadChunkFn = deps.defaultUploadChunkFn || null
      if (typeof uploadChunkFn !== 'function') {
        return { code: -1, message: 'Chunked upload requires desktop adapter config' }
      }
      const result = await _chunkedUploader.upload(filePath, uploadChunkFn)
      return { code: result.success ? 0 : -1, data: result }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('upload:cancel', async () => {
    try {
      _chunkedUploader.cancel()
      return { code: 0 }
    } catch (e) { return { code: -1, message: e.message } }
  })
}

module.exports = registerHandlers
