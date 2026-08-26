import { getAppLocale } from '@/i18n'

/**
 * 统一时间戳格式化（unify-desktop-frontend 2.4：收敛 10 处视图级 formatTime 副本）
 *
 * 语义约定：
 * - 空值 → emptyText（默认 ''）
 * - 解析失败 → invalidText（默认 ''），绝不向调用方抛异常（钉死 Dashboard 旧变体缺 try 的缺陷）
 * - locale 默认跟随应用语言（getAppLocale），zh 用户渲染与旧固定 zh-CN 输出一致
 *
 * 样式对照（迁移来源）：
 * - full          完整日期时间（24h）      （ApprovalGateModal/usePipelineHistory/Intelligence/PublishHistory/create-view-utils）
 * - short         短月+日+时分            （ProjectCard）
 * - numeric-short 数字月+日+时分          （Home）
 * - time          时:分:秒 24h            （ContactSheetView/ReplayTimeline/Intelligence）
 * - time-seconds  时:分:秒 显式秒         （ProductionBoard）
 * - hour-minute   仅时:分                 （Dashboard）
 */

function resolveLocale (locale) {
  if (locale) return locale
  return getAppLocale() === 'en' ? 'en-US' : 'zh-CN'
}

export function formatDateTime (value, options = {}) {
  const {
    style = 'full',
    emptyText = '',
    invalidText = '',
    locale,
  } = options

  if (!value) return emptyText

  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return typeof invalidText === 'string' ? invalidText : ''
    const loc = resolveLocale(locale)

    switch (style) {
      case 'short':
        return d.toLocaleDateString(loc, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      case 'numeric-short':
        return d.toLocaleString(loc, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      case 'time':
        return d.toLocaleTimeString(loc, { hour12: false })
      case 'time-seconds':
        return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      case 'hour-minute':
        return d.toLocaleString(loc, { hour: '2-digit', minute: '2-digit' })
      case 'full':
      default:
        return d.toLocaleString(loc, { hour12: false })
    }
  } catch {
    return typeof invalidText === 'string' ? invalidText : ''
  }
}
