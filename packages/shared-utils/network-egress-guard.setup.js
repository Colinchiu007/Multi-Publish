// 测试期「禁止真实出站」守卫的统一装配入口（唯一一份）。
// 两个平面都必须在这里装：
//  1) socket 面 —— patch `net.Socket.prototype.connect`，只对**本 realm** 生效；
//  2) 子进程面 —— patch spawn/spawnSync/execFile/execFileSync/fork，给 node 子进程注入
//     `--require <本文件>`，让守卫跟着进子进程 realm。缺了它，"测试期零真实出站"对
//     子进程路径结构性无效（#2783 的原始形态：require('electron') 在测试 realm 里
//     spawnSync 起 install.js，子进程真下载数秒，耗时被记到当时那条用例头上）。
// __filename 作为注入目标 ⇒ 子进程再 spawn 孙进程时同一入口继续生效（安装本身幂等）。
const guard = require('./src/network-egress-guard.js')

guard.installTestNetworkGuard()
guard.installTestChildProcessGuard({ setupPath: __filename })
