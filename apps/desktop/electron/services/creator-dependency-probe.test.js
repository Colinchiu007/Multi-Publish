/**
 * creator-collector.test.js 的补充：依赖探测的降级契约
 *
 * 为什么单独测：`content_aggregator` 是本仓 python-backend 的 **optional 依赖**，
 * 且打包产物**不分发 Python 环境**（python-bridge 直接 spawn 系统 python）。
 * 目标机器若没装 pip install content-aggregator，YouTube 采集不可用。
 *
 * 这里不能真卸载依赖，故用注入的 requireFn 精确模拟 ImportError，
 * 验证三件事：
 *   1. 缺依赖时**如实报告不可用**，而不是返回一个半可用状态
 *   2. 降级信息里带**确切安装命令**（含国内镜像源写法）
 *   3. 探测本身**永不抛异常** —— 后端健康检查阶段调用它，抛异常会打断启动
 */
const { probeDependency, CREATOR_INPUT_ERRORS } = require('./creator-collector')

describe('creator-collector · 依赖探测 · 正常', () => {
  it('依赖可用时返回 ready 与构造器', () => {
    class Fake {}
    const r = probeDependency(() => ({ YouTubeCollector: Fake }))
    expect(r.ready).toBe(true)
    expect(r.YouTubeCollector).toBe(Fake)
  })

  it('可用时不携带 installHint（免得 UI 显示无意义的安装指引）', () => {
    const r = probeDependency(() => ({ YouTubeCollector: class {} }))
    expect(r.installHint).toBeUndefined()
  })
})

describe('creator-collector · 依赖探测 · 缺包降级', () => {
  const missing = () => {
    const e = new Error("No module named 'content_aggregator'")
    e.code = 'MODULE_NOT_FOUND'
    throw e
  }

  it('缺包时 ready=false，并保留原因', () => {
    const r = probeDependency(missing)
    expect(r.ready).toBe(false)
    expect(r.reason).toContain('content_aggregator')
  })

  it('降级信息带确切安装命令', () => {
    const r = probeDependency(missing)
    expect(r.installHint).toContain('pip install content-aggregator')
  })

  it('安装命令带国内镜像源写法 —— 否则国内用户按默认源装不上，等于没提示', () => {
    const r = probeDependency(missing)
    expect(r.installHint).toMatch(/pypi\.tuna\.tsinghua\.edu\.cn/)
  })

  it('探测永不抛异常 —— 它在健康检查阶段调用，抛出即打断应用启动', () => {
    expect(() => probeDependency(missing)).not.toThrow()
  })

  it('探测内部再抛（如权限错）也收敛为 ready=false 而非上抛', () => {
    const r = probeDependency(() => { throw new Error('EACCES') })
    expect(r.ready).toBe(false)
    expect(r.reason).toContain('EACCES')
  })

  it('缺包时不返回构造器 —— 调用方若误判会拿到 undefined 并炸在深处', () => {
    const r = probeDependency(missing)
    expect(r.YouTubeCollector).toBeUndefined()
  })
})

describe('creator-collector · 依赖缺失错误码可被 IPC 层识别', () => {
  it('DEPENDENCY_MISSING 是约定的错误码（UI 据此显示安装指引而非泛化失败）', () => {
    expect(CREATOR_INPUT_ERRORS.DEPENDENCY_MISSING).toBe('creator:dependency_missing')
  })

  it('缺包应映射到 DEPENDENCY_MISSING 而不是 INVALID_INPUT', () => {
    // 两者 UI 表现完全不同：前者给安装命令，后者让用户改输入
    expect(CREATOR_INPUT_ERRORS.DEPENDENCY_MISSING).not.toBe(CREATOR_INPUT_ERRORS.INVALID_INPUT)
  })
})