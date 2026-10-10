// @vitest-environment node
/**
 * publish-stage-map.test.js — 发布阶段串 → 规范 stageKey 映射表锁
 *
 * 契约（PRD-PUBLISH-PROGRESS-UX-2026-09-28 §6.3）：
 * - 映射表是封闭清单：两引擎（rpa-view-platforms / rpa-view-manager / base-adapter）
 *   的全部已知阶段串必须登记，未知串 → 'detail'（原样透传，不抛错）。
 * - 前缀规则优先：✓→done、✗→failed、⏳/⟳→waiting、Failed:/Error:→failed。
 * - 新增阶段串必须同步登记本表（封闭清单锁：表内所有串必须映射到非 detail 的合法 key）。
 */
const { mapStageToKey, STAGE_KEY_ENUM, KNOWN_STAGE_MAP } = require('./publish-progress-events')

describe('publish-stage-map — 阶段串映射', () => {
  it('stageKey 枚举封闭为 10 值', () => {
    expect(STAGE_KEY_ENUM).toEqual([
      'prepare', 'upload', 'fill', 'submit', 'verify', 'waiting', 'released', 'done', 'failed', 'detail',
    ])
  })

  it('映射表是封闭清单：表内全部串映射到合法非 detail key', () => {
    for (const [stage, key] of Object.entries(KNOWN_STAGE_MAP)) {
      expect(STAGE_KEY_ENUM).toContain(key)
      expect(key).not.toBe('detail')
      expect(typeof stage).toBe('string')
      expect(stage.length).toBeGreaterThan(0)
    }
    // 封闭清单规模下界：两引擎已知串 ≥ 35（防映射表被清空/退化成空表仍全绿）
    expect(Object.keys(KNOWN_STAGE_MAP).length).toBeGreaterThanOrEqual(35)
  })

  it.each([
    ['准备发布...', 'prepare'],
    ['starting browser...', 'prepare'],
    ['cookies restored', 'prepare'],
    ['using API publish engine...', 'prepare'],
    ['navigating...', 'prepare'],
    ['navigating to draft...', 'prepare'],
    ['navigating to Studio...', 'prepare'],
    ['navigating to write page...', 'prepare'],
    ['waiting for editor...', 'prepare'],
    ['preparing declaration...', 'prepare'],
    ['preparing AI declaration...', 'prepare'],
    ['preparing category & copyright...', 'prepare'],
    ['uploading file...', 'upload'],
    ['file uploaded', 'upload'],
    ['uploading video...', 'upload'],
    ['waiting upload...', 'upload'],
    ['waiting for upload...', 'upload'],
    ['video uploaded', 'upload'],
    ['upload complete', 'upload'],
    ['uploading cover...', 'upload'],
    ['Uploading video...', 'upload'],
    ['Uploading cover...', 'upload'],
    ['filling title...', 'fill'],
    ['filling content...', 'fill'],
    ['filling desc...', 'fill'],
    ['filling description...', 'fill'],
    ['adding tags...', 'fill'],
    ['checking agreement...', 'fill'],
    ['saving draft...', 'fill'],
    ['publishing...', 'submit'],
    ['Publishing...', 'submit'],
    ['clicking Create...', 'submit'],
    ['mass sending...', 'submit'],
    ['next step (elements)...', 'submit'],
    ['verifying...', 'verify'],
    ['published!', 'done'],
    ['Published!', 'done'],
    ['done', 'done'],
    ['draft saved', 'done'],
    ['API success', 'done'],
  ])('已知串 %s → %s', (stage, expected) => {
    expect(mapStageToKey(stage)).toBe(expected)
  })

  it.each([
    ['✓ 发布成功', 'done'],
    ['✗ 发布失败: 平台 Cookie 缺失', 'failed'],
    ['⏳ 发布间隔限制，等待 5 分钟后重试', 'waiting'],
    ['⟳ 重试中... (剩余 2 次)', 'waiting'],
    ['Failed: upload rejected', 'failed'],
    ['Error: network timeout', 'failed'],
  ])('前缀规则 %j → %s', (stage, expected) => {
    expect(mapStageToKey(stage)).toBe(expected)
  })

  it.each([
    ['some brand new stage'],
    [''],
    ['未知阶段'],
  ])('未知串 %j → detail（透传不抛错）', (stage) => {
    expect(mapStageToKey(stage)).toBe('detail')
  })

  it('非字符串输入 → detail（fail-closed 不抛错）', () => {
    expect(mapStageToKey(null)).toBe('detail')
    expect(mapStageToKey(undefined)).toBe('detail')
    expect(mapStageToKey(123)).toBe('detail')
  })
})
