// @ts-check
/**
 * aspect-ratio.js — 图片宽高比契约的**单一真源**（2026-10-06 fix-s2v-image-aspect-adapters）
 *
 * ## 为什么有这个文件
 *
 * Story2Video 竖屏成片出现「成片 720x1280、图片却是横屏、两侧黑边」的根因不是某一个
 * 适配器写错，而是**画幅契约没有单一真源**：每个图片适配器各自决定「怎么读画幅参数、
 * 怎么把它翻译成供应商要的尺寸」，于是同一份 `aspect_ratio: '9:16'` 在 9 个图片适配器里
 * 有 6 个被静默丢弃（openai-image / grok-image / recraft / flux / local-diffusion /
 * comfyui），供应商退回各自的横屏/方图默认值。
 *
 * 2026-10-02 的 fix-s2v-portrait-image-aspect（PR #2787）只补了 agnes-image 一个适配器
 * （`params.ratio` → `params.aspect_ratio || params.aspectRatio || params.ratio`），
 * 于是换任何其他图片 Provider 都会原样复现同一个 bug。
 *
 * 本文件把三件事收敛成唯一实现，各适配器只做「供应商方言」翻译，不再各自发明解析：
 *
 * 1. **读**：readAspectRatio —— 统一按 `aspect_ratio`（snake，流水线主键）→
 *    `aspectRatio`（camel，normalizer 契约）→ `ratio`（供应商请求体字段名，历史别名）
 *    的优先级读一次，消灭「各适配器认不同的键」。
 * 2. **解析**：parseAspectRatio —— 把 `'9:16'` / `'9:16 '` 归一成整数比，非法值返回 null
 *    （**fail-open 到调用方既有兜底**，绝不抛错打断生成）。
 * 3. **翻译**：resolveAspectPixelSize / pickClosestSize —— 画幅 → 像素尺寸；
 *    供应商只接受固定枚举时（OpenAI/DALL·E 只给三档）用 pickClosestSize 取最接近档位。
 *
 * ## 尺寸档位口径
 *
 * 默认长边 1024、短边按比例吸附到 8 的倍数（模型侧下采样更稳）：
 *   16:9 → 1024x576    9:16 → 576x1024
 *    4:3 → 1024x768     3:4 → 768x1024
 *    1:1 → 1024x1024
 * 注意：这**不是**成片分辨率（成片由 compose 阶段按 output resolution 决定），
 * 只用于「按画幅出图」，避免把 720x1280 直接当出图尺寸（多数供应商不支持任意尺寸）。
 */

/**
 * 统一画幅契约键的读取顺序。
 * 任何新增图片适配器都必须用 readAspectRatio 读画幅，禁止自定义优先级。
 * @type {readonly string[]}
 */
const ASPECT_RATIO_CONTRACT_KEYS = Object.freeze(['aspect_ratio', 'aspectRatio', 'ratio'])

/** 默认长边（像素）。出图档位与成片分辨率解耦，见文件头「尺寸档位口径」。 */
const DEFAULT_LONG_EDGE = 1024

/** 短边吸附粒度：多数扩散/生成模型要求 8 或 64 的倍数，取 8 兼容性最好。 */
const DEFAULT_SNAP = 8

/** 短边下限：过小（如 64）会让扩散模型退化，钳到 256。 */
const MIN_SHORT_EDGE = 256

/**
 * readAspectRatio — 按统一契约键优先级读取画幅（params.aspect_ratio > aspectRatio > ratio）
 *
 * 三个键都来自既有调用方，保留是为了向后兼容：
 * - `aspect_ratio`：流水线主键（asset-generator / story2video-stages 传的就是它）
 * - `aspectRatio`：渲染层 normalizer 契约键
 * - `ratio`：Agnes / 部分供应商的**请求体**字段名，历史实现误把它当输入参数名
 *
 * @param {object} [params] - 适配器入参
 * @returns {string|null} 原始画幅字符串（未归一，三键皆缺返回 null）
 */
function readAspectRatio (params) {
  if (!params || typeof params !== 'object') return null
  for (const key of ASPECT_RATIO_CONTRACT_KEYS) {
    const value = params[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * parseAspectRatio — 归一化 'W:H' 为整数比
 *
 * 非法输入（空串、非 'W:H'、非正数）返回 null，由调用方走各自既有兜底，
 * 本函数**不抛错**：画幅是增强信息，不该让一次正常出图失败。
 *
 * @param {string|null|undefined} value
 * @returns {{width: number, height: number, ratio: string, isSquare: boolean, isPortrait: boolean}|null}
 */
function parseAspectRatio (value) {
  if (typeof value !== 'string') return null
  const match = /^\s*(\d{1,4})\s*[:xX/]\s*(\d{1,4})\s*$/.exec(value)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    width,
    height,
    ratio: `${width}:${height}`,
    isSquare: width === height,
    isPortrait: height > width,
  }
}

/**
 * resolveAspectPixelSize — 画幅 → 像素尺寸（长边固定、短边按比例吸附）
 *
 * @param {string|null|undefined} aspectRatio - 画幅，如 '9:16'
 * @param {object} [options]
 * @param {number} [options.longEdge=1024] - 长边像素
 * @param {number} [options.snap=8] - 短边吸附粒度
 * @returns {{width: number, height: number}|null} 非法画幅返回 null
 */
function resolveAspectPixelSize (aspectRatio, options = {}) {
  const parsed = parseAspectRatio(aspectRatio)
  if (!parsed) return null
  const longEdge = Number(options.longEdge) > 0 ? Number(options.longEdge) : DEFAULT_LONG_EDGE
  const snap = Number(options.snap) > 0 ? Number(options.snap) : DEFAULT_SNAP
  const long = Math.max(parsed.width, parsed.height)
  const short = Math.min(parsed.width, parsed.height)
  const ratioShort = short / long
  let shortEdge = Math.round((longEdge * ratioShort) / snap) * snap
  shortEdge = Math.max(MIN_SHORT_EDGE, Math.min(longEdge, shortEdge))
  return parsed.width >= parsed.height
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge }
}

/**
 * pickClosestSize — 在供应商固定的尺寸枚举里挑最接近目标画幅的一档
 *
 * 用于「供应商只接受三档尺寸、但也接受用户选画幅」的场景（OpenAI/DALL·E 官方仅
 * 支持 1024x1024 / 1792x1024 / 1024x1792）。判定顺序：
 *   1. 像素完全相同 → 直接命中（优先保证用户显式传的 size）
 *   2. 宽高**方向**相同（都竖/都横/都方）→ 命中该方向唯一档
 *   3. 都比不出来 → 取比例最接近的一档（兜底，保证永远是合法尺寸）
 *
 * @param {string[]} supportedSizes - 供应商支持的尺寸枚举，如 ['1024x1024','1792x1024','1024x1792']
 * @param {string|null|undefined} aspectRatio - 目标画幅
 * @param {string} [fallback] - supportedSizes 为空或全非法时的返回值
 * @returns {string|undefined}
 */
function pickClosestSize (supportedSizes, aspectRatio, fallback) {
  const sizes = (Array.isArray(supportedSizes) ? supportedSizes : [])
    .filter((s) => typeof s === 'string' && /^\d+x\d+$/.test(s))
  if (sizes.length === 0) return fallback
  const parsed = parseAspectRatio(aspectRatio)
  if (!parsed) return fallback

  // 1) 像素完全命中
  const exact = sizes.find((s) => s === `${parsed.width}x${parsed.height}`)
  if (exact) return exact

  // 2) 方向命中
  const sameOrientation = sizes.find((s) => {
    const [w, h] = s.split('x').map(Number)
    if (parsed.isSquare) return w === h
    return parsed.isPortrait ? h > w : w > h
  })
  if (sameOrientation) return sameOrientation

  // 3) 比例最接近
  const target = parsed.width / parsed.height
  let best = sizes[0]
  let bestDelta = Infinity
  for (const s of sizes) {
    const [w, h] = s.split('x').map(Number)
    if (!w || !h) continue
    const delta = Math.abs(w / h - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = s
    }
  }
  return best
}

/**
 * pickClosestAspectRatio — 在供应商的**画幅字符串枚举**里取最接近的一档
 *
 * 与 pickClosestSize 的区别：这里枚举的是 '9:16' 这类画幅串而不是 '1024x1792' 这类
 * 像素尺寸。用于「供应商原生支持画幅参数」的适配器（xAI Grok 的 aspect_ratio 枚举：
 * auto/1:1/16:9/9:16/4:3/3:4/3:2/2:3/2:1/1:2/19.5:9/20:9…）。
 *
 * 精确命中优先；否则取数值比例最接近的一档。枚举里的 'auto' 这类非 'W:H' 值会被跳过
 * （不参与相似度计算）。**画幅缺失或非法时返回调用方兜底值，不臆造画幅** ——
 * 臆造会把「调用方没要求」悄悄变成「强制某画幅」，反而改变既有调用方的行为。
 *
 * @param {string[]} supportedRatios - 供应商支持的画幅枚举
 * @param {string|null|undefined} aspectRatio - 目标画幅
 * @param {string} [fallback] - 画幅非法或枚举不可用时的返回值
 * @returns {string|undefined}
 */
function pickClosestAspectRatio (supportedRatios, aspectRatio, fallback) {
  const ratios = (Array.isArray(supportedRatios) ? supportedRatios : [])
    .filter((s) => typeof s === 'string' && s.trim())
  if (ratios.length === 0) return fallback
  const parsed = parseAspectRatio(aspectRatio)
  if (!parsed) return fallback
  const exact = ratios.find((r) => {
    const p = parseAspectRatio(r)
    return p && p.width === parsed.width && p.height === parsed.height
  })
  if (exact) return exact

  const target = parsed.width / parsed.height
  let best
  let bestDelta = Infinity
  for (const r of ratios) {
    const p = parseAspectRatio(r)
    if (!p) continue
    const delta = Math.abs(p.width / p.height - target)
    if (delta < bestDelta) {
      bestDelta = delta
      best = r
    }
  }
  return best || fallback
}

module.exports = {
  ASPECT_RATIO_CONTRACT_KEYS,
  DEFAULT_LONG_EDGE,
  DEFAULT_SNAP,
  MIN_SHORT_EDGE,
  readAspectRatio,
  parseAspectRatio,
  resolveAspectPixelSize,
  pickClosestSize,
  pickClosestAspectRatio,
}
