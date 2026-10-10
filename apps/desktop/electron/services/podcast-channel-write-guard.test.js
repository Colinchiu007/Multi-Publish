/**
 * podcast 手工写者与一键发布的互斥合同（QM-6 评审 i1 的落点）
 *
 * 为什么不是「把 saveEpisode 也塞进异步锁队列」：手工单集增删是**同步**的读-改-写，
 * 同一事件循环内两条 IPC 不可能互相交错；真正会交错的是跨 await 的一键发布长临界区
 * （读列表 → await 上传/TTS → 写列表）。所以判据只需一问：该频道此刻有没有发布在飞。
 *
 * 夹具纪律：真实 fs + os.tmpdir() 唯一目录；键空间与 registry 的 channelId 同源。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

import PodcastChannelService from './podcast-channel-service'
// ⛔ 必须用 require 取共享实例：主进程全链是 CJS，测试若用 ESM import 会拿到另一份模块实例，
//     判据「service 与测试读同一份忙标记」在这类夹具下结构性不可表示（本仓「双模块实例」同源事故）。
const { channelBusyGate } = require('./podcast-channel-locks')

const CHANNEL_ID = 'ch_guard01'
const VALID_EPISODE = {
  title: '第一期：开场白',
  audioUrl: 'https://cdn.example.com/e1.mp3',
  durationSec: 1830,
  sizeBytes: 44000000,
  guid: 'guid-guard',
  pubDate: '2026-10-01T08:00:00.000Z',
}

let root = ''
const noop = { info () {}, warn () {}, error () {} }
const mk = (channelId) => {
  const dir = path.join(root, 'channels', channelId)
  fs.mkdirSync(dir, { recursive: true })
  return new PodcastChannelService({ channelDir: dir, channelId, logger: noop })
}

beforeEach(() => {
  root = path.join(os.tmpdir(), 'mp-pod-guard-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'))
  fs.mkdirSync(root, { recursive: true })
})

afterEach(() => {
  for (const row of channelBusyGate.snapshot()) channelBusyGate.end(row.channelId)
  fs.rmSync(root, { recursive: true, force: true })
})

describe('podcast 手工写者 × 一键发布互斥', () => {
  it('发布在飞时，四个写入口一律当场拒绝（不得静默改半份 episodes.json）', () => {
    const svc = mk(CHANNEL_ID)
    svc.saveEpisode(VALID_EPISODE)
    expect(channelBusyGate.tryBegin(CHANNEL_ID, { reason: 'oneclick' })).toBe(true)

    expect(() => svc.saveEpisode({ ...VALID_EPISODE, guid: 'guid-2' })).toThrow(/PODCAST_CHANNEL_BUSY/)
    expect(() => svc.removeEpisode('ep-anything')).toThrow(/PODCAST_CHANNEL_BUSY/)
    expect(() => svc.saveChannel({ title: '改名', description: 'd', link: 'https://e.com', authorName: 'a', authorEmail: 'a@e.com', categoryId: 'Technology/Podcasting', feedType: 'episodic', explicit: 'no' })).toThrow(/PODCAST_CHANNEL_BUSY/)
    expect(() => svc.buildFeed()).toThrow(/PODCAST_CHANNEL_BUSY/)

    // 拒绝必须留痕：库里纹丝不动
    expect(svc.listEpisodes()).toHaveLength(1)
  })

  it('发布结束后同一批写入口立即恢复（拒绝不是粘滞态）', () => {
    const svc = mk(CHANNEL_ID)
    channelBusyGate.tryBegin(CHANNEL_ID, {})
    expect(() => svc.saveEpisode(VALID_EPISODE)).toThrow(/PODCAST_CHANNEL_BUSY/)
    channelBusyGate.end(CHANNEL_ID)
    expect(() => svc.saveEpisode(VALID_EPISODE)).not.toThrow()
    expect(svc.listEpisodes()).toHaveLength(1)
  })

  it('忙标记按频道键隔离：别的频道在发布不得挡住本频道的手工编辑', () => {
    const a = mk('ch_guardaa')
    const b = mk('ch_guardbb')
    expect(channelBusyGate.tryBegin('ch_guardaa', {})).toBe(true)
    expect(() => b.saveEpisode({ ...VALID_EPISODE, guid: 'guid-b' })).not.toThrow()
    expect(() => a.saveEpisode({ ...VALID_EPISODE, guid: 'guid-a' })).toThrow(/PODCAST_CHANNEL_BUSY/)
  })

  it('registry 与 service 必须读同一份进程内忙标记（否则判据各说各话）', () => {
    const PodcastChannelRegistry = require('./podcast-channel-registry')
    const reg = new PodcastChannelRegistry({ podcastRoot: root, logger: noop, idFactory: () => CHANNEL_ID })
    expect(reg.isPublishing(CHANNEL_ID)).toBe(false)
    expect(reg.tryBeginPublish(CHANNEL_ID, {})).toBe(true)
    const svc = mk(CHANNEL_ID)
    expect(() => svc.saveEpisode(VALID_EPISODE)).toThrow(/PODCAST_CHANNEL_BUSY/)
    reg.endPublish(CHANNEL_ID)
    expect(() => svc.saveEpisode(VALID_EPISODE)).not.toThrow()
  })
})
