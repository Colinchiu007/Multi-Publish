import { describe, expect, it } from 'vitest'
import {
  VIDEO_MAX_BYTES,
  classifyVideoSelection,
  describeVideoFile,
  isVideoOversize,
} from './video-selection-feedback'

describe('video-selection-feedback（选择反馈纯逻辑）', () => {
  it('VIDEO_MAX_BYTES 固定为 500MB', () => {
    expect(VIDEO_MAX_BYTES).toBe(500 * 1024 * 1024)
  })

  it.each([
    [500 * 1024 * 1024, false],
    [500 * 1024 * 1024 + 1, true],
    [600 * 1024 * 1024, true],
    [0, false],
    [NaN, false],
    [undefined, false],
    [-1, false],
  ])('isVideoOversize(%s) === %s', (size, expected) => {
    expect(isVideoOversize(size)).toBe(expected)
  })

  it('describeVideoFile 提取文件名/大小/格式（type 优先，扩展名兜底）', () => {
    expect(describeVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 2048 })).toEqual({
      name: 'a.mp4',
      sizeBytes: 2048,
      formatLabel: 'MP4',
    })
    expect(describeVideoFile({ name: 'b.MOV', type: '', size: 10 })).toEqual({
      name: 'b.MOV',
      sizeBytes: 10,
      formatLabel: 'MOV',
    })
    expect(describeVideoFile({ path: 'D:/media/clip.avi', name: '', size: undefined }).name).toBe('clip.avi')
    expect(describeVideoFile({ name: 'c.mp4', size: -5 }).sizeBytes).toBeNull()
  })

  it('classifyVideoSelection: 首次选择（无旧路径）', () => {
    expect(classifyVideoSelection({ prevPath: '', nextPath: 'D:/a.mp4', sizeBytes: 10 })).toBe('first')
  })

  it('classifyVideoSelection: 替换不同文件', () => {
    expect(classifyVideoSelection({ prevPath: 'D:/a.mp4', nextPath: 'D:/b.mp4', sizeBytes: 10 })).toBe('replaced')
  })

  it('classifyVideoSelection: 同文件重选', () => {
    expect(classifyVideoSelection({ prevPath: 'D:/a.mp4', nextPath: 'D:/a.mp4', sizeBytes: 10 })).toBe('reselected')
  })

  it('classifyVideoSelection: 超限优先于其他形态', () => {
    expect(classifyVideoSelection({
      prevPath: '', nextPath: 'D:/big.mp4', sizeBytes: VIDEO_MAX_BYTES + 1,
    })).toBe('oversize')
  })

  it('classifyVideoSelection: 路径解析失败兜底为 unresolved', () => {
    expect(classifyVideoSelection({ prevPath: '', nextPath: '', sizeBytes: 10 })).toBe('unresolved')
  })
})
