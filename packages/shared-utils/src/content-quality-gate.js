/**
 * ContentQualityGate — 发布内容质量门禁
 *
 * 改编自小黑插画 AI Agent 的 QA 体系：
 *   13 条通过标准（pass criteria）+ 11 条失败信号（failure signals）
 *
 * 用法:
 *   const gate = new ContentQualityGate()
 *   const result = gate.evaluate({ title, content, platform, images })
 *
 * 集成到发布流程：
 *   在 task-queue 的 beforePublish hook 中调用，不达标则排队/告警。
 */
const PASS_CRITERIA = require('./content-quality-criteria')
const FAILURE_SIGNALS = require('./content-quality-signals')

class ContentQualityGate {
  /**
   * @param {object} [options]
   * @param {number} [options.passThreshold=0.6] - 通过率阈值 (0-1)
   * @param {boolean} [options.failFast=true] - 遇到 high 信号立即失败
   * @param {function} [options.logger] - 日志函数
   */
  constructor (options = {}) {
    this.passThreshold = options.passThreshold || 0.6
    this.failFast = options.failFast !== false
    this.logger = options.logger || null
  }

  _log (...args) {
    if (this.logger) this.logger('[ContentQualityGate]', ...args)
  }

  /**
   * 全量质量检测
   */
  evaluate (ctx) {
    this._log('Evaluating content quality', { title: (ctx.title || '').slice(0, 30) })

    const passResults = PASS_CRITERIA.map(criteria => ({
      id: criteria.id,
      name: criteria.name,
      weight: criteria.weight,
      result: criteria.check(ctx),
    }))

    const passedItems = passResults.filter(r => r.result.pass)
    const passRate = passedItems.length / PASS_CRITERIA.length
    const score = passResults.reduce((sum, r) => r.result.pass ? sum + r.weight : sum, 0)

    const signalResults = FAILURE_SIGNALS.map(signal => ({
      id: signal.id,
      name: signal.name,
      severity: signal.severity,
      result: signal.detect(ctx),
    }))

    const triggeredSignals = signalResults.filter(r => r.result !== null)
    const highSignals = triggeredSignals.filter(r => r.severity === 'high')

    const hasHighSignal = highSignals.length > 0
    const passed = !hasHighSignal && passRate >= this.passThreshold

    return {
      passed,
      score: Math.round(score * 10) / 10,
      passRate: Math.round(passRate * 100) / 100,
      failures: PASS_CRITERIA.length - passedItems.length,
      signals: triggeredSignals.length,
      highSignal: hasHighSignal,
      anySignal: triggeredSignals.length > 0,
      details: {
        passCriteria: passResults.map(r => ({
          id: r.id, name: r.name, pass: r.result.pass,
          reason: r.result.reason, suggest: r.result.suggest || false
        })),
        failureSignals: triggeredSignals.map(r => ({
          id: r.id, name: r.name, severity: r.severity, detail: r.result.detail
        }))
      }
    }
  }

  /**
   * 快速检测失败信号（跳过通过标准）
   */
  detectFailureSignals (ctx) {
    const results = FAILURE_SIGNALS.map(signal => ({
      id: signal.id, name: signal.name, severity: signal.severity, result: signal.detect(ctx)
    }))
    const triggered = results.filter(r => r.result !== null)

    if (this.failFast) {
      const highTriggered = triggered.filter(r => r.severity === 'high')
      if (highTriggered.length > 0) {
        return { hasSignal: true, triggered: highTriggered.map(r => ({ id: r.id, name: r.name, detail: r.result.detail })), details: '检测到 high 级别失败信号' }
      }
    }

    return {
      hasSignal: triggered.length > 0,
      triggered: triggered.map(r => ({ id: r.id, name: r.name, severity: r.severity, detail: r.result.detail })),
      details: triggered.length > 0 ? '检测到 ' + triggered.length + ' 个失败信号' : '未检测到失败信号'
    }
  }

  /**
   * 计算通过率
   */
  computePassRate (ctx) {
    const results = PASS_CRITERIA.map(criteria => ({
      id: criteria.id, name: criteria.name, result: criteria.check(ctx)
    }))
    const passed = results.filter(r => r.result.pass).length
    return {
      count: PASS_CRITERIA.length,
      passed,
      rate: Math.round((passed / PASS_CRITERIA.length) * 100) / 100,
      details: results.map(r => ({ id: r.id, name: r.name, pass: r.result.pass, reason: r.result.reason }))
    }
  }
}

ContentQualityGate.PASS_CRITERIA = PASS_CRITERIA
ContentQualityGate.FAILURE_SIGNALS = FAILURE_SIGNALS

module.exports = ContentQualityGate