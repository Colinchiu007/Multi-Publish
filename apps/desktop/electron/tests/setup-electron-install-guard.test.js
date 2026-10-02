// 测试期禁止执行 electron 的 install.js —— #2794，采纳 QM-6 外部评审的 Critical。
// 机理：require('electron') 走进"二进制没备好"分支时会
// spawnSync(process.execPath, [<electron 包>/install.js])。CI 上那次 spawn 若真被执行就是数秒网络取用，
// 耗时会记到"当时正在跑的那条用例"头上（#2783 的 15700ms 撞 testTimeout=10000），
// 而它打出的日志与"夹具谎报导致的空转"完全同字 —— 靠日志形状区分不了，所以锁 spawn 面本身。
// 命名说明：本文件名刻意不以 test- 开头（.gitignore:59 的 `test-*.js` 未锚定目录，
// 会把新用例静默排除在 git 之外、CI 永远不跑它）。
describe('测试期 electron install.js 守卫（#2794）', () => {
  const cp = require('node:child_process')
  const nodePath = require('node:path')

  const installJs = () => nodePath.join(nodePath.dirname(require.resolve('electron')), 'install.js')

  it('指向 electron 包内 install.js 的 spawnSync 必须当场抛错并点名补救动作', () => {
    const target = installJs()
    // 先证明这个路径确实是要拦的那一条（否则下一条断言可能在对一个不相干路径发功）
    expect(target.replace(/\\/g, '/')).toMatch(/\/node_modules\/electron\/install\.js$/)
    expect(() => cp.spawnSync(process.execPath, [target])).toThrow('[TEST-ELECTRON-INSTALL-SPAWN]')
    expect(() => cp.spawnSync(process.execPath, [target])).toThrow('ensure-electron.js')
  })

  it('普通子进程调用不受影响（证明守卫不是恒抛）', () => {
    const r = cp.spawnSync(process.execPath, ['-e', 'console.log(1)'])
    expect(r.status).toBe(0)
    // 子进程的 stdout 会带上颜色转义：CI runner 上实测拿到 `"\u001b[33m1\u001b[39m\n"`，
    // 本机无 FORCE_COLOR 时是 `"1\n"` —— 不归一就直接 toBe('1') 是一条**只在 runner 上红**的断言
    // （本仓反复踩过的同一坑：读任何带 ANSI 的输出前先剥转义，再比较）。
    // 有意匹配 ESC 控制字符 ⇒ 按本仓既有先例（tag-suggest/compliance-filter.js:122）关掉 no-control-regex。
    // eslint-disable-next-line no-control-regex
    expect(String(r.stdout).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim()).toBe('1')
  })

  it('守卫挂在真实 child_process 模块对象上，裸 require 与 node: 前缀是同一实例', () => {
    // electron/index.js 里裸写的是 require('child_process')；若守卫只挂在其中一个别名上就是装饰。
    expect(require('child_process')).toBe(cp)
    expect(cp.spawnSync.__mpNoElectronInstall).toBe(true)
    expect(cp.spawn.__mpNoElectronInstall).toBe(true)
  })

  it('守卫必须幂等：setupFiles 每个测试文件都会跑一次，套两层会让错误信息重复且成本翻倍', () => {
    const src = cp.spawnSync.toString()
    expect((src.match(/assertNoElectronInstallSpawn/g) || []).length).toBe(1)
  })

  it('五个被保护的动词里，execFileSync 也必须挡住同一路径（变异面不止 spawnSync）', () => {
    expect(() => cp.execFileSync(process.execPath, [installJs()])).toThrow('[TEST-ELECTRON-INSTALL-SPAWN]')
  })
})
