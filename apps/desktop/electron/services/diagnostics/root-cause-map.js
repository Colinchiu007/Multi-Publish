// @ts-check
/**
 * 视频创作失败诊断 —— 错误 → 候选根因映射表
 *
 * 声明式规则 + 纯函数 lookupRootCauses()。每个候选根因包含：
 *   causeId / label / checks / advice / confidence
 * 未命中任何规则时返回低置信度 unknown 候选（通用建议），绝不编造具体根因。
 * 规则表按优先级排序，命中即收集（最多 MAX_CANDIDATES 条）。
 */
'use strict'

const { UNKNOWN } = require('./taxonomy')

const MAX_CANDIDATES = 3

/** 通用建议（兜底，低置信度） */
const UNKNOWN_CANDIDATE = Object.freeze({
  causeId: 'unknown',
  label: '未能确定具体根因',
  checks: ['核对错误码与错误文本', '查看 userData/logs 当日日志中同 runId 的阶段明细'],
  advice: '建议携带诊断摘要与日志反馈给开发；若为外部服务异常可稍后重试',
  confidence: 'low',
})

/**
 * @param {{ stage?: string, errorCode?: string, code?: unknown, message?: string }} ctx
 * @returns {string}
 */
function buildText (ctx) {
  const parts = []
  if (ctx && typeof ctx.errorCode === 'string' && ctx.errorCode) parts.push(ctx.errorCode)
  if (ctx && ctx.code !== undefined && ctx.code !== null) parts.push(String(ctx.code))
  if (ctx && typeof ctx.message === 'string' && ctx.message) parts.push(ctx.message)
  return parts.join(' ')
}

/**
 * 规则表（按优先级）。test(ctx) 返回 boolean。
 */
const ROOT_CAUSE_RULES = Object.freeze([
  {
    causeId: 'disk_full',
    label: '磁盘空间不足',
    test: (ctx) => /ENOSPC|ERR_NO_BUFFER_SPACE|no space left|磁盘.*(不足|满)|insufficient.*storage/i.test(buildText(ctx)),
    checks: ['检查输出目录所在盘剩余空间（compose 默认 os.tmpdir()）', '确认 temp/output 未被历史会话占满'],
    advice: '清理磁盘空间后重试；必要时调整输出目录到空闲盘',
    confidence: 'high',
  },
  {
    causeId: 'sidecar_unavailable',
    label: 'Python sidecar 未运行或端口被占用',
    test: (ctx) => /ECONNREFUSED|connection refused|not running|端口.*占用|sidecar.*(不可|未运行|down)|bridge.*(fail|不可)/i.test(buildText(ctx)) &&
      ['split', 'domain_enrich', 'optimize', 'generate_assets'].includes(ctx.stage),
    checks: ['确认 8002/8013 sidecar 进程存活且健康检查通过', '确认端口未被其他进程占用'],
    advice: '重启 sidecar（或恢复后端服务）后重试该阶段',
    confidence: 'high',
  },
  {
    causeId: 'sidecar_stale_instance',
    label: 'sidecar 运行的是旧代码（契约漂移）',
    test: (ctx) => /\b422\b|联合枚举不存在|unknown.*enum|field.*not.*supported/i.test(buildText(ctx)),
    checks: ['核对 sidecar 进程启动时间与当前分支代码', '用独立端口启动新代码做对照'],
    advice: '重启 sidecar 加载最新代码后再验证；本地验收用独立端口',
    confidence: 'medium',
  },
  {
    causeId: 'ffmpeg_media_error',
    label: 'ffmpeg 编码/解码失败（媒体资源或参数问题）',
    test: (ctx) => /ffmpeg|ffprobe|Output file is empty|Output file|Cannot find a valid|Invalid data found|decode|编码失败|解码失败/i.test(buildText(ctx)),
    checks: ['确认打包资源 media-tools 中 ffmpeg/ffprobe 存在且字节数匹配锁', '用 ffprobe 校验输入媒体可解码', '核对编码参数（超时预算是否按输入规模估算）'],
    advice: '校验媒体资源与 ffmpeg 二进制；长流水线确认编码超时按输入规模估算',
    confidence: 'medium',
  },
  {
    causeId: 'provider_timeout',
    label: '服务商请求超时',
    test: (ctx) => /ETIMEDOUT|timed\s*out|\btimeout\b|超时/i.test(buildText(ctx)),
    checks: ['确认 adapter 已接入有界超时（AbortController）', '核对并发预算（governor）与上游负载'],
    advice: '稍后重试；频繁超时建议切换模型或检查服务商状态',
    confidence: 'medium',
  },
  {
    causeId: 'provider_rate_limited',
    label: '服务商限流或配额不足',
    test: (ctx) => /\b429\b|\b402\b|rate\s*limit|quota|限流|额度/i.test(buildText(ctx)),
    checks: ['确认 API Key 额度与套餐状态', '确认并发请求数是否超限流窗口'],
    advice: '等待限流窗口/额度恢复后重试，或升级套餐',
    confidence: 'high',
  },
  {
    causeId: 'provider_not_configured',
    label: '服务商未配置 API Key 或模型路由错误',
    test: (ctx) => /API_KEY|api key|未配置|NOT_CONFIGURED|ADAPTER_NOT_FOUND|PROVIDER_NOT_FOUND|capability_models/i.test(buildText(ctx)),
    checks: ['在「模型设置」确认服务商 API Key 与模型', '复合 provider 确认按能力路由（capability_models）'],
    advice: '配置或修正模型路由后重试',
    confidence: 'high',
  },
  {
    causeId: 'network_error',
    label: '网络连接失败',
    test: (ctx) => /ECONNRESET|socket hang up|fetch failed|EAI_AGAIN|network error|网络连接|网络错误/i.test(buildText(ctx)),
    checks: ['确认本机网络与代理可达', '确认目标服务域名可解析'],
    advice: '恢复网络后重试',
    confidence: 'medium',
  },
  {
    causeId: 'content_policy',
    label: '内容触发审核策略',
    test: (ctx) => /内容.*(政策|审核|违规|不雅|露骨)|content\s*policy|改写(该)?场景/i.test(buildText(ctx)),
    checks: ['定位触发场景序号与提示词', '对照内容政策要求改写'],
    advice: '按提示改写该场景为更抽象、非露骨的视觉描述后重试',
    confidence: 'medium',
  },
  {
    causeId: 'input_limits',
    label: '输入超出资源上限（时长/尺寸/并发/参数边界）',
    test: (ctx) => /超出|上限|maxConcurrent|并发|exceed|too (long|large)|太长|过大/i.test(buildText(ctx)),
    checks: ['核对输入时长/分辨率/并发参数与上限配置', '核对 normalize 边界（枚举/数值范围）'],
    advice: '调整输入参数在允许范围内后重试',
    confidence: 'medium',
  },
  {
    causeId: 'validation_failed',
    label: '参数校验失败',
    test: (ctx) => /VALIDATION|validation|参数无效|Invalid (input|initialContext|Pipeline)/i.test(buildText(ctx)),
    checks: ['核对提交字段与接口契约', '查看 errorParams 中的具体字段'],
    advice: '修正输入后重试',
    confidence: 'high',
  },
])

/**
 * 根因候选查找（纯函数，永不抛错）
 * @param {{ stage?: string }} classification - classifyFailure 的结果
 * @param {{ errorCode?: string, code?: unknown, message?: string }} [error] - 错误对象（白名单字段）
 * @returns {Array<{causeId: string, label: string, checks: string[], advice: string, confidence: string}>}
 */
function lookupRootCauses (classification, error) {
  try {
    const ctx = {
      stage: classification && typeof classification.stage === 'string' ? classification.stage : UNKNOWN,
      errorCode: error && typeof error.errorCode === 'string' ? error.errorCode : undefined,
      code: error && error.code !== undefined ? error.code : undefined,
      message: error && typeof error.message === 'string' ? error.message : undefined,
    }
    const matched = []
    for (const rule of ROOT_CAUSE_RULES) {
      if (matched.length >= MAX_CANDIDATES) break
      let hit = false
      try {
        hit = rule.test(ctx) === true
      } catch (_) {
        hit = false
      }
      if (hit) {
        matched.push({
          causeId: rule.causeId,
          label: rule.label,
          checks: Array.isArray(rule.checks) ? [...rule.checks] : [],
          advice: rule.advice,
          confidence: rule.confidence,
        })
      }
    }
    if (matched.length === 0) {
      return [{ ...UNKNOWN_CANDIDATE }]
    }
    return matched
  } catch (_) {
    return [{ ...UNKNOWN_CANDIDATE }]
  }
}

module.exports = { lookupRootCauses, ROOT_CAUSE_RULES, UNKNOWN_CANDIDATE, MAX_CANDIDATES }
