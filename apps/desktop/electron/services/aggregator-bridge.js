// @ts-check
/**
 * Aggregator Bridge 鈥?PROJECT-001 闆嗘垚妗ユ帴
 * 鎺ユ敹 content-aggregator 鎺ㄩ€佺殑鏂囩珷骞跺姞鍏ュ彂甯冮槦鍒?
 */
const EventEmitter = require('events')

class AggregatorBridge extends EventEmitter {
  /** @param {any} taskQueue */
  constructor(taskQueue) {
    super()
    this._taskQueue = taskQueue
  }

  /**
   * 鎺ユ敹鏉ヨ嚜 PROJECT-001 鐨勬枃绔?
   * @param {any} article - { title, content, author, cover_url, platforms? }
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

