// @ts-check
'use strict'

const {
  ERROR_CODES,
  hasStrictContentPolicySignal,
} = require('./adapters/_base/provider-error')

const MAX_IMAGE_GENERATION_ATTEMPTS = 5

const NON_CONTENT_POLICY_ERROR_CODES = new Set([
  ERROR_CODES.AUTH_FAILED,
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.TIMEOUT,
  ERROR_CODES.NETWORK_ERROR,
  ERROR_CODES.INVALID_CONFIG,
  ERROR_CODES.NOT_IMPLEMENTED,
])

function normalizeSceneIndex (value) {
  const index = Number(value)
  return Number.isInteger(index) && index >= 0 ? index : 0
}

function normalizeAttemptLimit (value) {
  const numeric = Number(value)
  if (!Number.isInteger(numeric)) return MAX_IMAGE_GENERATION_ATTEMPTS
  return Math.min(MAX_IMAGE_GENERATION_ATTEMPTS, Math.max(1, numeric))
}

function getErrorStatusCode (error) {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.context?.statusCode,
    error?.context?.status,
    error?.response?.status,
    error?.response?.statusCode,
  ]
  for (const candidate of candidates) {
    const numeric = Number(candidate)
    if (Number.isInteger(numeric)) return numeric
  }
  return null
}

function getErrorCategory (error) {
  if (typeof error?.category === 'string' && error.category.trim()) return error.category.trim()
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toLowerCase()
  return 'provider'
}

function getErrorSignals (error) {
  return [
    error?.code,
    error?.type,
    error?.errorCode,
    error?.error_code,
    error?.providerCode,
    error?.provider_code,
    error?.context?.code,
    error?.context?.type,
    error?.context?.errorCode,
    error?.context?.error_code,
    error?.context?.providerCode,
    error?.context?.provider_code,
    error?.data?.code,
    error?.data?.type,
    error?.data?.error?.code,
    error?.data?.error?.type,
    error?.response?.data?.code,
    error?.response?.data?.type,
    error?.response?.data?.error?.code,
    error?.response?.data?.error?.type,
    error?.message,
  ]
}

/**
 * 仅把明确的结构化内容政策信号视为可安全重写的拒绝。
 * 认证、限流、网络和配置错误即使错误文案提到安全也绝不重试。
 */
function isContentPolicyRejection (error) {
  if (!error || typeof error !== 'object') return false

  const statusCode = getErrorStatusCode(error)
  if (statusCode === 0 || statusCode === 401 || statusCode === 403 || statusCode === 429) return false

  if (NON_CONTENT_POLICY_ERROR_CODES.has(error.code)) return false
  if (error.code === ERROR_CODES.CONTENT_POLICY) return true

  return getErrorSignals(error).some(hasStrictContentPolicySignal)
}

/**
 * 生成发送给供应商的按场景安全化改写；调用方不得把返回的 prompt 写入审计数据。
 */
function buildContentPolicySafePrompt (prompt, options = {}) {
  const sceneIndex = normalizeSceneIndex(options.sceneIndex)
  const source = String(prompt || '').trim().slice(0, 4000)
  const sceneNumber = sceneIndex + 1

  return [
    'Generate a policy-compliant, age-appropriate visual interpretation for scene ' + sceneNumber + '.',
    'Preserve only neutral setting, time, lighting, and composition. Replace sensitive people, actions, and details with symbolic, non-identifying alternatives.',
    'Do not depict graphic violence, nudity, sexual content, minors, self-harm, illegal activity, hate symbols, real-person likenesses, or readable text.',
    'Scene source to adapt:',
    source,
  ].join('\n')
}

function createAttemptAudit (attempt, sceneIndex, promptStrategy, outcome, category) {
  const audit = {
    attempt,
    sceneIndex,
    sceneNumber: sceneIndex + 1,
    promptStrategy,
    outcome,
  }
  if (category) audit.category = category
  return audit
}

function createContentPolicyCheckpoint (sceneIndex, attempts) {
  const sceneNumber = sceneIndex + 1
  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'content_policy',
    needsUserInput: true,
    sceneIndex,
    sceneNumber,
    attempts,
    recommendation: '请将第 ' + sceneNumber + ' 个场景改为更抽象、非露骨且不含敏感人物或动作的描述后重试。',
  }
}

function createEmptyResultCheckpoint (sceneIndex, attempts) {
  const sceneNumber = sceneIndex + 1
  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'empty_result',
    needsUserInput: true,
    sceneIndex,
    sceneNumber,
    attempts,
    recommendation: '第 ' + sceneNumber + ' 个场景的图片生成多次未返回结果（可能是内容安全策略或服务波动）。请修改该场景文案后重试，或稍后再试。',
  }
}

/**
 * 仅针对明确的内容政策拒绝重写并重试图片生成。
 * 返回的 attempts 只包含非敏感审计元数据，绝不包含原始或重写后的 prompt。
 */
async function runContentPolicyImageRetry ({ prompt, sceneIndex, maxAttempts, generate }) {
  if (typeof generate !== 'function') throw new TypeError('generate must be a function')

  const normalizedSceneIndex = normalizeSceneIndex(sceneIndex)
  const attemptLimit = normalizeAttemptLimit(maxAttempts)
  const attempts = []
  const originalPrompt = String(prompt || '').trim().slice(0, 4000)
  let currentPrompt = originalPrompt
  let promptStrategy = 'original'

  for (let attempt = 1; attempt <= attemptLimit; attempt++) {
    try {
      const result = await generate({
        prompt: currentPrompt,
        attempt,
        sceneIndex: normalizedSceneIndex,
        sceneNumber: normalizedSceneIndex + 1,
        promptStrategy,
      })
      attempts.push(createAttemptAudit(attempt, normalizedSceneIndex, promptStrategy, 'success'))
      return { status: 'success', result, attempts }
    } catch (error) {
      // 空结果：供应商返回 200 但无图片（静默内容策略拒绝或瞬时故障）。
      // 前几次用同提示词重试（瞬时），随后切内容安全改写；到达上限后转 needs_user_input 交用户处理。
      if (error?.emptyResult === true) {
        attempts.push(createAttemptAudit(
          attempt,
          normalizedSceneIndex,
          promptStrategy,
          'empty_result',
          'empty_result',
        ))
        // 第 3 次调用起使用内容安全改写（本次失败后设置，下次 generate 生效）
        if (attempt >= 2 && attempt < attemptLimit) {
          currentPrompt = buildContentPolicySafePrompt(originalPrompt, { sceneIndex: normalizedSceneIndex })
          promptStrategy = 'content_policy_safe_rewrite'
        }
        if (attempt === attemptLimit) {
          return {
            status: 'needs_user_input',
            attempts,
            checkpoint: createEmptyResultCheckpoint(normalizedSceneIndex, attempt),
          }
        }
        continue
      }

      if (!isContentPolicyRejection(error)) {
        attempts.push(createAttemptAudit(
          attempt,
          normalizedSceneIndex,
          promptStrategy,
          'failed',
          getErrorCategory(error),
        ))
        return { status: 'failed', error, attempts }
      }

      attempts.push(createAttemptAudit(
        attempt,
        normalizedSceneIndex,
        promptStrategy,
        'content_policy_rejected',
        'content_policy',
      ))
      if (attempt === attemptLimit) {
        return {
          status: 'needs_user_input',
          attempts,
          checkpoint: createContentPolicyCheckpoint(normalizedSceneIndex, attempt),
        }
      }

      currentPrompt = buildContentPolicySafePrompt(originalPrompt, { sceneIndex: normalizedSceneIndex })
      promptStrategy = 'content_policy_safe_rewrite'
    }
  }

  throw new Error('Content-policy image retry did not settle')
}

/**
 * 按 checkpoint.reason 生成 needs_user_input 的用户可见消息（单一来源，2026-08-16）：
 * content_policy → 内容安全审查；empty_result → 多次未返回结果（服务波动或账号问题）。
 * 严禁在 empty_result 消息中内嵌 "content-policy" 字样，避免渲染层模式再次误映射为内容审查。
 */
function needsUserInputMessage (checkpoint) {
  return checkpoint?.reason === 'content_policy'
    ? 'Image generation requires user input after content-policy review'
    : 'Image generation repeatedly returned no result (service fluctuation or account issue); adjust the scene prompt and retry, or check the provider account'
}

module.exports = {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  buildContentPolicySafePrompt,
  createContentPolicyCheckpoint,
  createEmptyResultCheckpoint,
  isContentPolicyRejection,
  needsUserInputMessage,
  runContentPolicyImageRetry,
}
