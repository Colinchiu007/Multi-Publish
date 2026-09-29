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

const t = (key, params) => i18n.global.t(key, params)

function uniqueIds (platformIds) {
  return [...new Set((Array.isArray(platformIds) ? platformIds : [])
    .filter(id => typeof id === 'string' && id.trim()))]
}

function joinLabels (platformIds) {
  return platformIds.map(id => getPlatformLabel(id)).join('、')
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
