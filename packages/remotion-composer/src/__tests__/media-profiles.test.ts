import { describe, it, expect } from 'vitest'
import {
  getProfile,
  listProfiles,
  getRemotionArgs,
  getFfmpegArgs,
  type MediaProfile,
} from '../media-profiles'

// media-profiles 单元测试
// 覆盖 getProfile / listProfiles / getRemotionArgs / getFfmpegArgs 四个公共导出

// 内置 9 个 profile 的 id 列表（与源码 PROFILES 数组保持一致）
const EXPECTED_PROFILE_IDS = [
  'youtube-landscape',
  'youtube-4k',
  'youtube-shorts',
  'tiktok',
  'instagram-reels',
  'wechat',
  'bilibili',
  'xiaohongshu',
  'generic-hd',
]

describe('listProfiles - 返回所有内置 profile', () => {
  it('返回的数组包含全部 9 个 profile', () => {
    const profiles = listProfiles()
    expect(profiles).toHaveLength(9)
    expect(profiles.map((p) => p.id).sort()).toEqual([...EXPECTED_PROFILE_IDS].sort())
  })

  it('每个 profile 包含 id / name / width / height / fps 字段', () => {
    const profiles = listProfiles()
    for (const p of profiles) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.width).toBe('number')
      expect(typeof p.height).toBe('number')
      expect(typeof p.fps).toBe('number')
    }
  })

  it('每个 profile 的 width / height / fps 均为正数', () => {
    const profiles = listProfiles()
    for (const p of profiles) {
      expect(p.width).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
      expect(p.fps).toBeGreaterThan(0)
    }
  })

  it('返回的是数组副本，修改不影响后续调用（浅拷贝验证）', () => {
    const a = listProfiles()
    const b = listProfiles()
    expect(a).not.toBe(b) // 不是同一引用
    expect(a).toEqual(b) // 但内容相等
    // 修改 a 不应影响 b
    a.push({ id: 'fake', name: 'fake', width: 1, height: 1, fps: 1 })
    expect(listProfiles()).toHaveLength(9)
  })

  it('所有 profile 的 id 唯一不重复', () => {
    const profiles = listProfiles()
    const ids = profiles.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('所有 profile 的 fps 均为 30', () => {
    const profiles = listProfiles()
    for (const p of profiles) {
      expect(p.fps).toBe(30)
    }
  })
})

describe('listProfiles - 关键 profile 字段验证', () => {
  it('youtube-landscape 为 1920x1080 横屏', () => {
    const p = getProfile('youtube-landscape')
    expect(p.width).toBe(1920)
    expect(p.height).toBe(1080)
    expect(p.videoBitrate).toBe('8M')
    expect(p.audioBitrate).toBe('192k')
    expect(p.maxDurationSeconds).toBeUndefined()
  })

  it('youtube-4k 为 3840x2160 4K', () => {
    const p = getProfile('youtube-4k')
    expect(p.width).toBe(3840)
    expect(p.height).toBe(2160)
    expect(p.videoBitrate).toBe('20M')
    expect(p.audioBitrate).toBe('256k')
  })

  it('tiktok 为 1080x1920 竖屏，maxDuration 180s', () => {
    const p = getProfile('tiktok')
    expect(p.width).toBe(1080)
    expect(p.height).toBe(1920)
    expect(p.maxDurationSeconds).toBe(180)
  })

  it('youtube-shorts maxDuration 60s', () => {
    const p = getProfile('youtube-shorts')
    expect(p.maxDurationSeconds).toBe(60)
  })

  it('instagram-reels maxDuration 90s', () => {
    const p = getProfile('instagram-reels')
    expect(p.maxDurationSeconds).toBe(90)
  })

  it('wechat 微信视频号 maxDuration 60s', () => {
    const p = getProfile('wechat')
    expect(p.maxDurationSeconds).toBe(60)
  })

  it('bilibili B站 为 1920x1080 横屏', () => {
    const p = getProfile('bilibili')
    expect(p.width).toBe(1920)
    expect(p.height).toBe(1080)
  })

  it('xiaohongshu 小红书 为 1080x1440', () => {
    const p = getProfile('xiaohongshu')
    expect(p.width).toBe(1080)
    expect(p.height).toBe(1440)
    expect(p.maxDurationSeconds).toBe(60)
  })

  it('generic-hd 通用 HD 为 1920x1080', () => {
    const p = getProfile('generic-hd')
    expect(p.width).toBe(1920)
    expect(p.height).toBe(1080)
    expect(p.videoBitrate).toBe('6M')
    expect(p.audioBitrate).toBe('128k')
    expect(p.maxDurationSeconds).toBeUndefined()
  })
})

describe('getProfile - 已知 id', () => {
  it('每个已知 id 都能返回对应 profile', () => {
    EXPECTED_PROFILE_IDS.forEach((id) => {
      const p = getProfile(id)
      expect(p.id).toBe(id)
    })
  })

  it('返回的 profile 与 listProfiles 中的对应项字段一致', () => {
    const profiles = listProfiles()
    for (const expected of profiles) {
      const actual = getProfile(expected.id)
      expect(actual).toEqual(expected)
    }
  })

  it('getProfile("youtube-landscape").name 为中文名称', () => {
    expect(getProfile('youtube-landscape').name).toBe('YouTube 横屏')
  })
})

describe('getProfile - 未知 id 回退到 generic-hd', () => {
  it('未知 id 返回 generic-hd', () => {
    const p = getProfile('non-existent-id')
    expect(p.id).toBe('generic-hd')
  })

  it('空字符串 id 返回 generic-hd', () => {
    const p = getProfile('')
    expect(p.id).toBe('generic-hd')
  })

  it('大小写不匹配时回退（profileMap.get 大小写敏感）', () => {
    const p = getProfile('YouTube-Landscape')
    expect(p.id).toBe('generic-hd')
  })

  it('传入 undefined（运行时容错）回退到 generic-hd', () => {
    // 虽然 TS 签名要求 string，但运行时可能传入 undefined
    // 源码：profileMap.get(undefined) → undefined → || generic-hd
    const p = getProfile(undefined as unknown as string)
    expect(p.id).toBe('generic-hd')
  })
})

describe('getRemotionArgs', () => {
  it('返回 6 个元素的字符串数组', () => {
    const profile = getProfile('youtube-landscape')
    const args = getRemotionArgs(profile)
    expect(args).toHaveLength(6)
    for (const a of args) {
      expect(typeof a).toBe('string')
    }
  })

  it('youtube-landscape (1920x1080@30) 生成正确的参数', () => {
    const profile = getProfile('youtube-landscape')
    const args = getRemotionArgs(profile)
    expect(args).toEqual(['--width', '1920', '--height', '1080', '--fps', '30'])
  })

  it('youtube-4k (3840x2160@30) 生成正确的参数', () => {
    const profile = getProfile('youtube-4k')
    const args = getRemotionArgs(profile)
    expect(args).toEqual(['--width', '3840', '--height', '2160', '--fps', '30'])
  })

  it('tiktok (1080x1920@30) 生成正确的参数', () => {
    const profile = getProfile('tiktok')
    const args = getRemotionArgs(profile)
    expect(args).toEqual(['--width', '1080', '--height', '1920', '--fps', '30'])
  })

  it('参数顺序为 width → height → fps', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 1234,
      height: 5678,
      fps: 60,
    }
    const args = getRemotionArgs(profile)
    expect(args).toEqual(['--width', '1234', '--height', '5678', '--fps', '60'])
  })

  it('width/height/fps 数字被 String() 转换为字符串', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 100,
      height: 200,
      fps: 30,
    }
    const args = getRemotionArgs(profile)
    expect(args[1]).toBe('100')
    expect(args[3]).toBe('200')
    expect(args[5]).toBe('30')
  })
})

describe('getFfmpegArgs', () => {
  it('youtube-landscape 返回 video + audio 码率参数（4 个元素）', () => {
    const profile = getProfile('youtube-landscape')
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:v', '8M', '-b:a', '192k'])
    expect(args).toHaveLength(4)
  })

  it('youtube-4k 返回 20M + 256k', () => {
    const profile = getProfile('youtube-4k')
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:v', '20M', '-b:a', '256k'])
  })

  it('generic-hd 返回 6M + 128k', () => {
    const profile = getProfile('generic-hd')
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:v', '6M', '-b:a', '128k'])
  })

  it('所有内置 profile 都返回 4 个参数（video+audio 码率都存在）', () => {
    const profiles = listProfiles()
    for (const p of profiles) {
      const args = getFfmpegArgs(p)
      expect(args).toHaveLength(4)
      expect(args[0]).toBe('-b:v')
      expect(args[2]).toBe('-b:a')
    }
  })

  it('参数顺序为 -b:v <videoBitrate> -b:a <audioBitrate>', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrate: '5M',
      audioBitrate: '160k',
    }
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:v', '5M', '-b:a', '160k'])
  })

  it('profile 缺失 videoBitrate 时跳过 -b:v 参数', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 1920,
      height: 1080,
      fps: 30,
      audioBitrate: '128k',
    }
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:a', '128k'])
  })

  it('profile 缺失 audioBitrate 时跳过 -b:a 参数', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 1920,
      height: 1080,
      fps: 30,
      videoBitrate: '8M',
    }
    const args = getFfmpegArgs(profile)
    expect(args).toEqual(['-b:v', '8M'])
  })

  it('profile 同时缺失 videoBitrate 和 audioBitrate 时返回空数组', () => {
    const profile: MediaProfile = {
      id: 'test',
      name: 'test',
      width: 1920,
      height: 1080,
      fps: 30,
    }
    const args = getFfmpegArgs(profile)
    expect(args).toEqual([])
  })
})

describe('综合 - 集成使用场景', () => {
  it('listProfiles + getProfile 配合使用一致', () => {
    const all = listProfiles()
    for (const p of all) {
      // 用 listProfiles 拿到的 id 反查 getProfile
      const fetched = getProfile(p.id)
      expect(fetched).toEqual(p)
    }
  })

  it('遍历所有 profile 生成 remotion + ffmpeg 参数，参数数量符合预期', () => {
    const all = listProfiles()
    for (const p of all) {
      const rArgs = getRemotionArgs(p)
      const fArgs = getFfmpegArgs(p)
      expect(rArgs).toHaveLength(6)
      // 所有内置 profile 都有 videoBitrate 和 audioBitrate
      expect(fArgs).toHaveLength(4)
    }
  })

  it('未知 profile id 经回退后仍可生成有效参数', () => {
    const p = getProfile('unknown-platform')
    expect(p.id).toBe('generic-hd')
    const rArgs = getRemotionArgs(p)
    const fArgs = getFfmpegArgs(p)
    expect(rArgs).toEqual(['--width', '1920', '--height', '1080', '--fps', '30'])
    expect(fArgs).toEqual(['-b:v', '6M', '-b:a', '128k'])
  })
})
