// @vitest-environment jsdom
/**
 * StageProgress testid 前缀契约（2026-10-09 参数化）
 *
 * 动因：影视工程「自动」模式的进度流程复用本组件，同页面若出现两套 `story2video-*` 命名会误导自动化测试
 * 与用户排查。因此 testid 一律经 `tid(suffix)` 前缀化，`testidPrefix` 默认 'story2video'（逐字保持既有行为）。
 *
 * 本用例是**行为级**证据（挂载后看真实 DOM），与 story2video-ue-contract.test.js 的源码文本锁互补：
 * 前者证明「默认渲染出的节点名没变」，后者锁住「不得回退成裸字面量」。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StageProgress from './StageProgress.vue'

const STAGES = [
  { name: 'split', status: 'completed', summary: 'done', progress: { percent: 100 } },
  { name: 'compose', status: 'running', progress: { percent: 40, message: 'composing' } },
]

function mountWith (props = {}) {
  return mount(StageProgress, {
    props: { stages: STAGES, progressPercent: 40, showTimeGuidance: true, ...props },
    global: { mocks: { $t: (k, p) => (p ? k + ':' + JSON.stringify(p) : k) } },
  })
}

describe('StageProgress testid 前缀', () => {
  it('默认前缀仍产出 story2video-* 节点（既有语义逐字不变）', () => {
    const w = mountWith()
    expect(w.find('[data-testid="story2video-stage-list"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-stage-sticky-header"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-orchestration-progress"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-stage-split"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-stage-compose"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-stage-compose-progress"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-stage-sub-fill"]').exists()).toBe(true)
    expect(w.find('[data-testid="story2video-time-guidance"]').exists()).toBe(true)
    w.unmount()
  })

  it('自定义前缀时全部节点改用该前缀，且不再出现 story2video-*', () => {
    const w = mountWith({ testidPrefix: 'film-auto' })
    expect(w.find('[data-testid="film-auto-stage-list"]').exists()).toBe(true)
    expect(w.find('[data-testid="film-auto-stage-split"]').exists()).toBe(true)
    expect(w.find('[data-testid="film-auto-stage-compose-progress"]').exists()).toBe(true)
    expect(w.find('[data-testid="film-auto-stage-sub-fill"]').exists()).toBe(true)
    expect(w.html()).not.toContain('story2video-')
    w.unmount()
  })

  it('非法前缀（空串）回落 story2video，避免产出裸 '-' 前缀节点', () => {
    const w = mountWith({ testidPrefix: '' })
    expect(w.find('[data-testid="story2video-stage-list"]').exists()).toBe(true)
    w.unmount()
  })

  it('阶段详情节点同样前缀化', () => {
    const w = mountWith({ testidPrefix: 'film-auto' })
    expect(w.find('[data-testid="film-auto-stage-detail-compose"]').exists()).toBe(true)
    w.unmount()
  })
})
