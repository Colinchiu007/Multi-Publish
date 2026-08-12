// @ts-check
/**
 * 生产环境评估器：通过 ModelProviderManager 调用视觉/多模态模型。
 * 契约：async ({ prompt, images }) => string（评估 LLM 原始文本输出）。
 * 未配置可用视觉模型 → 抛 EVAL_LLM_UNAVAILABLE（fail closed，不内置假评估器）。
 */
const fs = require('fs')

const VISION_METHODS = ['chatCompletion']

function makeUnavailable (message) {
  const e = new Error(message || '未配置支持视觉评估的模型服务商')
  e.code = 'EVAL_LLM_UNAVAILABLE'
  return e
}

/**
 * @param {object} opts
 * @param {object} opts.manager - ModelProviderManager（getDefault/callAdapter）
 * @param {object} [opts.log]
 */
function createModelProviderEvaluator ({ manager, log }) {
  const logger = log || { info: () => {}, warn: () => {}, error: () => {} }
  if (!manager || typeof manager.getDefault !== 'function' || typeof manager.callAdapter !== 'function') {
    throw makeUnavailable('评估器依赖 ModelProviderManager 未注入')
  }

  function resolveProviderId () {
    try {
      const provider = manager.getDefault('llm')
      if (provider && typeof provider.id === 'string' && provider.id) return provider.id
    } catch (_) { /* 回退遍历 */ }
    // 兜底：遍历多模态/LLM provider 找支持 chatCompletion 的已启用 provider
    try {
      if (typeof manager.listProviders === 'function') {
        const providers = manager.listProviders({ category: 'multimodal' }) || manager.listProviders() || []
        for (const p of providers) {
          if (p && p.enabled !== false && typeof p.id === 'string') return p.id
        }
      }
    } catch (_) { /* ignore */ }
    return null
  }

  /**
   * @param {{ prompt: string, images: Array<{imagePath:string,mimeType:string,base64:string}> }} ctx
   * @returns {Promise<string>}
   */
  const modelProviderEvaluator = async function modelProviderEvaluator (ctx) {
    const providerId = resolveProviderId()
    if (!providerId) throw makeUnavailable()
    modelProviderEvaluator.lastModelId = providerId
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text: ctx.prompt },
        ...ctx.images.map(img => ({
          type: 'image_url',
          image_url: { url: 'data:' + (img.mimeType || 'image/png') + ';base64,' + img.base64 },
        })),
      ],
    }]
    logger.info('PromptEval', 'calling vision evaluator via ' + providerId)
    const temperature = Number.isFinite(ctx.temperature) ? Math.min(2, Math.max(0, ctx.temperature)) : 0
    let lastError
    for (const method of VISION_METHODS) {
      try {
        const data = await manager.callAdapter(providerId, method, { messages, temperature, max_tokens: 4000 })
        const text = data && (data.content || data.text || (data.message && data.message.content))
        if (typeof text === 'string' && text.trim()) return text
        lastError = makeUnavailable('评估模型未返回文本内容')
      } catch (e) {
        lastError = e
        logger.warn('PromptEval', providerId + '.' + method + ' failed: ' + (e && e.message ? e.message : String(e)))
      }
    }
    throw lastError || makeUnavailable()
  }
  modelProviderEvaluator.lastModelId = null
  return modelProviderEvaluator
}

module.exports = { createModelProviderEvaluator }

