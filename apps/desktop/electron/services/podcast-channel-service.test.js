/**
 * PodcastChannelService 回归锁（真实文件系统往返，不 mock fs）
 *
 * 为什么必须用真 fs：本仓踩过「夹具按调用方想象的形状收参数 → 写路径报成功而恢复路径恒为默认」，
 * 「重启后仍生效」类要求必须有一条用真实存储（关闭再重开同一目录）的往返锁。
 * 目录一律 os.tmpdir() + PID/随机后缀（禁止写仓库内共享路径）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

import PodcastChannelService, {
  SERVICE_ERRORS,
  PODCAST_FILES,
} from '../services/podcast-channel-service'

const VALID_CHANNEL = {
  title: '午间电台',
  description: '每天十分钟的科技闲聊',
  language: 'zh-CN',
  author: '老王',
  ownerEmail: 'oldwang@example.com',
  explicit: 'no',
  feedType: 'episodic',
  coverUrl: 'https://example.com/cover.png',
  coverSize: '3000x3000',
  categoryId: 'Technology/Podcasting',
}

const VALID_EPISODE = {
  title: '第一期：开场白',
  audioUrl: 'https://cdn.example.com/e1.mp3',
  durationSec: 1830,
  sizeBytes: 44000000,
  guid: 'guid-1',
  pubDate: '2026-10-01T08:00:00.000Z',
}

let dir = ''
const mk = (opts = {}) => new PodcastChannelService({
  userDataDir: dir,
  logger: { info () {}, warn: (...a) => warns.push(a.join(' ')), error () {} },
  ...opts,
})
let warns = []

beforeEach(() => {
  dir = path.join(os.tmpdir(), 'mp-podcast-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'))
  warns = []
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const channelPath = () => path.join(dir, PODCAST_DIR)
const fileIn = (name) => path.join(channelPath(), name)

const PODCAST_DIR = PODCAST_FILES.PODCAST_DIR_NAME

describe('PodcastChannelService · 路径解析', () => {
  it('显式 userDataDir 优先；无 electron 且无显式目录时 fail closed（不得静默写到相对路径）', () => {
    const svc = new PodcastChannelService({})
    expect(() => svc.resolvePodcastDir()).toThrow(/userData/)
  })

  it('显式 userDataDir 与 app.getPath(\'userData\') 同构：都在其下再建 podcast/ 子目录', () => {
    const app = { getPath: () => dir }
    const viaExplicit = mk().resolvePodcastDir()
    const viaApp = new PodcastChannelService({ app }).resolvePodcastDir()
    expect(viaExplicit).toBe(path.join(dir, PODCAST_DIR))
    expect(viaApp).toBe(path.join(dir, PODCAST_DIR))
    expect(viaExplicit).toBe(viaApp)
  })

  it('存储不可用的错误码是 PODCAST_STORE_UNAVAILABLE（与校验失败分属两档排查方向）', () => {
    const svc = new PodcastChannelService({})
    try {
      svc.getChannel()
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.code).toBe(SERVICE_ERRORS.STORE_UNAVAILABLE)
    }
  })
})

describe('PodcastChannelService · 频道读写', () => {
  it('未配置时回 null，列表回空数组（不是 undefined，渲染层直接遍历）', () => {
    const svc = mk()
    expect(svc.getChannel()).toBeNull()
    expect(svc.listEpisodes()).toEqual([])
  })

  it('保存后重开实例可读回（真实落盘往返）', () => {
    mk().saveChannel(VALID_CHANNEL)
    const again = mk()
    const loaded = again.getChannel()
    expect(loaded.title).toBe('午间电台')
    expect(loaded.createdAt).toMatch(/^\d{4}-/)
    expect(loaded.updatedAt).toMatch(/^\d{4}-/)
  })

  it('再次保存保留 createdAt，只推进 updatedAt', () => {
    const first = mk().saveChannel(VALID_CHANNEL)
    const second = mk().saveChannel({ ...VALID_CHANNEL, title: '改后标题' })
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.title).toBe('改后标题')
  })

  it('校验不过即抛错且不落盘（引擎 issues 逐字透传，频道文件不得出现半成品）', () => {
    const svc = mk()
    let caught = null
    try {
      svc.saveChannel({ ...VALID_CHANNEL, title: '', ownerEmail: 'not-an-email' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeTruthy()
    expect(caught.issues.map((i) => i.code)).toEqual(['CHANNEL_TITLE_REQUIRED', 'CHANNEL_OWNER_EMAIL_INVALID'])
    expect(fs.existsSync(fileIn(PODCAST_FILES.CHANNEL_FILE))).toBe(false)
  })

  it('非对象载荷走引擎同一份判据（CHANNEL_MISSING），不在服务层另写 issue 字面量', () => {
    try {
      mk().saveChannel(null)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e.issues.map((i) => i.code)).toEqual(['CHANNEL_MISSING'])
    }
  })

  it('数据文件损坏：读写一律拒绝（静默回落空值会让下一次保存覆盖用户全部数据）', () => {
    mk().saveChannel(VALID_CHANNEL)
    fs.writeFileSync(fileIn(PODCAST_FILES.CHANNEL_FILE), '{ 这不是 json', 'utf8')
    const svc = mk()
    expect(() => svc.getChannel()).toThrow(/损坏/)
    expect(() => svc.saveChannel(VALID_CHANNEL)).toThrow(/损坏/)
    // 原文件必须保持被破坏的样子（未被覆盖成新数据）
    expect(fs.readFileSync(fileIn(PODCAST_FILES.CHANNEL_FILE), 'utf8')).toBe('{ 这不是 json')
    expect(warns.join('|')).toContain('store corrupt')
  })

  it('原子写不留临时文件（成功与失败路径都要收口）', () => {
    mk().saveChannel(VALID_CHANNEL)
    expect(fs.readdirSync(channelPath()).filter((f) => f.includes('.tmp.'))).toEqual([])
  })

  it('Windows 瞬时占用：仅对 EPERM/EACCES/EBUSY 有界重试，其它码原样抛出', () => {
    const codes = ['EPERM', 'EACCES', 'EBUSY']
    let attempt = 0
    const fsImpl = {
      mkdirSync () {}, existsSync: () => false,
      readFileSync () { return '{}' },
      writeFileSync () {},
      renameSync () {
        attempt += 1
        const err = new Error('locked')
        err.code = codes[attempt - 1] || 'EPERM'
        if (attempt < 3) throw err
      },
      rmSync () {},
    }
    const svc = new PodcastChannelService({ userDataDir: dir, fs: fsImpl, renameRetryDelaysMs: [0, 0, 0], logger: { info () {}, warn () {}, error () {} } })
    if (process.platform === 'win32') {
      svc.saveChannel(VALID_CHANNEL)
      expect(attempt).toBe(3)
    } else {
      // 非 win32：atomicRenameSync 的判据里重试只对 win32 开放，第一跳即原样抛出
      expect(() => svc.saveChannel(VALID_CHANNEL)).toThrow(/locked/)
      expect(attempt).toBe(1)
    }

    const boom = new Error('disk gone')
    boom.code = 'ENOSPC'
    const fsImpl2 = {
      mkdirSync () {}, existsSync: () => false, readFileSync () { return '{}' },
      writeFileSync () {}, rmSync () {},
      renameSync () { throw boom },
    }
    const svc2 = new PodcastChannelService({ userDataDir: dir, fs: fsImpl2, renameRetryDelaysMs: [0, 0], logger: { info () {}, warn () {}, error () {} } })
    expect(() => svc2.saveChannel(VALID_CHANNEL)).toThrow(/disk gone/)
  })
})

describe('PodcastChannelService · 单集', () => {
  it('同 id 原地更新不产生第二条；换入口按 guid 命中同一集', () => {
    const svc = mk()
    const created = svc.saveEpisode(VALID_EPISODE)
    svc.saveEpisode({ ...VALID_EPISODE, title: '改后标题' })
    svc.saveEpisode({ ...VALID_EPISODE, id: 'other-id', guid: created.guid, title: '第三条写入尝试' })
    const list = svc.listEpisodes()
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('第三条写入尝试')
    expect(list[0].id).toBe(created.id)
  })

  it('未知 id 删除返回 false，且列表不变', () => {
    const svc = mk()
    svc.saveEpisode(VALID_EPISODE)
    expect(svc.removeEpisode('不存在')).toBe(false)
    expect(svc.removeEpisode('')).toBe(false)
    expect(svc.listEpisodes()).toHaveLength(1)
    expect(svc.removeEpisode(svc.listEpisodes()[0].id)).toBe(true)
    expect(svc.listEpisodes()).toEqual([])
  })

  it('单集允许「只有本地文件、暂无 https 直链」的中间态（fail closed 留给构建）', () => {
    const svc = mk()
    const saved = svc.saveEpisode({ title: '待托管', localFilePath: 'D:/audio/e1.mp3', durationSec: 60, sizeBytes: 10 })
    expect(saved.id).toMatch(/^ep_/)
    expect(svc.listEpisodes()).toHaveLength(1)
  })
})

describe('PodcastChannelService · 构建与自检', () => {
  it('构建产物落盘，itemCount 取自自家产物的解析结果，且不回传 xml 正文', () => {
    const svc = mk({ now: () => new Date('2026-10-09T00:00:00.000Z') })
    svc.saveChannel(VALID_CHANNEL)
    svc.saveEpisode(VALID_EPISODE)
    const r = svc.buildFeed()
    expect(fs.existsSync(r.path)).toBe(true)
    expect(r.itemCount).toBe(1)
    expect(r.bytes).toBeGreaterThan(0)
    expect(Object.keys(r).sort()).toEqual(['bytes', 'itemCount', 'path'])
    const xml = fs.readFileSync(r.path, 'utf8')
    expect(xml.split('\n')[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<itunes:category text="Technology">')
    expect(xml).toContain('guid-1')
    // 构建时间来自注入的 now（确定性）：2026-10-09T00:00:00Z ⇒ GMT 字符串逐字固定
    expect(xml).toContain('<lastBuildDate>Fri, 09 Oct 2026 00:00:00 GMT</lastBuildDate>')
    expect(xml).toContain('<itunes:duration>30:30</itunes:duration>')
  })

  it('无单集时构建被引擎拒绝且不写出任何 feed 文件（禁止半成品覆盖上一版）', () => {
    const svc = mk()
    svc.saveChannel(VALID_CHANNEL)
    fs.writeFileSync(fileIn(PODCAST_FILES.FEED_FILE), '<old/>', 'utf8')
    expect(() => svc.buildFeed()).toThrow(/PODCAST_FEED_INVALID/)
    expect(fs.readFileSync(fileIn(PODCAST_FILES.FEED_FILE), 'utf8')).toBe('<old/>')
    expect(fs.readdirSync(channelPath()).filter((f) => f.includes('.tmp.'))).toEqual([])
  })

  it('仅有本地文件时构建拒绝为 EPISODE_HOSTING_NOT_CONFIGURED（不是静默跳过该集）', () => {
    const svc = mk()
    svc.saveChannel(VALID_CHANNEL)
    svc.saveEpisode({ title: '待托管', localFilePath: 'D:/a.mp3', durationSec: 60, sizeBytes: 10, guid: 'g' })
    let caught = null
    try { svc.buildFeed() } catch (e) { caught = e }
    expect(caught.issues.map((i) => i.code)).toContain('EPISODE_HOSTING_NOT_CONFIGURED')
  })

  it('尚未构建时自检回 FEED_NOT_BUILT，与「构建出来但不合格」分档', async () => {
    const r = await mk().verifyFeed()
    expect(r.issues.map((i) => i.code)).toEqual([SERVICE_ERRORS.FEED_NOT_BUILT])
    expect(r.checks).toEqual([])
    expect(r.itemCount).toBe(0)
  })

  it('默认不注入 headImpl ⇒ 零真实出站，日志标 head=off', async () => {
    const svc = mk({ now: () => new Date('2026-10-09T00:00:00.000Z') })
    svc.saveChannel(VALID_CHANNEL)
    svc.saveEpisode(VALID_EPISODE)
    svc.buildFeed()
    const r = await svc.verifyFeed()
    expect(r.itemCount).toBe(1)
    expect(r.checks.filter((c) => c.network === true)).toEqual([])
    expect(warns.join('|')).toBe('')
  })

  it('注入 headImpl 时才做可达性检查，且探针收到本集地址', async () => {
    const seen = []
    const svc = mk({
      now: () => new Date('2026-10-09T00:00:00.000Z'),
      headImpl: async (url) => { seen.push(url); return { status: 404 } },
    })
    svc.saveChannel(VALID_CHANNEL)
    svc.saveEpisode(VALID_EPISODE)
    svc.buildFeed()
    const r = await svc.verifyFeed()
    expect(seen).toEqual(['https://cdn.example.com/e1.mp3'])
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('feed 文件读取失败按存储不可用出声，不得当成「自检通过」', () => {
    const svc = new PodcastChannelService({
      userDataDir: dir,
      fs: { mkdirSync () {}, existsSync: () => true, readFileSync: () => { throw new Error('EIO') }, writeFileSync () {}, renameSync () {}, rmSync () {} },
      logger: { info () {}, warn () {}, error () {} },
    })
    return expect(svc.verifyFeed()).rejects.toThrow(/读取失败/)
  })

  it('分发端目录直接透传共享层（服务层不得加判断）', () => {
    expect(mk().listEndpoints().map((e) => e.id)).toEqual(['xiaoyuzhou', 'apple_podcasts', 'spotify'])
  })
})
