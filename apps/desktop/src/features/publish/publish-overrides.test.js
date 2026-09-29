/**
 * publish-overrides.test.js — 差异化面板归一化与内容格式判定（P2-7 自 usePublishFlow.js 迁出）
 *
 * 迁出属**行为保持重构**：本文件钉住迁出后的语义与原实现一致，并给出批量复用同一实现的
 * 前提（禁止第二份归一化——两份漂移表现为「面板可编辑但发布不生效」，CCG codex W1 同族）。
 */
import { describe, expect, it } from 'vitest'
import {
  isMarkdownContent,
  normalizeOverrideValue,
  normalizePlatformOverrides,
  platformOverrideFieldsFor,
} from './publish-overrides'

describe('isMarkdownContent（内容格式判定单一实现）', () => {
  it.each([
    ['# 一级标题', true],
    ['**加粗**开头', true],
    ['> 引用块', true],
    ['```js\ncode\n```', true],
    ['[链接](https://example.com)', true],
    ['普通正文，没有任何标记', false],
    ['', false],
  ])('判定 %j → %j', (content, expected) => {
    expect(isMarkdownContent(content)).toBe(expected)
  })

  it('非字符串输入不抛错（批量条目 content 可能为 undefined）', () => {
    expect(() => isMarkdownContent(undefined)).not.toThrow()
    expect(isMarkdownContent(undefined)).toBe(false)
  })
})

describe('normalizePlatformOverrides（单篇与批量共用）', () => {
  it('非法输入返回空对象（不抛错、不产出畸形键）', () => {
    expect(normalizePlatformOverrides(null)).toEqual({})
    expect(normalizePlatformOverrides(undefined)).toEqual({})
    expect(normalizePlatformOverrides('weibo')).toEqual({})
    expect(normalizePlatformOverrides([])).toEqual({})
  })

  it('无任何有效差异内容的平台条目不进 payload（防冗余覆盖改写平台默认）', () => {
    expect(normalizePlatformOverrides({
      douyin: { title: '', content: '' },
      weibo: { title: '', content: '' },
    })).toEqual({})
  })

  it('保留标题/正文差异，并吸收注册表声明的特有字段', () => {
    const result = normalizePlatformOverrides({
      wechat_mp: { title: '微信标题', content: '', digest: '摘要', massSend: false, openComment: true },
    })
    expect(result.wechat_mp).toMatchObject({ title: '微信标题', digest: '摘要', massSend: false, openComment: true })
  })

  it('特有字段里的非法值被剔除（select 越界、checkbox 非布尔、tags 空数组）', () => {
    const fields = platformOverrideFieldsFor('bilibili')
    const selectField = fields.find(field => field.type === 'select')
    const checkboxField = fields.find(field => field.type === 'checkbox')
    const overrides = { bilibili: { title: '', content: '正文' } }
    if (selectField) overrides.bilibili[selectField.key] = '__not_an_option__'
    if (checkboxField) overrides.bilibili[checkboxField.key] = 'yes'
    const result = normalizePlatformOverrides(overrides).bilibili
    if (selectField) expect(result[selectField.key]).toBeUndefined()
    if (checkboxField) expect(result[checkboxField.key]).toBeUndefined()
  })

  it('平台清单以外的键（title/content 之外的手工脏键）不得混入', () => {
    const result = normalizePlatformOverrides({
      douyin: { title: 'T', content: 'C', __injected__: 'x' },
    })
    expect(result.douyin.__injected__).toBeUndefined()
  })
})

describe('normalizeOverrideValue（字段类型分支）', () => {
  it('text 按码点截断，不切断代理对', () => {
    const field = { key: 'title', type: 'text', maxLen: 3 }
    expect(normalizeOverrideValue(field, '一二三')).toBe('一二三')
    // 4 个码点截到 3：代理对（emoji）不得被切成半个字符
    expect(Array.from(normalizeOverrideValue(field, '一😀二三四')).length).toBe(3)
  })

  it('tags 去重去空，空集返回 undefined', () => {
    const field = { key: 'tags', type: 'tags' }
    expect(normalizeOverrideValue(field, ['a', ' a ', ''])).toEqual(['a'])
    expect(normalizeOverrideValue(field, 'a,b')).toBeUndefined()
    expect(normalizeOverrideValue(field, [])).toBeUndefined()
  })

  it('collection 接受正有限数与非空字符串，拒绝其余', () => {
    const field = { key: 'collectionId', type: 'collection' }
    expect(normalizeOverrideValue(field, 12)).toBe(12)
    expect(normalizeOverrideValue(field, ' 12 ')).toBe('12')
    expect(normalizeOverrideValue(field, 0)).toBeUndefined()
    expect(normalizeOverrideValue(field, NaN)).toBeUndefined()
    expect(normalizeOverrideValue(field, '')).toBeUndefined()
  })

  it('select 保留选项原始类型（number 与 string 不可互相冒充）', () => {
    const field = { key: 'tid', type: 'select', options: [{ value: 7, label: '分区' }, { value: 'pub', label: '公开' }] }
    expect(normalizeOverrideValue(field, '7')).toBe(7)
    expect(normalizeOverrideValue(field, 7)).toBe(7)
    expect(normalizeOverrideValue(field, 'pub')).toBe('pub')
    expect(normalizeOverrideValue(field, '99')).toBeUndefined()
  })

  it('未声明类型按 text 处理（空串与纯空白不进 payload）', () => {
    const field = { key: 'x', type: 'unknown' }
    expect(normalizeOverrideValue(field, '  ')).toBeUndefined()
    expect(normalizeOverrideValue(field, '值')).toBe('值')
  })
})
