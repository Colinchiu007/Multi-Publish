'use strict'
/**
 * platform-schedule-create.js — 创建定时任务的前置校验（平台侧定时）
 *
 * 为什么独立成文件：scheduler.js 是定时发布的单一业务实现，行数已逼近门禁阈值。
 * 「创建前的入参校验 + 平台能力门禁 + 平台窗口校验」自成一体、无状态，
 * 单独成文件后既清晰又便于单独测试（纯函数，无 fs / 无定时器）。
 *
 * 平台侧定时语义（2026-10-07）：创建即把排期提交给平台，由平台服务器到点发布。
 * 因此校验必须发生在**写盘与提交之前**：
 *   - 不支持平台侧定时的平台 ⇒ 直接阻断（绝不创建后到点发，更不静默回落本地定时）；
 *   - 平台自身的最小提前量 / 最大跨度 ⇒ 按注册表校验（本地能过、平台必拒的排期
 *     不该一路走到提交才失败，用户会收不到任何反馈）。
 *
 * 静默失败警示：参考产品（4.0 逆向实测）的 7 个不支持平台，其 `prePubTime` 出现 0 次
 * ⇒「用户勾了定时、内容却立即发布」。本仓明令禁止此形态。
 */

const { getPlatformScheduleCapability } = require('./platform-schedule-capability')
const { assertWithinPlatformWindow } = require('./platform-schedule-time')

/**
 * 校验定时任务的创建入参（含平台能力门禁与平台窗口）。
 * 纯函数：不写盘、不设定时器、不触碰全局状态，失败一律抛错。
 *
 * @param {unknown} schedule
 * @param {number} [now] 注入当前时间便于测试
 * @returns {{ platform: string, article: object, publishTime: string, publishTimestamp: number, capability: object }}
 */
function assertSchedulableInput (schedule, now = Date.now()) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new TypeError('任务参数必须是对象')
  }

  const { platform, article, publishTime } = schedule

  if (typeof platform !== 'string' || !platform.trim()) {
    throw new TypeError('platform 必须是非空字符串')
  }
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    throw new TypeError('article 必须是对象')
  }

  const publishTimestamp = new Date(publishTime).getTime()
  if (!Number.isFinite(publishTimestamp) || publishTimestamp <= now) {
    throw new TypeError('publishTime 必须是有效的未来时间')
  }

  // 能力门禁前置：阻断必须发生在落盘之前，否则会留下无用的 pending 记录
  const capability = getPlatformScheduleCapability(platform)
  if (capability.mode === 'unsupported') {
    throw new Error(
      `平台 ${platform} 不支持平台侧定时（${capability.reason}）。` +
      '为避免「以为已排期、实际立即发出」的静默失败，本次定时已阻断。'
    )
  }

  // 按平台注册表的约束校验时间窗口（最小提前量 / 最大跨度）
  assertWithinPlatformWindow(publishTime, capability, now)

  return { platform, article, publishTime, publishTimestamp, capability }
}

module.exports = { assertSchedulableInput }