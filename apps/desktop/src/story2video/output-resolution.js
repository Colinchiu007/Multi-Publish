// @ts-check
/**
 * 输出分辨率能力开关（运营后台 videoCreation.maxOutputResolution）
 *
 * - '1080p'（默认）：前端所有流程不出现 4K（选项、模板、历史恢复、预估均不展示 4K），
 *   历史/模板中的 4K 分辨率归一化到 1920x1080。
 * - '4k'：允许 3840x2160。
 *
 * 判定以像素面积为界（1080x1920 竖屏与 1920x1080 横屏同级，均属 1080p 档）。
 * 渲染层与主进程 compose 引擎（resolveMaxOutputDimensions / validateResolutionCapability）
 * 使用同一套面积语义，保证前端隐藏与引擎 fail-closed 一致。
 */

export const MAX_OUTPUT_RESOLUTION_KEY = 'videoCreation.maxOutputResolution'

/** 全量输出分辨率选项（按面积升序展示，4K 由开关决定是否出现） */
export const OUTPUT_RESOLUTION_OPTIONS = [
  { value: '720x1280', label: '720×1280（竖屏）' },
  { value: '1920x1080', label: '1920×1080（横屏）' },
  { value: '3840x2160', label: '3840×2160（横屏）' },
  { value: '1080x1920', label: '1080×1920（竖屏）' },
  { value: '1080x1440', label: '1080×1440（竖屏）' },
]

/**
 * 解析能力上限
 * @param {string} [maxKey]
 * @returns {{key: '1080p'|'4k', width: number, height: number}}
 */
export function parseMaxOutputResolution (maxKey) {
  return maxKey === '4k'
    ? { key: '4k', width: 3840, height: 2160 }
    : { key: '1080p', width: 1920, height: 1080 }
}

function parseResolutionPair (value) {
  const [w, h] = String(value || '').split('x').map(Number)
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { width: w, height: h } : null
}

/**
 * 按能力上限过滤输出分辨率选项
 * @param {string} [maxKey]
 * @returns {{value: string, label: string}[]}
 */
export function getOutputResolutionOptions (maxKey = '1080p') {
  const max = parseMaxOutputResolution(maxKey)
  const maxPixels = max.width * max.height
  return OUTPUT_RESOLUTION_OPTIONS.filter((opt) => {
    const pair = parseResolutionPair(opt.value)
    return pair ? pair.width * pair.height <= maxPixels : false
  })
}

/**
 * 归一化分辨率：超限/非法时回退到最高允许档（1080p 档 → 1920x1080，4k 档 → 3840x2160）
 * @param {string} [resolution]
 * @param {string} [maxKey]
 * @returns {string}
 */
export function normalizeResolution (resolution, maxKey = '1080p') {
  const max = parseMaxOutputResolution(maxKey)
  const pair = parseResolutionPair(resolution)
  if (pair && pair.width * pair.height <= max.width * max.height) return `${pair.width}x${pair.height}`
  return `${max.width}x${max.height}`
}
