/**
 * usePublishFieldSurface.js — 发布页字段面判据的单一真源（注册表驱动）
 *
 * 自 Publish.vue 内联实现下沉（P2-7 批量模式字段面，2026-10-09）。下沉前这些判据是
 * Publish.vue 的模块级常量与 computed，**只认单篇的全局 selectedPlatforms**，批量模式
 * 无从复用——批量当时要么抄第二份（两份必然漂移：漂移表现为「同一条内容在单篇有提示、
 * 批量没提示」，用户据以做出的判断在两模式不一致），要么整块不做（roadmap P2-7 的现状）。
 *
 * 本模块把判据参数化为「按传入的平台清单计算」，单篇传 selectedPlatforms，批量传
 * 条目自己的 a.platforms。判据本身一份实现，两模式不可能漂移。
 *
 * 哑实现：不持有 store、不持有响应式状态，纯输入 → 输出，可脱离开箱即测。
 */
import i18n from '@/i18n'
import { getPlatformLabel, getPlatformContentLimit } from '@/features/publish/publish-contract'
import {
  getCommonFormFields,
  isNoTitlePlatform,
  PLATFORM_PUBLISH_META,
  getVisibilityField,
  getVisibilitySemanticSupport,
} from '@multi-publish/shared-utils/src/publish-capabilities'
// 平台侧定时能力真源（api / rpa / unsupported 三态；未知平台 fail-closed）。
// 必须走 vite alias 指向的 ESM 孪生，不能 import CJS 版（dev server 运行时无具名导出）。
import {
  getPlatformScheduleCapability,
  isPlatformSideScheduleSupported,
} from '@multi-publish/shared-utils/src/platform-schedule-capability'
import {
  DEFAULT_MAX_SCHEDULE_DAYS,
  DEFAULT_MIN_ACCOUNT_INTERVAL_MS,
} from './publish-schedule-contract'

const t = (key, params) => i18n.global.t(key, params)

function uniqueIds (platformIds) {
  return [...new Set((Array.isArray(platformIds) ? platformIds : [])
    .filter(id => typeof id === 'string' && id.trim()))]
}

function joinLabels (platformIds) {
  return platformIds.map(id => getPlatformLabel(id)).join('、')
}

/**
 * 当前所选平台下的**有效排期上限（天）**。
 *
 * 2026-10-08 引入：头条排期上限经平台前端 bundle 真机取证为 7 天
 * （capability.maxHorizonDays=7）。若 hint 继续显示全局 30 天，用户按 30 天排期
 * 会在提交时被 scheduleExceedsMaxDays 拒绝 —— 文案与校验漂移（门禁明令禁止的形态，
 * 与「徽标谎报 15/15」同族）。规则：全局上限与所有「已支持平台侧定时」平台的
 * maxHorizonDays 取最严者；未选平台 / 所选全不支持 ⇒ 返回全局上限
 * （不支持平台由提交前能力门禁另行阻断，hint 不预判）。
 * 单篇与批量共用本函数，两模式不可能漂移。
 * @param {string[]} platformIds 当前所选平台
 * @returns {number}
 */
export function effectiveScheduleMaxDays (platformIds) {
  const ids = uniqueIds(platformIds).filter(id => isPlatformSideScheduleSupported(id))
  if (ids.length === 0) return DEFAULT_MAX_SCHEDULE_DAYS
  return Math.min(DEFAULT_MAX_SCHEDULE_DAYS,
    ...ids.map((id) => {
      const cap = getPlatformScheduleCapability(id)
      return cap.maxHorizonDays > 0 ? cap.maxHorizonDays : DEFAULT_MAX_SCHEDULE_DAYS
    }))
}

/** 定时 hint 文案（值与 validateScheduleEntries 共用同一常量源，避免漂移）。 */
export function scheduleHintTextFor (platformIds) {
  return t('publishPage.scheduleHintWithLimits', {
    maxDays: effectiveScheduleMaxDays(platformIds),
    minMinutes: Math.round(DEFAULT_MIN_ACCOUNT_INTERVAL_MS / 60000),
  })
}

export function usePublishFieldSurface () {
  const commonFormFields = getCommonFormFields()
  const registryPlatformCount = Object.keys(PLATFORM_PUBLISH_META).length

  return {
    /**
     * 通用字段支持度徽标文案（「N/总数 支持」）。
     * 分母取注册表平台总数而非「所选平台数」——「通用 ≠ 全部支持」要说的是注册表口径，
     * 与用户当前选了几个平台无关（与单篇历史行为逐字一致）。
     * @param {string} fieldKey
     * @returns {string} 空串表示无该字段定义（不渲染徽标）
     */
    fieldSupportText (fieldKey) {
      const field = commonFormFields.find(item => item.key === fieldKey)
      if (!field) return ''
      return t('publishPage.fieldSupport', { count: field.platforms.length, total: registryPlatformCount })
    },

    /**
     * 定时发布能力提示（2026-10-07 平台侧定时改造，PR #3033 真机 E2E 修正）。
     *
     * ⚠️ 为什么不能用 fieldSupportText('schedule')：它统计的是注册表里
     * 「发布链路接入了 schedule 字段」的平台数（15/15），与「该平台能否真的
     * 把排期交给平台服务器」无关。平台侧定时架构下，14 个平台的排期会在
     * 提交前被显式阻断 —— 徽标却宣称 15/15 支持，正是本次改造要消灭的
     * 「以为已排期、实际已发出」的**前置诱因**（用户据此放心勾选）。
     *
     * 本方法按**当前所选平台**给出真实能力：全部支持 ⇒ 放行文案；
     * 存在不支持的平台 ⇒ 点名列出，让用户在勾选阶段就看到后果。
     * @param {string[]} platformIds 当前所选平台
     * @returns {string} 空串表示所选平台全不支持定时（此时提示无意义，交由提交前阻断处理）
     */
    scheduleCapabilityHint (platformIds) {
      const ids = uniqueIds(platformIds)
      if (ids.length === 0) return ''
      const supported = ids.filter(id => isPlatformSideScheduleSupported(id))
      const unsupported = ids.filter(id => !isPlatformSideScheduleSupported(id))
      if (supported.length === 0) return ''
      if (unsupported.length === 0) {
        return t('publishPage.scheduleAllSupported', { platforms: joinLabels(supported) })
      }
      return t('publishPage.schedulePartiallySupported', {
        supported: joinLabels(supported),
        unsupported: joinLabels(unsupported)
      })
    },

    /**
     * 定时 hint：按所选平台显示有效排期上限（2026-10-08，头条 7 天）。
     * 与 validateScheduleEntries 共用同一真源（capability JSON + 全局常量），
     * 避免「文案说 30 天、提交 7 天就被拒」的漂移。
     * 方法名 hintTextFor（非同名包装）：与下方模块级导出 scheduleHintTextFor
     * 同一实现，命名错开以免在方法体内被误读为递归引用。
     * @param {string[]} platformIds 当前所选平台
     * @returns {string}
     */
    hintTextFor (platformIds) {
      return scheduleHintTextFor(platformIds)
    },

    /**
     * 无标题平台提示：所选平台命中任一 titleMode=caption 平台时，说明「标题将作为正文首行」。
     * @param {string[]} platformIds
     * @returns {string} 空串表示无需提示
     */
    noTitleHintFor (platformIds) {
      const noTitleSelected = uniqueIds(platformIds).filter(id => isNoTitlePlatform(id))
      if (noTitleSelected.length === 0) return ''
      return t('publishPage.noTitleHint', { platforms: joinLabels(noTitleSelected) })
    },

    /**
     * 支持 visibility 语义的平台清单（空则可见性控件整块不渲染）。
     * @param {string[]} platformIds
     * @returns {string[]}
     */
    visibilitySupportedIdsFor (platformIds) {
      return uniqueIds(platformIds).filter(id => !!getVisibilityField(id))
    },

    /**
     * 「当前档位有平台不支持」提示（如实告知，不静默丢弃用户选择）。
     * @param {string[]} platformIds
     * @param {string} semantic 当前语义档位（'' | public | friends | private）
     * @returns {string} 空串表示不需要提示（未选档位，或所选平台全部支持该档位）
     */
    visibilityUnsupportedHintFor (platformIds, semantic) {
      if (!semantic) return ''
      const support = getVisibilitySemanticSupport()
      const supportedIds = (support[semantic] || [])
      const unsupported = uniqueIds(platformIds)
        .filter(id => !!getVisibilityField(id))
        .filter(id => !supportedIds.includes(id))
      if (unsupported.length === 0) return ''
      return t('publishPage.visibilityUnsupported', { platforms: joinLabels(unsupported) })
    },

    /**
     * 平台差异化面板的平台规格（面板 props 形态：{ id, label, titleMax, contentMax }）。
     * 标签取自传入的平台目录（与页面显示一致），限制取自注册表。
     * @param {Array<{id: string, label?: string}>} catalog 平台目录
     * @param {string[]} platformIds
     * @returns {Array<object>}
     */
    overridePlatformSpecsFor (catalog, platformIds) {
      const selected = uniqueIds(platformIds)
      return (Array.isArray(catalog) ? catalog : [])
        .filter(platform => selected.includes(platform.id))
        .map(platform => ({ ...platform, ...getPlatformContentLimit(platform.id) }))
    },
  }
}
