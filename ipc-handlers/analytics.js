module.exports = function registerHandlers(ipcMain, deps) {
  const { analyticsService } = deps
  ipcMain.handle('analytics:overview', () => analyticsService.getOverview())
  ipcMain.handle('analytics:platform', (_, { platform }) => analyticsService.getPlatform(platform))
  ipcMain.handle('analytics:platforms', () => analyticsService.getPlatforms())
}
