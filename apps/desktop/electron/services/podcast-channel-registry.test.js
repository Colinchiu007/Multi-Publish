/**
 * podcast-channel-registry 行为合同（刀 1 的多频道与迁移）
 *
 * 夹具纪律（AGENTS.md「恢复/兜底类测试」同族）：
 * - 一律用真实 fs + os.tmpdir() 唯一目录，禁止仓库内共享路径；
 * - 迁移用例必须从**非空 legacy** 出发 —— "每例重建空目录"的夹具对存量漂移完全免疫；
 * - 断言落在落盘产物与返回值上，不断言实现细节。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

import PodcastChannelRegistry from './podcast-channel-registry'
import { REGISTRY_ERRORS, CHANNEL_ID_RE } from './podcast-channel-registry'
import { ITEMS_MAX } from '@multi-publish/shared-utils/src/podcast-rss'

let root = ''
const mk = (opts = {}) => new PodcastChannelRegistry({ podcastRoot: root, logger: { info () {}, warn () {}, error () {} }, ...opts })
const write = (name, obj) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
  fs.writeFileSync(path.join(root, name), JSON.stringify(obj, null, 2), 'utf8')
}
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))

beforeEach(() => {
  root = path.join(os.tmpdir(), 'mp-pod-reg-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'))
  fs.mkdirSync(root, { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('podcast-channel-registry · 空库与新建', () => {
  it('空目录：迁移落 migratedAt，频道列表如实为空且 empty=true（不得凭空造默认频道）', async () => {
    const reg = mk()
    const listed = await reg.listChannels()
    expect(listed.empty).toBe(true)
    expect(listed.channels).toEqual([])
    expect(read('index.json').migratedAt).toMatch(/T/)
  })

  it('createChannel 分配的 id 必须匹配 ^ch_[a-z0-9]{4,16}$ 且目录名与之相等', async () => {
    const reg = mk()
    const created = await reg.createChannel('午间电台')
    expect(CHANNEL_ID_RE.test(created.channel.id)).toBe(true)
    expect(fs.existsSync(path.join(root, 'channels', created.channel.id))).toBe(true)
    expect((await reg.listChannels()).defaultChannelId).toBe(created.channel.id)
  })

  it('频道名为空即拒绝，不得创建匿名频道', async () => {
    const reg = mk()
    await expect(reg.createChannel('   ')).rejects.toThrow(/PODCAST_CHANNEL_NAME_REQUIRED/)
  })

  it('第一个频道自动成为默认频道；setDefault 只能指向存在的频道', async () => {
    const reg = mk()
    const a = await reg.createChannel('A')
    const b = await reg.createChannel('B')
    expect((await reg.listChannels()).defaultChannelId).toBe(a.channel.id)
    await reg.setDefaultChannel(b.channel.id)
    expect((await reg.listChannels()).defaultChannelId).toBe(b.channel.id)
    await expect(reg.setDefaultChannel('ch_deadbeef')).rejects.toMatchObject({ code: REGISTRY_ERRORS.CHANNEL_NOT_FOUND })
  })
})

describe('podcast-channel-registry · 存量迁移', () => {
  const legacyChannel = { title: '午间电台', description: 'd', link: 'https://x.example/f.xml', language: 'zh-CN', author: 'A', ownerName: 'O', ownerEmail: 'o@example.com', explicit: 'no', feedType: 'episodic', coverUrl: 'https://x.example/c.jpg', coverSize: '3000x3000', category: 'Arts', subCategory: 'Design', audioSource: 'url' }
  const legacyEpisodes = [{ id: 'ep-1', title: '第一期', audioUrl: 'https://cdn.example.com/e1.mp3', durationSec: 1830, sizeBytes: 44000000, pubDate: '2026-10-01T08:00:00.000Z' }]

  it('非空 legacy 被搬进合规 ch_ 频道，字段值逐字保留（含 guid 缺席时不得补写）', async () => {
    write('channel.json', { version: 1, channel: legacyChannel })
    write('episodes.json', { version: 1, episodes: legacyEpisodes })
    const reg = mk()
    const listed = await reg.listChannels()
    expect(listed.channels).toHaveLength(1)
    const id = listed.channels[0].id
    expect(CHANNEL_ID_RE.test(id)).toBe(true)
    expect(listed.defaultChannelId).toBe(id)
    const stored = read(path.join('channels', id, 'channel.json'))
    expect(stored.meta).toEqual(legacyChannel)
    const eps = read(path.join('channels', id, 'episodes.json'))
    expect(eps.episodes[0]).toEqual(legacyEpisodes[0])
    expect(eps.episodes[0].guid).toBeUndefined()
    // legacy 原件必须仍在（回滚依据，R0 不删）
    expect(fs.existsSync(path.join(root, 'channel.json'))).toBe(true)
  })

  it('迁移幂等：重跑不得产生第二个频道或重复条目', async () => {
    write('channel.json', { version: 1, channel: legacyChannel })
    write('episodes.json', { version: 1, episodes: legacyEpisodes })
    const reg = mk()
    const first = await reg.listChannels()
    const again = await reg.listChannels()
    expect(again.channels).toHaveLength(first.channels.length)
    expect(again.channels.map((c) => c.id)).toEqual(first.channels.map((c) => c.id))
    expect(read('index.json').migrationStatus || '').toBe('')
  })

  it('目标半复制且来源完整 → 静默续传，不得误判成 conflict', async () => {
    write('channel.json', { version: 1, channel: legacyChannel })
    write('episodes.json', { version: 1, episodes: legacyEpisodes })
    const halfId = 'ch_halfhalf'
    write(path.join('channels', halfId, 'channel.json'), { version: 1, meta: legacyChannel, feedSync: null })
    const reg = mk({ idFactory: () => halfId })
    const listed = await reg.listChannels()
    expect(listed.migrationStatus || '').not.toBe('conflict')
    const eps = read(path.join('channels', halfId, 'episodes.json'))
    expect(eps.episodes).toHaveLength(1)
  })

  it('目标与来源各为不同合法内容 → conflict 且必须人工 resolve，绝不静默选一份', async () => {
    write('channel.json', { version: 1, channel: legacyChannel })
    write('episodes.json', { version: 1, episodes: legacyEpisodes })
    const otherId = 'ch_otherone'
    write(path.join('channels', otherId, 'channel.json'), {
      version: 1, meta: Object.assign({}, legacyChannel, { title: '另一个节目' }), feedSync: null,
    })
    write(path.join('channels', otherId, 'episodes.json'), { version: 1, episodes: [] })
    const reg = mk({ idFactory: () => otherId })
    await expect(reg.ensureMigratedOnce()).rejects.toMatchObject({ code: REGISTRY_ERRORS.MIGRATION_CONFLICT })
    expect((await reg.listChannels()).migrationStatus).toBe('conflict')
    const resolved = await reg.resolveMigration('keep_existing')
    expect(resolved.migrationStatus).toBe('resolved:keep_existing')
  })

  it('复制中途失败落 error 态，读得到、写不进去（不得伪装成"未迁移"重来第二次）', async () => {
    write('channel.json', { version: 1, channel: legacyChannel })
    write('episodes.json', { version: 1, episodes: [] })
    const real = fs
    const broken = {
      ...real,
      renameSync: (from, to) => {
        if (String(to).includes('channels')) throw Object.assign(new Error('EIO'), { code: 'EIO' })
        return real.renameSync(from, to)
      },
    }
    const reg = new PodcastChannelRegistry({ podcastRoot: root, fs: broken, logger: { info () {}, warn () {}, error () {} } })
    await expect(reg.listChannels()).rejects.toMatchObject({ code: REGISTRY_ERRORS.MIGRATION_IO_FAILED })
    // 读通道仍在：状态必须能被看见，否则界面渲染不出横幅
    const listed = await reg.listChannels()
    expect(listed.migrationStatus).toBe('error')
    await expect(reg.createChannel('新栏目')).rejects.toThrow(/迁移未完成/)
  })

  it('id 形态判据不许放过 default 这种"频道名"（评审 #1 的落点）', async () => {
    const reg = mk()
    expect(() => reg.channelDir('default')).toThrow(/PODCAST_CHANNEL_ID_INVALID/)
    expect(() => reg.channelDir('ch_')).toThrow(/PODCAST_CHANNEL_ID_INVALID/)
    expect(reg.channelDir('ch_abcd1234')).toContain(path.join('channels', 'ch_abcd1234'))
  })
})

describe('podcast-channel-registry · cap 与 hosting', () => {
  it('listChannels 每行都带 cap 与 count，且 cap 与引擎 ITEMS_MAX 同源（不得第二份 1000）', async () => {

    const reg = mk()
    const created = await reg.createChannel('A')
    const row = (await reg.listChannels()).channels[0]
    expect(row.cap).toBe(ITEMS_MAX)
    expect(row.count).toBe(0)
    expect(created.channel.id).toBe(row.id)
  })

  it('hosting 写入只存 credentialRef，secret 永不进 index.json（PRD §12）', async () => {
    const reg = mk()
    await reg.writeHosting({ provider: 'oss', endpoint: 'https://oss-cn-hangzhou.aliyuncs.com', bucket: 'pod', pathPrefix: 'feeds', credentialRef: 'podcast-hosting-ak' })
    const raw = fs.readFileSync(path.join(root, 'index.json'), 'utf8')
    expect(raw).not.toMatch(/accessKeySecret/i)
    expect(reg.readHosting().pathPrefix).toBe('feeds')
  })

  it('迁移状态与 hosting 的写必须串行：并发 writeHosting 不得互相抹掉字段', async () => {
    const reg = mk()
    const results = await Promise.all([
      reg.writeHosting({ bucket: 'a' }),
      reg.writeHosting({ bucket: 'b' }),
      reg.writeHosting({ bucket: 'c' }),
    ])
    expect(results).toHaveLength(3)
    expect(reg.readHosting().bucket).toBe('c')
  })
})
