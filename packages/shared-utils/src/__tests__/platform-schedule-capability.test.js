// @ts-nocheck
// TDD —— 先红：平台侧定时能力注册表契约
// 背景（2026-10-07）：定时发布从「本地定时器到点触发立即发布」改为「平台侧定时：
// 创建时把时间参数提交给平台，由平台服务器到点发布」。这要求一份**逐平台**的能力真源：
// 每个平台到底支持哪种接入方式（API 直连 / RPA 页面定时选项 / 不支持）。
// 若无此表，渲染层只能沿用旧的「统一支持 15 平台」说法，对不支持的平台就会静默立即发布
// （参考产品的 7 个不支持平台正是如此，本仓明令禁止）。

const {
  PLATFORM_SCHEDULE_CAPABILITY,
  getPlatformScheduleCapability,
  getScheduleCapablePlatforms,
  isPlatformSideScheduleSupported,
  resolveScheduleMode,
  validateScheduleCapabilityRegistry,
} = require('../platform-schedule-capability')

describe('platform-schedule-capability — 平台侧定时能力注册表', () => {
  describe('契约：三态模型', () => {
    it('每个平台都必须显式声明 schedule 能力（不允许缺省为支持）', () => {
      const problems = validateScheduleCapabilityRegistry()
      expect(problems).toEqual([])
    })

    it('能力模式只允许 api / rpa / unsupported 三种', () => {
      const modes = new Set(Object.values(PLATFORM_SCHEDULE_CAPABILITY).map(c => c.mode))
      for (const mode of modes) {
        expect(['api', 'rpa', 'unsupported']).toContain(mode)
      }
    })

    it('unsupported 平台必须给出可展示的不支持原因码', () => {
      for (const [id, cap] of Object.entries(PLATFORM_SCHEDULE_CAPABILITY)) {
        if (cap.mode !== 'unsupported') continue
        expect(typeof cap.reason, `${id} 缺 reason`).toBe('string')
        expect(cap.reason.length).toBeGreaterThan(0)
      }
    })
  })

  describe('头条：首个平台侧定时落地平台', () => {
    it('声明为 api 直连模式', () => {
      const cap = getPlatformScheduleCapability('toutiao')
      expect(cap.mode).toBe('api')
      expect(isPlatformSideScheduleSupported('toutiao')).toBe(true)
    })

    it('声明平台侧定时所需的时间字段与格式（供 buildPostData 与文档共用）', () => {
      const cap = getPlatformScheduleCapability('toutiao')
      expect(cap.timeField).toBe('timer_time')
      expect(cap.timeFormat).toBe('YYYY-MM-DD HH:mm')
      // 头条必须在提交时携带「开启定时」开关，否则时间字段不生效
      expect(cap.enableField).toBe('timer_status')
      expect(cap.enableValueOn).toBe(1)
    })

    it('声明该平台的最小提前量与最大跨度（渲染端校验单一真源）', () => {
      const cap = getPlatformScheduleCapability('toutiao')
      expect(cap.minLeadMinutes).toBeGreaterThan(0)
      expect(cap.maxHorizonDays).toBeGreaterThan(0)
    })

    // 2026-10-08 真机取证（头条前端 bundle 自证，版本哈希可追溯）：
    //   · graphic/7979.f3fa7c18e0.js 定时弹窗文案「请选择当前时间后 2小时 至 7天 进行定时发布」
    //     与「最长支持7天」（Popover content: "最长支持".concat(7,"天")）
    //   · graphic/publish.b8c90341ac.js 校验代码 ve.clone().add(2,"h").subtract(1,"minute")
    //     ~ .add(7,"d")，越界文案「请重新设置定时发布时间」
    //   此前登记的 30 是未经取证的我方假设值，高估 4 倍；平台必拒的排期不该走到提交才失败。
    //   若要改此值：必须重新真机取证（发布页 bundle 的 disabledDate/校验代码或 UI 文案），
    //   并同步更新 01-docs/PRD.md §6.3.15 与 openspec/records/ 取证记录。
    it('头条最大排期跨度 = 7 天（2026-10-08 平台前端 bundle 取证，禁止凭记忆改回）', () => {
      const cap = getPlatformScheduleCapability('toutiao')
      expect(cap.maxHorizonDays).toBe(7)
    })
  })

  describe('未知平台必须 fail-closed（而不是默认支持）', () => {
    it('未知平台返回 unsupported 且带 reason，绝不静默当作可用', () => {
      const cap = getPlatformScheduleCapability('some-unknown-platform')
      expect(cap.mode).toBe('unsupported')
      expect(isPlatformSideScheduleSupported('some-unknown-platform')).toBe(false)
      expect(cap.reason).toBeTruthy()
    })

    it('注册表里不存在幽灵平台键', () => {
      expect(PLATFORM_SCHEDULE_CAPABILITY['some-unknown-platform']).toBeUndefined()
    })
  })

  describe('resolveScheduleMode：选择平台侧还是本地兜底', () => {
    it('支持平台侧定时的平台 → platform-side', () => {
      expect(resolveScheduleMode('toutiao')).toBe('platform-side')
    })

    it('不支持的平台 → blocked（绝不静默本地兜底或立即发布）', () => {
      expect(resolveScheduleMode('unsupported-platform-x')).toBe('blocked')
    })
  })

  describe('getScheduleCapablePlatforms：供渲染层徽标与校验使用', () => {
    it('返回支持平台侧定时的平台 id 列表', () => {
      const list = getScheduleCapablePlatforms()
      expect(Array.isArray(list)).toBe(true)
      expect(list).toContain('toutiao')
      for (const id of list) {
        expect(isPlatformSideScheduleSupported(id)).toBe(true)
      }
    })

    it('不支持的平台不出现在列表里', () => {
      const list = getScheduleCapablePlatforms()
      for (const id of list) {
        expect(PLATFORM_SCHEDULE_CAPABILITY[id].mode).not.toBe('unsupported')
      }
    })
  })

  describe('与既有 publish-capabilities 注册表的一致性', () => {
    it('本表覆盖 publish-capabilities.json 的全部平台（无遗漏、无多余）', () => {
      const reg = require('../publish-capabilities.json')
      const registryPlatforms = Object.keys(reg.platforms).sort()
      const schedulePlatforms = Object.keys(PLATFORM_SCHEDULE_CAPABILITY).sort()
      expect(schedulePlatforms).toEqual(registryPlatforms)
    })
  })
})