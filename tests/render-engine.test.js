/**
 * RenderEngine 单元测试
 */
const RenderEngine = require('../apps/desktop/electron/render-engine');

describe('RenderEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new RenderEngine();
  });

  describe('getStatus()', () => {
    it('返回状态对象包含所有必要字段', () => {
      const status = engine.getStatus();
      expect(status).toHaveProperty('ready');
      expect(status).toHaveProperty('composerExists');
      expect(status).toHaveProperty('nodeModulesExist');
      expect(status).toHaveProperty('composerDir');
    });

    it('composerDir 指向 remotion-composer 目录', () => {
      const status = engine.getStatus();
      expect(status.composerDir).toMatch(/remotion-composer$/);
    });

    it('当 node_modules 不存在时 ready 为 false', () => {
      const status = engine.getStatus();
      // CI 环境可能没有 node_modules
      if (!status.nodeModulesExist) {
        expect(status.ready).toBe(false);
      }
    });
  });

  describe('cancel()', () => {
    it('没有正在运行的进程时取消不报错', () => {
      expect(() => engine.cancel()).not.toThrow();
    });

    it('设置 _canceled 标志', () => {
      engine._canceled = false;
      engine.cancel();
      expect(engine._canceled).toBe(true);
    });
  });

  describe('render()', () => {
    it('当 npx 不可用时返回错误（不崩溃）', async () => {
      // 模拟 npx 不存在跳过
      const result = await engine.render({ test: true });
      // 如果在 CI 环境没有 npx，返回错误但不崩溃
      expect(result).toHaveProperty('success');
      expect(typeof result.error).toBe('string');
    }