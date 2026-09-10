/**
 * BehaviorSimulator — L3 行为仿真器
 *
 * 职责：
 * 1. 浏览路径仿真（搜索 → 列表 → 详情，不直接深链）
 * 2. 交互仿真（滚动、停留时长、鼠标移动）
 * 3. 会话预热（浏览若干无关页面建立正常轨迹）
 *
 * 浏览器环境通过注入的 page/pageManager 调用。
 */
class BehaviorSimulator {
  constructor (opts = {}) {
    this._rng = opts.rng || Math.random
    this._intensity = opts.intensity || 'light' // light | heavy
  }

  /** 随机延迟（毫秒） */
  async _delay (minMs, maxMs) {
    const ms = Math.floor(minMs + this._rng() * (maxMs - minMs))
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 会话预热：浏览若干无关页面
   * @param {object} browser - 浏览器上下文（由调用方注入）
   * @param {string[]} [urls] - 预热 URL 列表
   */
  async warmup (browser, urls = []) {
    if (urls.length === 0) return
    for (const url of urls) {
      await browser.goto(url)
      await this._delay(2000, 5000)
      await this._simulateScroll(browser)
      await this._delay(1000, 3000)
    }
  }

  /**
   * 浏览路径仿真：先访问搜索/列表页，再访问详情
   * @returns {object} 加载详情页后的 browser 对象
   */
  async browsePath (browser, listUrl, detailUrl) {
    // 1. 列表页
    await browser.goto(listUrl)
    await this._delay(2000, 4000)
    await this._simulateScroll(browser)
    await this._delay(1500, 3500)

    // 2. 详情页（模拟从列表中点击进入）
    await browser.goto(detailUrl)
    await this._delay(3000, 8000) // 停留时间更长，模拟阅读
    await this._simulateScroll(browser, { scrolls: this._intensity === 'heavy' ? 5 : 2 })

    return browser
  }

  /**
   * 模拟滚动行为
   */
  async _simulateScroll (browser, opts = {}) {
    const scrolls = opts.scrolls || 2
    try {
      for (let i = 0; i < scrolls; i++) {
        const scrollAmount = 200 + Math.floor(this._rng() * 600)
        await browser.evaluate(scrollY => window.scrollBy({ top: scrollY, behavior: 'smooth' }), scrollAmount)
        await this._delay(800, 2500)
      }
    } catch (_) { /* 滚动失败不阻断 */ }
  }

  /**
   * 获取人类化间隔（根据 intensity 调整）
   */
  getHumanDelay () {
    if (this._intensity === 'heavy') {
      return { min: 3000, max: 15000 }
    }
    return { min: 1000, max: 6000 }
  }
}

module.exports = { BehaviorSimulator }
