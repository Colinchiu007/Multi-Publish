// 发布页智能面板显隐记忆（openspec/changes/optimize-publish-right-rail）。
// 契约：展开/收起状态持久化到 localStorage；无记录用默认；localStorage 不可用
// （隐私模式/配额/损坏 JSON）一律降级默认值，绝不抛错阻塞渲染。
// 只允许白名单键落盘，防止未来面板键扩散时把无关数据写进同一存储位。
const STORAGE_KEY = 'publish.panelVisibility.v1'

// 默认值与既有行为一致：标签建议默认展开（showTagPanel=true）、标题助手默认收起（showTitlePanel=false）。
const DEFAULT_PANEL_VISIBILITY = Object.freeze({
  tagSuggester: true,
  titleAssistant: false,
})

function pickValidPrefs (source) {
  const result = {}
  for (const key of Object.keys(DEFAULT_PANEL_VISIBILITY)) {
    if (typeof source?.[key] === 'boolean') result[key] = source[key]
  }
  return result
}

export function readPanelVisibilityPrefs () {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PANEL_VISIBILITY }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_PANEL_VISIBILITY, ...pickValidPrefs(parsed) }
  } catch {
    return { ...DEFAULT_PANEL_VISIBILITY }
  }
}

export function writePanelVisibilityPrefs (prefs) {
  const merged = { ...DEFAULT_PANEL_VISIBILITY, ...pickValidPrefs(prefs) }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // 写失败静默降级：显隐记忆是增强，不是功能前提。
  }
  return merged
}
