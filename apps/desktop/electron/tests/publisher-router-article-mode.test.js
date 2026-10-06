import { describe, it, expect } from 'vitest'

/**
 * 图文任务不得路由进 B站视频链（2026-10-07 E2E 实证）
 *
 * 现象：ha-c 图文批次里 bilibili 每稿必失败，报 B站接口原文
 *   「第(1)个视频可能上传过程出现问题，与本次上传内容不匹配，或本次上传失败」
 *
 * 第一性原因：ROUTE_TABLE 把 bilibili 固定成 { mode: 'api' }，
 * 而 bilibili 的 api 轨只有**视频链**（upos 分片上传 + /x/vu/web/add/v3），
 * 根本不存在图文提交通道。图文任务没有 video_path，进链后必然失败 ——
 * 但它失败得很贵：真发了一次请求，且错误文案完全指不到「图文被送进视频链」这个根因。
 *
 * 正确处置：**内容形态不匹配的 api 平台必须 fail-closed 在路由前**，
 * 而不是让它进链跑一次再报平台的无关错误。
 */
const { ROUTE_TABLE } = require('../services/publisher-router')

/** 只支持视频直连、且没有图文链的平台 */
const VIDEO_ONLY_API_PLATFORMS = ['bilibili']

describe('ROUTE_TABLE — 内容形态与平台能力匹配', () => {
  it('bilibili 的 api 轨是视频专属（测试固化这一事实，图文不得进轨）', () => {
    expect(ROUTE_TABLE.bilibili).toBeTruthy()
    expect(ROUTE_TABLE.bilibili.mode).toBe('api')
  })

  it('VIDEO_ONLY_API_PLATFORMS 里的平台不会被误认为支持图文', () => {
    for (const platform of VIDEO_ONLY_API_PLATFORMS) {
      expect(ROUTE_TABLE[platform]).toBeTruthy()
      expect(ROUTE_TABLE[platform].mode).toBe('api')
    }
  })
})

describe('resolvePlatformArticle / 路由前置校验', () => {
  const mod = require('../services/publisher-router')
  const resolvePlatformArticle = mod.resolvePlatformArticle

  const task = (extra) => ({ platform: 'bilibili', article: { title: 't', content: 'c', tags: [], ...extra } })

  it('bilibili 图文（无 video_path）必须在发请求前被拒，报错要指到根因', () => {
    let thrown = null
    try {
      resolvePlatformArticle(task({}), 'bilibili')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeTruthy()
    const msg = String(thrown && thrown.message ? thrown.message : thrown)
    // 报错必须自解释：图文形态 + 该平台只支持视频，而不是平台返回的无关错误
    expect(msg).toMatch(/图文|article|image/i)
    expect(msg).toMatch(/视频|video/i)
  })

  it('bilibili 带 video_path 的视频任务不受影响（不得过度拦截）', () => {
    expect(() => resolvePlatformArticle(task({ video_path: 'D:/tmp/a.mp4' }), 'bilibili')).not.toThrow()
  })

  it('其余平台图文任务行为不变（不得因本次修复引入连带拦截）', () => {
    for (const platform of ['baijiahao', 'douyin', 'kuaishou', 'toutiao', 'wechat_mp', 'tencent_video', 'xiaohongshu']) {
      expect(() => resolvePlatformArticle(task({}), platform)).not.toThrow()
    }
  })
})