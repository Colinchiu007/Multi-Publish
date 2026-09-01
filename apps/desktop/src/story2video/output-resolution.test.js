// @ts-check
/**
 * output-resolution — 输出分辨率能力开关单测
 *
 * 回归背景：4K（3840x2160）视频在当前 compose（2x 中间分辨率 zoompan）下会生成
 * 8K 中间画布，资源/时长爆炸（E2E-PENDING 待办 D 同类）；同时图片生成只传 aspect_ratio
 * 并非真 4K。运营后台关闭（默认 1080p）时前端所有流程不得出现 4K。
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_OUTPUT_RESOLUTION_KEY,
  OUTPUT_RESOLUTION_OPTIONS,
  parseMaxOutputResolution,
  getOutputResolutionOptions,
  normalizeResolution,
} from './output-resolution'

describe('parseMaxOutputResolution — 能力上限', () => {
  it('默认/未知值按 1080p（禁止 4K）', () => {
    expect(parseMaxOutputResolution()).toEqual({ key: '1080p', width: 1920, height: 1080 })
    expect(parseMaxOutputResolution('whatever')).toEqual({ key: '1080p', width: 1920, height: 1080 })
  })

  it('4k 档允许 3840x2160', () => {
    expect(parseMaxOutputResolution('4k')).toEqual({ key: '4k', width: 3840, height: 2160 })
  })
})

describe('getOutputResolutionOptions — 前端选项随开关', () => {
  it('1080p（默认）：不出现 3840x2160，保留竖屏/横屏 1080p 档', () => {
    const options = getOutputResolutionOptions('1080p')
    expect(options.map(o => o.value)).toEqual(['720x1280', '1080x1920', '1080x1440', '1080x1080', '1280x720', '1920x1080'])
    expect(options.some(o => o.value === '3840x2160')).toBe(false)
  })

  it('4k：包含 3840x2160', () => {
    const options = getOutputResolutionOptions('4k')
    expect(options.some(o => o.value === '3840x2160')).toBe(true)
    expect(options).toHaveLength(OUTPUT_RESOLUTION_OPTIONS.length)
  })
})

describe('normalizeResolution — 历史/模板 4K 归一化', () => {
  it('1080p 档下 4K → 1920x1080；竖屏 1080x1920 保留', () => {
    expect(normalizeResolution('3840x2160', '1080p')).toBe('1920x1080')
    expect(normalizeResolution('1080x1920', '1080p')).toBe('1080x1920')
    expect(normalizeResolution('1920x1080', '1080p')).toBe('1920x1080')
  })

  it('4k 档下 4K 保留', () => {
    expect(normalizeResolution('3840x2160', '4k')).toBe('3840x2160')
  })

  it('非法/空值回退到最高允许档', () => {
    expect(normalizeResolution('', '1080p')).toBe('1920x1080')
    expect(normalizeResolution('abc', '1080p')).toBe('1920x1080')
    expect(normalizeResolution(null, '4k')).toBe('3840x2160')
  })
})

it('运营配置键与主进程一致', () => {
  expect(MAX_OUTPUT_RESOLUTION_KEY).toBe('videoCreation.maxOutputResolution')
})
