/**
 * Aggregator Bridge — PROJECT-001 集成桥接
 * 接收 content-aggregator 推送的文章并加入发布队列
 */
const EventEmitter = require('events')

class AggregatorBridge extends EventEmitter {
  constructor (taskQueue) {
    super()
    this._taskQueue = taskQueue
  }

  /**
   * 接收来自 PROJECT-001 的文章
   * @param {object} article - { title, content, author, cover_url, platforms? }
   * @returns {object} { taskIds }
   */
  receiveArticle (article) {
    const platforms = article.platforms || ['wechat_mp', 'zhihu', 'weibo']
    const taskIds = []

    for (const platform of platforms) {
      const taskId = this._taskQueue.add({
        platform,
        article: {
          title: article.title,
          content: article.content,
          author: article.author || '',
          cover_url: article.cover_url || ''
        }
      })
      taskIds.push(taskId)
    }

    this.emit('article:received', { title: article.title, taskIds })
    return { taskIds }
  }
}

module.exports = AggregatorBridge