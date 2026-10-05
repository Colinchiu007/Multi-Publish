// @vitest-environment node
/**
 * draft-fingerprint — 内容指纹幂等键（publish-fail-draft-guard）
 *
 * 契约（PRD §4.1）：
 * - 只取内容字段（白名单），排除 id/时间戳/publishTime/平台选择等易变元数据
 * - 数组保持顺序；字符串 null/undefined 归一为 ''；非数组归一为 []
 * - 对象键序无关（递归排序后序列化）
 * - 非对象输入返回确定性空内容指纹，不抛错
 */
const { computeDraftFingerprint } = require('./draft-fingerprint')

describe('draft-fingerprint', () => {
  const base = {
    title: '标题',
    content: '正文内容',
    video_path: 'D:/media/video.mp4',
    images: ['D:/media/1.png', 'D:/media/2.png'],
    tags: ['a', 'b'],
  }

  it('相同内容生成相同指纹（含 createdAt/updatedAt/id/publishTime 等易变字段差异）', () => {
    const a = computeDraftFingerprint({ ...base, id: 'draft_1', createdAt: '2026-01-01', updatedAt: '2026-01-02' })
    const b = computeDraftFingerprint({ ...base, id: 'draft_2', publishTime: '2026-01-03T00:00:00Z', source: 'auto_failure' })
    expect(a).toBe(b)
  })

  it('键序无关：字段写入顺序不影响指纹', () => {
    const a = computeDraftFingerprint({ title: 'T', content: 'C', video_path: 'V' })
    const b = computeDraftFingerprint({ video_path: 'V', content: 'C', title: 'T' })
    expect(a).toBe(b)
  })

  it('嵌套对象键序无关（accounts 等结构即便误入也不影响确定性）', () => {
    const a = computeDraftFingerprint({ ...base, extra: { x: 1, y: { m: 1, n: 2 } } })
    const b = computeDraftFingerprint({ ...base, extra: { y: { n: 2, m: 1 }, x: 1 } })
    expect(a).toBe(b)
  })

  it('内容字段变化 → 指纹变化（视频路径/图片列表/标题/正文/tags）', () => {
    const fp = computeDraftFingerprint(base)
    expect(computeDraftFingerprint({ ...base, video_path: 'D:/media/other.mp4' })).not.toBe(fp)
    expect(computeDraftFingerprint({ ...base, images: ['D:/media/1.png'] })).not.toBe(fp)
    expect(computeDraftFingerprint({ ...base, images: ['D:/media/2.png', 'D:/media/1.png'] })).not.toBe(fp)
    expect(computeDraftFingerprint({ ...base, title: '另一个标题' })).not.toBe(fp)
    expect(computeDraftFingerprint({ ...base, content: '另一段正文' })).not.toBe(fp)
    expect(computeDraftFingerprint({ ...base, tags: ['b', 'a'] })).not.toBe(fp)
  })

  it('平台选择/账号/覆盖差异不影响指纹（同一内容多平台失败只一条草稿）', () => {
    const a = computeDraftFingerprint({ ...base, platforms: ['douyin'], accounts: { douyin: 'acc-1' } })
    const b = computeDraftFingerprint({ ...base, platforms: ['kuaishou', 'zhihu'], accounts: { kuaishou: 'acc-2' } })
    expect(a).toBe(b)
  })

  it('缺失字段归一：null/undefined/非数组输入与显式空值等价', () => {
    const a = computeDraftFingerprint({ title: 'T', images: null, tags: undefined, video_path: null })
    const b = computeDraftFingerprint({ title: 'T', images: [], tags: [] })
    expect(a).toBe(b)
    expect(computeDraftFingerprint({ title: 'T', images: 'not-array' })).toBe(computeDraftFingerprint({ title: 'T' }))
  })

  it('首尾空格是内容的一部分（不 trim）', () => {
    expect(computeDraftFingerprint({ title: ' T' })).not.toBe(computeDraftFingerprint({ title: 'T' }))
  })

  it('非对象输入返回确定性指纹，不抛错', () => {
    const empty = computeDraftFingerprint(null)
    expect(typeof empty).toBe('string')
    expect(empty.length).toBe(64)
    expect(computeDraftFingerprint(undefined)).toBe(empty)
    expect(computeDraftFingerprint('str')).toBe(empty)
    expect(computeDraftFingerprint(123)).toBe(empty)
    expect(computeDraftFingerprint({})).toBe(empty)
  })

  // 归因链（PRD-PUBLISH-REWRITE-LINEAGE-2026-10-05）：rewriteHistoryId 与 publishTime 同族 ——
  // 它是「这份内容从哪一次改写来」的元数据，不是内容。参与指纹的后果是
  // 同一份正文每次改写都堆一条新草稿（草稿幂等契约失效）；不参与又漏挂 payload 的后果是
  // 关联静默丢失。两条都由本用例的一侧守住。
  it('rewriteHistoryId 不参与内容指纹（同内容不同关联 ⇒ 复用同一条草稿）', () => {
    const base = { title: 'T', content: 'C' }
    expect(computeDraftFingerprint({ ...base, rewriteHistoryId: 'md0kx9a1b2c3' }))
      .toBe(computeDraftFingerprint(base))
    expect(computeDraftFingerprint({ ...base, rewriteHistoryId: 'other_id' }))
      .toBe(computeDraftFingerprint({ ...base, rewriteHistoryId: 'md0kx9a1b2c3' }))
  })

  it('接线守卫：内容字段白名单不得被顺手加进 rewriteHistoryId（加了即红）', () => {
    const fs = require('fs')
    const src = fs.readFileSync(require.resolve('./draft-fingerprint'), 'utf8')
    const block = src.slice(src.indexOf('const CONTENT_FIELDS'), src.indexOf(']', src.indexOf('const CONTENT_FIELDS')))
    expect(block.includes('rewriteHistoryId'), '白名单里出现它 = 指纹被元数据污染').toBe(false)
  })
})
