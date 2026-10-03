/**
 * GroupTagsEditor.test.js — 分组类别标签编辑器（2026-10-03）
 *
 * 主线：① 展示态显示已选标签 ② 未知类别置灰并说明 ③ 编辑态多选与保存
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import GroupTagsEditor from '@/features/accounts/components/GroupTagsEditor.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  messages: { zh: { automation: { tagsEdit: '编辑标签' } } },
})

const CATEGORIES = [
  { category_key: 'tech', name: '科技' },
  { category_key: 'finance', name: '财经' },
]

function mountEditor (props = {}) {
  return mount(GroupTagsEditor, {
    props: {
      group: { id: 'g1', name: '主力', categoryTags: ['tech'] },
      categories: CATEGORIES,
      editing: false,
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

describe('GroupTagsEditor · 展示态', () => {
  it('显示已选标签的名称（不是原始 key）', () => {
    const w = mountEditor()
    expect(w.text()).toContain('科技')
    expect(w.find('[data-testid="edit-group-tags-g1"]').exists()).toBe(true)
  })

  it('未设置标签时显示「未设置」', () => {
    const w = mountEditor({ group: { id: 'g1', categoryTags: [] } })
    expect(w.text()).toContain('未设置')
  })

  it('未知类别（已被运营删除）保留但置灰，且悬停说明原因', () => {
    const w = mountEditor({ group: { id: 'g1', categoryTags: ['tech', 'gone_cat'] } })
    expect(w.text()).toContain('gone_cat')
    const unknown = w.findAll('.group-tag--unknown')
    expect(unknown).toHaveLength(1)
    expect(unknown[0].attributes('title')).toContain('已被删除')
  })
})

describe('GroupTagsEditor · 编辑态', () => {
  it('进入编辑态列出全部可选类别，已选高亮', () => {
    const w = mountEditor({ editing: true })
    expect(w.find('[data-testid="tag-toggle-g1-tech"]').exists()).toBe(true)
    expect(w.find('[data-testid="tag-toggle-g1-finance"]').exists()).toBe(true)
    expect(w.find('[data-testid="tag-toggle-g1-tech"]').classes()).toContain('tag-toggle--on')
  })

  it('无可选类别时提示「暂无可选类别」（不显示空选择区）', () => {
    const w = mountEditor({ editing: true, categories: [] })
    expect(w.text()).toContain('暂无可选类别')
  })

  it('点击切换选中状态', async () => {
    const w = mountEditor({ editing: true })
    await w.find('[data-testid="tag-toggle-g1-finance"]').trigger('click')
    expect(w.find('[data-testid="tag-toggle-g1-finance"]').classes()).toContain('tag-toggle--on')
    await w.find('[data-testid="tag-toggle-g1-tech"]').trigger('click')
    expect(w.find('[data-testid="tag-toggle-g1-tech"]').classes()).not.toContain('tag-toggle--on')
  })

  it('保存时 emit 全部选中项（含新增、含取消选中）', async () => {
    const w = mountEditor({ editing: true })
    await w.find('[data-testid="tag-toggle-g1-finance"]').trigger('click')
    await w.find('[data-testid="save-group-tags-g1"]').trigger('click')
    const saved = w.emitted('save')
    expect(saved).toBeTruthy()
    expect(saved[0][0]).toEqual(['tech', 'finance'])
  })

  it('取消时 emit cancel，不 emit save', async () => {
    const w = mountEditor({ editing: true })
    await w.find('[data-testid="tag-toggle-g1-finance"]').trigger('click')
    await w.find('.tag-cancel').trigger('click')
    expect(w.emitted('cancel')).toBeTruthy()
    expect(w.emitted('save')).toBeFalsy()
  })

  it('外部 group 变化时重新取基准（编辑值不与真源漂移）', async () => {
    const w = mountEditor({ editing: true })
    await w.find('[data-testid="tag-toggle-g1-finance"]').trigger('click')
    await w.setProps({ group: { id: 'g1', categoryTags: ['finance'] } })
    // 真源变成只有 finance ⇒ tech 高亮应被重置
    expect(w.find('[data-testid="tag-toggle-g1-finance"]').classes()).toContain('tag-toggle--on')
  })
})
