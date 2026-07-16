// @ts-check
/**
 * Backlot 项目库 IPC handlers（OpenMontage 集成）
 *
 * 通道：
 *   - project:list    — 列出所有项目
 *   - project:get     — 获取单个项目
 *   - project:delete  — 删除项目
 *
 * 使用 wrapIpcHandlerRaw 统一错误处理，保留 handler 自定义响应格式。
 * project:get / project:delete 使用 withSenderCheck 验证 sender（写入/删除操作）。
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR;
  const { wrapIpcHandlerRaw, withSenderCheck } = require('./helpers');
  const { projectService, log } = deps;

  // project:list — 列出所有项目
  ipcMain.handle(
    'project:list',
    wrapIpcHandlerRaw(async () => {
      const projects = projectService.scanProjects();
      return { code: 0, data: projects };
    }, { label: 'project:list', catchData: [] })
  );

  // project:get — 获取单个项目
  ipcMain.handle(
    'project:get',
    wrapIpcHandlerRaw(async (_event, args) => {
      if (!args || !args.projectId) {
        return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
      }
      try {
        const project = projectService.getProject(args.projectId);
        return { code: 0, data: project };
      } catch (e) {
        if (e.code === 'PROJECT_NOT_FOUND') {
          return { code: EC.NOT_FOUND, message: e.message };
        }
        throw e;
      }
    }, { label: 'project:get' })
  );

  // project:delete — 删除项目（敏感操作，验证 sender）
  ipcMain.handle(
    'project:delete',
    withSenderCheck(
      wrapIpcHandlerRaw(async (_event, args) => {
        if (!args || !args.projectId) {
          return { code: EC.VALIDATION_ERROR, message: '缺少 projectId 参数' };
        }
        try {
          const result = projectService.deleteProject(args.projectId);
          return { code: 0, data: result };
        } catch (e) {
          if (e.code === 'PROJECT_NOT_FOUND') {
            return { code: EC.NOT_FOUND, message: e.message };
          }
          log && log.error && log.error('[project:delete]', e.message);
          return { code: EC.REQUEST_ERROR, message: e.message };
        }
      }, { label: 'project:delete' })
    )
  );
}

module.exports = registerHandlers;
