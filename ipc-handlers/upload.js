module.exports = function registerHandlers(ipcMain, deps) {
  const { chunkedUploader } = deps
  ipcMain.handle('upload:chunked', (_, { filePath, uploadChunkFn }) => chunkedUploader.upload(filePath, uploadChunkFn))
  ipcMain.handle('upload:cancel', () => chunkedUploader.cancel())
}
