/**
 * Test: aggregator-bridge.js — PROJECT-001 集成桥接
 * 测试: receiveArticle 将文章加入任务队列
 */

const TaskQueue = require('../src/task-queue')
const AggregatorBridge = require('../src/aggregator-bridge')

describe('AggregatorBridge', () => {
  test('receiveArticle 将文章加入任务队列', () => {
    const queue = new TaskQueue()
    const bridge = new AggregatorBridge(queue)

    const article = {
      title: 'Test Article',
      content: '<p>Hello</p>',
      author: 'Tester',
      platforms: ['wechat_mp', 'zhihu']
    }

    const { taskIds } = bridge.receiveArticle(article)
    expect(taskIds).toHaveLength(2)
  })

  test('未指定 platforms 时默认为 [wechat_mp, zhihu, weibo]', () => {
    const queue = new TaskQueue()
    const bridge = new AggregatorBridge(queue)

    const article = { title: 'T', content: 'C' }
    const { taskIds } = bridge.receiveArticle(article)
    expect(taskIds).toHaveLength(3)
  })

  test('emit article:received 事件', () => {
    const queue = new TaskQueue()
    const bridge = new AggregatorBridge(queue)

    let eventReceived = null
    bridge.on('article:received', (e) => { eventReceived = e })

    bridge.receiveArticle({ title: 'Hello World', content: '<p>test</p>' })

    expect(eventReceived).not.toBeNull()
    expect(eventReceived.title).toBe('Hello World')
    expect(eventReceived.taskIds).toBeDefined()
  })
})
