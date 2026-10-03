import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishTargetSelector from './PublishTargetSelector.vue'

describe('PublishTargetSelector', () => {
  it('搜索框具有可访问名称', () => {
    const wrapper = mount(PublishTargetSelector, { props: { groups: [] } })
    expect(wrapper.get('input[type="search"]').attributes('aria-label')).toBe('搜索发布平台或账号')
    expect(wrapper.get('.target-selector__list').attributes('role')).toBe('list')
  })

  it('没有可操作分组时不渲染「按组添加」，且列表结构不变（P2-8b 视觉中性的 DOM 级证据）', () => {
    const without = mount(PublishTargetSelector, { props: { groups, accountGroups: [] } })
    expect(without.find('[data-testid="publish-group-picker"]').exists()).toBe(false)

    // 结构锁：无分组态的 DOM 必须与"本刀之前"完全一致 —— 像素门禁对小控件是双向失明的
    // （diff 面积 <0.1% 进不了阈值，见记忆「小控件改动像素门禁双向失明」），
    // 所以"CI 空 profile 下不新增任何节点"必须由 DOM 断言来证，而不是靠 QG Visual 的绿。
    const legacy = mount(PublishTargetSelector, { props: { groups } })
    expect(without.html()).toBe(legacy.html())
  })

  it('accountGroups 会转发为 apply-group（组件不持有选中集）', async () => {
    const wrapper = mount(PublishTargetSelector, {
      props: { groups, accountGroups: [{ id: 'g1', name: '主力', applicable: 1, total: 2 }] },
    })
    expect(wrapper.find('[data-testid="publish-group-picker"]').exists()).toBe(true)
    await wrapper.get('[data-testid="group-apply-g1"]').trigger('click')
    expect(wrapper.emitted('apply-group')).toEqual([['g1']])
  })
  const groups = [{
    label: '国内平台',
    items: [
      { id: 'wechat_mp', label: '微信公众号', accounts: [{ id: 'wx-1', name: '主账号' }] },
      { id: 'zhihu', label: '知乎', accounts: [] },
    ],
  }]

  it('渲染平台及多账号选择状态', () => {
    const wrapper = mount(PublishTargetSelector, {
      props: {
        groups,
        selectedPlatforms: ['wechat_mp'],
        selectedAccounts: { wechat_mp: ['wx-1'] },
      },
    })

    expect(wrapper.get('[data-testid="platform-wechat_mp"]').element.checked).toBe(true)
    expect(wrapper.get('[data-testid="account-wechat_mp-wx-1"]').element.checked).toBe(true)
  })

  it('平台和账号操作只通过事件上报', async () => {
    const wrapper = mount(PublishTargetSelector, {
      props: {
        groups,
        selectedPlatforms: [],
        selectedAccounts: {},
      },
    })

    await wrapper.get('[data-testid="platform-wechat_mp"]').setValue(true)
    expect(wrapper.emitted('toggle-platform')[0]).toEqual(['wechat_mp'])

    await wrapper.setProps({ selectedPlatforms: ['wechat_mp'] })
    await wrapper.get('[data-testid="account-wechat_mp-wx-1"]').setValue(true)
    expect(wrapper.emitted('toggle-account')[0]).toEqual(['wechat_mp', 'wx-1'])
  })

  it('已选但无账号的平台显示阻断提示', () => {
    const wrapper = mount(PublishTargetSelector, {
      props: {
        groups,
        selectedPlatforms: ['zhihu'],
        selectedAccounts: {},
      },
    })

    expect(wrapper.text()).toContain('请先添加账号')
  })

  it('停用账号显示「已停用」标记且复选框禁用', () => {
    const disabledGroups = [{
      label: '国内平台',
      items: [{
        id: 'wechat_mp',
        label: '微信公众号',
        accounts: [
          { id: 'wx-1', name: '主账号', disabled: true },
          { id: 'wx-2', name: '副账号', disabled: false },
        ],
      }],
    }]
    const wrapper = mount(PublishTargetSelector, {
      props: { groups: disabledGroups, selectedPlatforms: ['wechat_mp'], selectedAccounts: {} },
    })

    expect(wrapper.get('[data-testid="account-wechat_mp-wx-1"]').element.disabled).toBe(true)
    expect(wrapper.get('[data-testid="account-wechat_mp-wx-2"]').element.disabled).toBe(false)
    expect(wrapper.get('[data-testid="target-account-disabled-flag"]').text()).toBe('已停用')
  })

  // 归属 openspec change add-account-name-source 的「所有展示账号名的界面必须共用同一口径」
  // 需求。此前本组件只读 `account.name`，而主进程写进 `name` 的正是 document.title
  // （auth-view-manager 的 captured.name），于是发布页选择器显示的是「首页 - 知乎」这类
  // 网页标题，且用户改的名在这里永远不可见 —— 选错账号发布无从察觉。
  describe('账号显示名必须与账号卡片同源（resolveAccountDisplayName）', () => {
    const mountWith = (accounts) => mount(PublishTargetSelector, {
      props: {
        groups: [{
          label: '国内平台',
          items: [{ id: 'zhihu', label: '知乎', accounts }],
        }],
        selectedPlatforms: ['zhihu'],
        selectedAccounts: {},
      },
    })
    const nameOf = (wrapper) => wrapper.get('[data-testid="account-display-name"]').text()

    it('auto 来源的统计块脏值与网页标题都被过滤，回落平台名', () => {
      expect(nameOf(mountWith([
        { id: 'zh-1', account_name: '485.9万人看过', name: '首页 - 知乎', name_source: 'auto' },
      ]))).toBe('知乎')
    })

    it('manual 来源原样显示，含被守卫判脏的形态也不过滤', () => {
      expect(nameOf(mountWith([
        { id: 'zh-1', account_name: '阿飞 - 自由职业', name: '首页 - 知乎', name_source: 'manual' },
      ]))).toBe('阿飞 - 自由职业')
    })

    it('非噪声的抓取昵称正常显示，不被平台名覆盖', () => {
      expect(nameOf(mountWith([
        { id: 'zh-1', account_name: '数字生命丘丘', name: '首页 - 知乎', name_source: 'auto' },
      ]))).toBe('数字生命丘丘')
    })

    it('全部字段不合格时回落平台名，平台名也拿不到才用 id 前 8 位', () => {
      expect(nameOf(mountWith([{ id: 'abcdefgh1234', name: '' }]))).toBe('知乎')
      const noLabel = mount(PublishTargetSelector, {
        props: {
          groups: [{ label: '国内平台', items: [{ id: 'x', label: '', accounts: [{ id: 'abcdefgh1234' }] }] }],
          selectedPlatforms: ['x'],
          selectedAccounts: {},
        },
      })
      expect(noLabel.get('[data-testid="account-display-name"]').text()).toBe('abcdefgh')
    })

    it('搜索命中显示名，不再命中被守卫隐藏的网页标题', async () => {
      const wrapper = mountWith([
        { id: 'zh-1', account_name: '数字生命丘丘', name: '首页 - 知乎', name_source: 'auto' },
      ])
      // 命中当前显示值
      await wrapper.get('input[type="search"]').setValue('丘丘')
      expect(wrapper.findAll('[data-testid^="account-zhihu-"]').length).toBe(1)
      // 「首页」只存在于被过滤掉的 name 里；旧实现用 raw account.name 匹配，这一条会命中
      await wrapper.get('input[type="search"]').setValue('首页')
      expect(wrapper.findAll('[data-testid^="account-zhihu-"]').length).toBe(0)
    })
  })

  // P0-2 风控挂起可见性（发布页优化 roadmap）：挂起账号/平台在选择器上显示徽标 +
  // 行动指引 tooltip（发布前可见，而非发布时被派发前置守卫拦截才知道）。
  // 键语义与 risk-suspender-store 一致：平台级（accountId==null）覆盖全部账号；账号级仅命中对应账号。
  describe('风控挂起徽标（riskSuspended 注入）', () => {
    const riskGroups = [{
      label: '国内平台',
      items: [{
        id: 'zhihu',
        label: '知乎',
        accounts: [{ id: 'zh-1', name: '主账号' }, { id: 'zh-2', name: '副账号' }],
      }],
    }]

    it('账号级挂起：命中账号显示徽标，未命中账号不显示', () => {
      const wrapper = mount(PublishTargetSelector, {
        props: {
          groups: riskGroups,
          selectedPlatforms: ['zhihu'],
          selectedAccounts: {},
          riskSuspended: [{ platform: 'zhihu', accountId: 'zh-1', reason: 'risk_blocked', at: 1 }],
        },
      })

      expect(wrapper.get('[data-testid="target-account-risk-flag-zhihu-zh-1"]').text()).toBe('⚠ 风控挂起')
      expect(wrapper.find('[data-testid="target-account-risk-flag-zhihu-zh-2"]').exists()).toBe(false)
    })

    it('平台级挂起（accountId==null）：该平台全部账号都显示徽标，平台行也显示', () => {
      const wrapper = mount(PublishTargetSelector, {
        props: {
          groups: riskGroups,
          selectedPlatforms: ['zhihu'],
          selectedAccounts: {},
          riskSuspended: [{ platform: 'zhihu', accountId: null, reason: 'risk_blocked', at: 1 }],
        },
      })

      expect(wrapper.get('[data-testid="target-account-risk-flag-zhihu-zh-1"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="target-account-risk-flag-zhihu-zh-2"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="target-platform-risk-flag-zhihu"]').text()).toBe('⚠ 风控挂起')
    })

    it('徽标带行动指引 tooltip（参考产品口径：去创作者中心验证）', () => {
      const wrapper = mount(PublishTargetSelector, {
        props: {
          groups: riskGroups,
          selectedPlatforms: ['zhihu'],
          selectedAccounts: {},
          riskSuspended: [{ platform: 'zhihu', accountId: 'zh-1', reason: 'risk_blocked', at: 1 }],
        },
      })

      const title = wrapper.get('[data-testid="target-account-risk-flag-zhihu-zh-1"]').attributes('title')
      expect(title).toContain('创作者中心')
      expect(title).toContain('解除挂起')
    })

    it('无挂起清单时零徽标（零打扰）', () => {
      const wrapper = mount(PublishTargetSelector, {
        props: {
          groups: riskGroups,
          selectedPlatforms: ['zhihu'],
          selectedAccounts: {},
          riskSuspended: [],
        },
      })

      expect(wrapper.findAll('[data-testid^="target-account-risk-flag"]').length).toBe(0)
      expect(wrapper.findAll('[data-testid^="target-platform-risk-flag"]').length).toBe(0)
    })

    it('其它平台的挂起不牵连本平台', () => {
      const wrapper = mount(PublishTargetSelector, {
        props: {
          groups: riskGroups,
          selectedPlatforms: ['zhihu'],
          selectedAccounts: {},
          riskSuspended: [{ platform: 'douyin', accountId: null, reason: 'risk_blocked', at: 1 }],
        },
      })

      expect(wrapper.findAll('[data-testid^="target-account-risk-flag-zhihu"]').length).toBe(0)
    })
  })
})
