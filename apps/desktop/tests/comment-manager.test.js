/**
 * CommentManager — Unit Tests (PRD F13)
 *
 * Tests:
 *   - 构造与基本方法存在
 *   - listComments — ORCHESTRATOR_URL 未配置时返回空数组
 *   - replyComment — ORCHESTRATOR_URL 未配置时返回明确错误
 *   - startPolling / stopPolling — 生命周期管理
 *   - getStatus — 列出活跃轮询
 *   - 重复 startPolling 返回 already running
 *   - stopAll — 停止所有
 *
 * 注意：用 __registerMock 替代 vi.mock，与 content-intelligence.test.js 一致
 */
__enableElectronMock()

__registerMock('../electron/services/logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const CommentManager = require('../electron/services/comment-manager')

describe('CommentManager', () => {
  let cm

  beforeEach(() => {
    cm = new CommentManager()
  })

  describe('构造与接口', () => {
    it('应导出 CommentManager 类', () => {
      expect(typeof CommentManager).toBe('function')
    })

    it('实例应有所有核心方法', () => {
      expect(typeof cm.listComments).toBe('function')
      expect(typeof cm.replyComment).toBe('function')
      expect(typeof cm.startPolling).toBe('function')
      expect(typeof cm.stopPolling).toBe('function')
      expect(typeof cm.stopAll).toBe('function')
      expect(typeof cm.getStatus).toBe('function')
      expect(typeof cm.registerIpcHandlers).toBe('function')
      expect(typeof cm.setGetMainWin).toBe('function')
    })
  })

  describe('listComments — ORCHESTRATOR_URL 未配置', () => {
    it('应返回空数组（graceful degradation）', async () => {
      // 确保 ORCHESTRATOR_URL 未设置
      delete process.env.ORCHESTRATOR_URL
      const list = await cm.listComments('douyin', 'fake-cookie', { maxDays: 7 })
      expect(Array.isArray(list)).toBe(true)
      expect(list.length).toBe(0)
    })
  })

  describe('replyComment — ORCHESTRATOR_URL 未配置', () => {
    it('应返回 success=false + 明确错误信息', async () => {
      delete process.env.ORCHESTRATOR_URL
      const result = await cm.replyComment('douyin', 'fake-cookie', 'cmt-123', '感谢评论')
      expect(result.success).toBe(false)
      expect(result.error).toContain('ORCHESTRATOR_URL')
    })
  })

  describe('startPolling / stopPolling 生命周期', () => {
    it('startPolling 返回 key + started=true', async () => {
      delete process.env.ORCHESTRATOR_URL
      const result = await cm.startPolling({
        platform: 'douyin',
        accountId: 'acc1',
        cookie: 'fake-cookie',
        interval: 60000,
      })
      expect(result.key).toBe('douyin:acc1')
      expect(result.started).toBe(true)
    })

    it('重复 startPolling 同 key 返回 started=false', async () => {
      delete process.env.ORCHESTRATOR_URL
      await cm.startPolling({ platform: 'douyin', accountId: 'acc1', cookie: 'c' })
      const result = await cm.startPolling({ platform: 'douyin', accountId: 'acc1', cookie: 'c' })
      expect(result.started).toBe(false)
      expect(result.message).toContain('already running')
    })

    it('stopPolling 已运行的 key 返回 stopped=true', async () => {
      delete process.env.ORCHESTRATOR_URL
      const startResult = await cm.startPolling({ platform: 'weibo', accountId: 'acc2', cookie: 'c' })
      const result = await cm.stopPolling(startResult.key)
      expect(result.stopped).toBe(true)
    })

    it('stopPolling 未运行的 key 返回 stopped=false', async () => {
      const result = await cm.stopPolling('nonexistent:key')
      expect(result.stopped).toBe(false)
    })
  })

  describe('getStatus', () => {
    it('无活跃轮询时返回空数组', () => {
      expect(cm.getStatus()).toEqual([])
    })

    it('有活跃轮询时返回条目', async () => {
      delete process.env.ORCHESTRATOR_URL
      await cm.startPolling({ platform: 'douyin', accountId: 'a1', cookie: 'c' })
      const status = cm.getStatus()
      expect(status.length).toBe(1)
      expect(status[0].key).toBe('douyin:a1')
      expect(status[0].platform).toBe('douyin')
    })
  })

  describe('stopAll', () => {
    it('停止所有轮询', async () => {
      delete process.env.ORCHESTRATOR_URL
      await cm.startPolling({ platform: 'douyin', accountId: 'a1', cookie: 'c' })
      await cm.startPolling({ platform: 'weibo', accountId: 'a2', cookie: 'c' })
      expect(cm.getStatus().length).toBe(2)
      await cm.stopAll()
      expect(cm.getStatus().length).toBe(0)
    })
  })

  describe('startPolling with template', () => {
    it('使用自定义模板生成器', async () => {
      delete process.env.ORCHESTRATOR_URL
      const result = await cm.startPolling({
        platform: 'zhihu',
        accountId: 'a3',
        cookie: 'c',
        template: '谢谢 {author}: {content}',
      })
      expect(result.started).toBe(true)
      await cm.stopPolling(result.key)
    })
  })
})
