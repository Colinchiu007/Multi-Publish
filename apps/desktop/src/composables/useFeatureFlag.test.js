// @ts-check
/**
 * useFeatureFlag 单元测试（AGENTS.md QM-3「composable 导出完整性测试」+ ADR-0006 fail-closed 口径）
 *
 * 这里锁的是「读不到就当关」这条安全边界：运营 runtime 不可达时若按开启处理，
 * 用户会在端点尚未部署的窗口期点进一个必错的入口（ADR-0006 拒绝的正是这个）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEV_OVERRIDABLE_FLAGS, FEATURE_FLAG_ACCOUNT_CLOUD_SYNC, isFlagEnabled, parseDevFlagOverrides, useFeatureFlag } from './useFeatureFlag'

const _runtime = vi.hoisted(() => vi.fn())

vi.mock('@/api/ops-center-sync', () => ({
  opsCenterSyncRuntime: () => _runtime(),
}))

describe('useFeatureFlag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('导出完整性：Accounts.vue 模板消费的 enabled / refresh 均存在，且键名为 PRD 约定的 account_cloud_sync', () => {
    expect(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC).toBe('account_cloud_sync')
    expect(typeof isFlagEnabled).toBe('function')
    const { enabled, loading, resolved, refresh } = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    expect(enabled.value).toBe(false)
    expect(typeof refresh).toBe('function')
    expect(loading.value).toBe(false)
    expect(resolved.value).toBe(false)
  })

  it('runtime 下发 true 时开启；下发 false / 缺失时关闭', async () => {
    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: { account_cloud_sync: true } } })
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(true)
    expect(flag.enabled.value).toBe(true)

    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: { account_cloud_sync: false } } })
    await expect(flag.refresh()).resolves.toBe(false)

    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: {} } })
    await expect(flag.refresh()).resolves.toBe(false)
  })

  it('未同步过运营配置（code!==0 / data 为空）时按关闭处理', async () => {
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    _runtime.mockResolvedValue({ code: -1, message: 'electronAPI not available', data: null })
    await expect(flag.refresh()).resolves.toBe(false)
    _runtime.mockResolvedValue({ code: 0, data: null })
    await expect(flag.refresh()).resolves.toBe(false)
    _runtime.mockResolvedValue({ code: 0 })
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
  })

  it('runtime 调用抛错时不冒泡、按关闭处理（入口隐藏即可，不制造第二条失败路径）', async () => {
    _runtime.mockRejectedValue(new Error('ipc boom'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
    expect(flag.loading.value).toBe(false)
    expect(flag.resolved.value).toBe(true)
  })

  it('真值判定只认显式布尔/1/' + "'true'" + '，对象与任意字符串一律关闭', () => {
    expect(isFlagEnabled(true)).toBe(true)
    expect(isFlagEnabled(1)).toBe(true)
    expect(isFlagEnabled('true')).toBe(true)
    expect(isFlagEnabled(' TRUE ')).toBe(true)
    expect(isFlagEnabled('1')).toBe(true)
    expect(isFlagEnabled('4k')).toBe(false)
    expect(isFlagEnabled(2)).toBe(false)
    expect(isFlagEnabled({ enabled: true })).toBe(false)
    expect(isFlagEnabled(undefined)).toBe(false)
    expect(isFlagEnabled(null)).toBe(false)
  })

  it('空 key 直接关闭且不发请求', async () => {
    const flag = useFeatureFlag('')
    await expect(flag.refresh()).resolves.toBe(false)
    expect(_runtime).not.toHaveBeenCalled()
  })
})

/**
 * 开发态 flag 覆盖通道（`mpFlag=<key>=<1|0>`）—— 存在的唯一理由是让 CI 的 `QG Visual` 能渲染
 * 「账号云镜像入口已开启」这一态（见 useFeatureFlag.js 文件头：CI 无运营中心，不开这条通道就没有
 * flag 开启态的视觉基线，ADR-0006 的 fail-closed 会让按钮永不出现）。
 *
 * 关键口径：这里**不给 composable 开测试注入口**。通道读的就是 `import.meta.env.DEV` 与
 * `window.location`，所以用 vi.stubEnv / vi.stubGlobal 把这两个环境量摆出来 —— 用例跑的是
 * 生产同一条分支。（前一版给 useFeatureFlag 加了 options.{dev,search}，结果是"生产分支根本没被
 * 跑到"，而且能给测试用的口子同样能给误用者用；QM-6 外部评审指出后改掉了。）
 */
describe('开发态 flag 覆盖通道', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  /** 把通道真正读取的两个环境量摆成指定形态（默认 = 开发态 + http 页面） */
  function locate ({ dev = true, protocol = 'http:', search = '', hash = '' } = {}) {
    vi.stubEnv('DEV', dev)
    vi.stubGlobal('window', { location: { protocol, search, hash } })
  }

  it('只认 key=value 形态的 1/0/true/false，且仅限白名单内的 flag；其它一律不产生覆盖', () => {
    const ok = parseDevFlagOverrides(
      'mpFlag=account_cloud_sync=yes&mpFlag=account_cloud_sync&mpFlag=&mpFlag=nonsense&mpFlag=account_cloud_sync='
    )
    expect([...ok.entries()]).toEqual([])
    // 合法形态
    expect([...parseDevFlagOverrides('mpFlag=account_cloud_sync=1').entries()])
      .toEqual([['account_cloud_sync', true]])
    expect(parseDevFlagOverrides('mpFlag=account_cloud_sync=FALSE').get('account_cloud_sync')).toBe(false)
    // 白名单外的键即便写法合法也不覆盖：这条通道只服务"界面开关键"，不是通用 flag 后门
    expect([...parseDevFlagOverrides('mpFlag=some_capability_flag=1').entries()]).toEqual([])
    expect([...parseDevFlagOverrides('x=1&mpFlag=account_cloud_sync=true').entries()])
      .toEqual([['account_cloud_sync', true]])
    // 下面四条是实现此刻的确定行为，后端模型评审（I4）指出它们没被钉住 —— 不钉住的后果不是报错，
    // 而是哪天有人"顺手简化"解析器时，静默改变这条通道的覆盖面。
    // ① encoded `=`：URLSearchParams 先解码，所以 %3D 等价于真 `=` ⇒ 承认为覆盖
    expect([...parseDevFlagOverrides('mpFlag=account_cloud_sync%3D1').entries()])
      .toEqual([['account_cloud_sync', true]])
    // ② key 大小写敏感：不做模糊匹配，避免"看起来像"就放行
    expect([...parseDevFlagOverrides('mpFlag=ACCOUNT_CLOUD_SYNC=1').entries()]).toEqual([])
    // ③ 非法项在后不得清掉前一个合法值（逐条判定，不是取末条原文）
    expect(parseDevFlagOverrides('mpFlag=account_cloud_sync=0&mpFlag=account_cloud_sync=yes')
      .get('account_cloud_sync')).toBe(false)
    // ④ 非法项在前也不得挡住后面的合法项（这条专门锁住"只取末条/只取首条"的简化）
    expect(parseDevFlagOverrides('mpFlag=account_cloud_sync=yes&mpFlag=account_cloud_sync=1')
      .get('account_cloud_sync')).toBe(true)
    // ⑤ 值里再带 `=`：按"第一个 = 是分隔符"判定，剩余整体当值 ⇒ 非法、不覆盖
    //    （注：把分隔符改成"最后一个 ="是**等价变异** —— 该键不再命中白名单，两种实现
    //     对所有可观察行为完全一致，所以这里锁的是可观察结果，不是切分规则本身。实测已验证）
    expect([...parseDevFlagOverrides('mpFlag=account_cloud_sync=1=0').entries()]).toEqual([])
    expect([...parseDevFlagOverrides().entries()]).toEqual([])
    expect(DEV_OVERRIDABLE_FLAGS).toEqual([FEATURE_FLAG_ACCOUNT_CLOUD_SYNC])
  })

  it('开发态 + hash 路由形态（查询落在 fragment 里）：命中覆盖且完全不问运营中心', async () => {
    // 本仓是 createWebHashHistory ⇒ 视觉用例的实际 URL 是 `<base>/#/accounts?mpFlag=…`，
    // location.search 恒为空。只读 search 的实现在这条真实形态下永不自检通过（外部评审实测）。
    locate({ hash: '#/accounts?mpFlag=account_cloud_sync=1' })
    // 显式把运营侧摆成「不可达」：这样一旦覆盖没命中，落下去的结果一定是 false，
    // 失败会精确停在"开启态没渲染"这条断言上，而不是继承上一条用例残留的 mock 实现。
    _runtime.mockRejectedValue(new Error('运营中心不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(true)
    expect(flag.enabled.value).toBe(true)
    expect(flag.resolved.value).toBe(true)
    expect(_runtime).toHaveBeenCalledTimes(0)
  })

  it('开发态 + 常规 search 形态同样生效（两种 URL 写法都得认，取决于宿主路由）', async () => {
    locate({ search: '?mpFlag=account_cloud_sync=1' })
    _runtime.mockRejectedValue(new Error('运营中心不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(true)
    expect(_runtime).toHaveBeenCalledTimes(0)
  })

  it('显式 0 可以盖过运营下发的 1（排障要能关掉看效果），且依然不发请求', async () => {
    locate({ search: '?mpFlag=account_cloud_sync=0' })
    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: { account_cloud_sync: true } } })
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
    expect(_runtime).toHaveBeenCalledTimes(0)
  })

  it('显式构建期开关打开时，即使 DEV 为 false 通道也生效（构建期常量，与运行环境无关）', async () => {
    // 这不是假想的兜底：CI 首轮就是因为只挂 DEV 而**永远拍不到开启态**（本地用
    // 判据不依赖"CI 恰好带 NODE_ENV=production"——那个归因已被 Gate 7 探针证伪（实测 NODE_ENV 为空）。
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_MP_DEV_FLAG_OVERRIDE', '1')
    vi.stubGlobal('window', { location: { protocol: 'http:', hash: '#/accounts?mpFlag=account_cloud_sync=1', search: '' } })
    _runtime.mockRejectedValue(new Error('运营中心不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(true)
    expect(flag.enabled.value).toBe(true)
    expect(_runtime).toHaveBeenCalledTimes(0)
  })

  it('开关值不是恰好 1 时不得开通道（true/0/空/yes 一律按关）', async () => {
    for (const bad of ['true', '0', '', 'yes']) {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_MP_DEV_FLAG_OVERRIDE', bad)
      vi.stubGlobal('window', { location: { protocol: 'http:', hash: '#/accounts?mpFlag=account_cloud_sync=1', search: '' } })
      _runtime.mockReset()
      _runtime.mockResolvedValue({ code: 0, data: { featureFlags: {} } })
      const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
      await expect(flag.refresh()).resolves.toBe(false)
      // 未打通道 ⇒ 必须回到运营真值，也就是**要**去问过运营中心
      expect(_runtime, `开关值 ${JSON.stringify(bad)} 竟打通了通道`).toHaveBeenCalledTimes(1)
    }
  })

  it('非开发态一律走运营真值：URL 参数不是提权通道', async () => {
    locate({ dev: false, search: '?mpFlag=account_cloud_sync=1' })
    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: {} } })
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    // 参数写着 1、运营写着「没有这个 flag」⇒ 必须按关闭。
    // 只断言"没调接口"是不够的：那会连带放过"调了但把 enabled 写成 true"。
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
    expect(_runtime).toHaveBeenCalledTimes(1)
  })

  it('非开发态 + 运营下发 true 时正常开启（本通道不改变既有口径）', async () => {
    locate({ dev: false, search: '?mpFlag=account_cloud_sync=1' })
    _runtime.mockResolvedValue({ code: 0, data: { featureFlags: { account_cloud_sync: true } } })
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(true)
    expect(flag.enabled.value).toBe(true)
  })

  it('file: 页面一律不生效：开发构建产物被打包以 file:// 直开时 DEV 仍为 true', async () => {
    locate({ protocol: 'file:', search: '?mpFlag=account_cloud_sync=1' })
    _runtime.mockRejectedValue(new Error('运营中心不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
    expect(_runtime).toHaveBeenCalledTimes(1)
  })

  it('非法值必须出声：写错形态是静默回落，排障者唯一能看到的只有控制台', async () => {
    locate({ search: '?mpFlag=account_cloud_sync=yes' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    _runtime.mockRejectedValue(new Error('不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(false)
    expect(_runtime).toHaveBeenCalledTimes(1)
    const messages = warn.mock.calls.map((c) => String(c[0]))
    expect(messages.filter((m) => m.includes('mpFlag'))).toHaveLength(1)
    // 只 echo 键名与字面量，不得把整条 URL 打进日志（URL 可能带账号上下文）
    expect(messages[0]).not.toContain('http')
    warn.mockRestore()
  })

  it('开发态但没有任何覆盖参数：保持运营口径不可达即关闭（本通道不改变默认值）', async () => {
    locate({})
    _runtime.mockRejectedValue(new Error('不可达'))
    const flag = useFeatureFlag(FEATURE_FLAG_ACCOUNT_CLOUD_SYNC)
    await expect(flag.refresh()).resolves.toBe(false)
    expect(flag.enabled.value).toBe(false)
    expect(_runtime).toHaveBeenCalledTimes(1)
  })
})
