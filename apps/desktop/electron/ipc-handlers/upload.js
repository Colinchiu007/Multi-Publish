function registerHandlers(ipcMain, deps) {
  const { _chunkedUploader } = deps

  ipcMain.handle('upload:chunked', async (_, { filePath, uploadChunkFn }) => {
    try {
      const result = await _chunkedUploader.upload(filePath, uploadChunkFn)
      return { code: result.success ? 0 : -1, data: result }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('upload:cancel', async () => {
    _chunkedUploader.cancel()
    return { code: 0 }
  })
}

module.exports = registerHandlers
