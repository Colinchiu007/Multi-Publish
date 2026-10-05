# 代理环境自适应口径（直连优先 / fake-ip 副作用 / 工具链判据）

> 适用场景：本机从「运行本机代理客户端」切到「路由器/网关级透明代理」（或反之）时，
> 哪些东西真的依赖代理、哪些只是**看起来**依赖，以及如何用报错指纹而不是猜测来选路。
> 触发事实：2026-10-05 本机停用客户端代理、改由路由器透明代理后，一批脚本与文档配方失效或误导。

## 1. 结论先给：本仓运行时代码不依赖任何本机代理

按「代码 / 配置 / 存量数据」三层逐个实测，三层都干净：

| 层 | 判据 | 结果 |
| --- | --- | --- |
| 运行时代码 | 全仓 `git grep -a -E "setProxy|proxy-server\|proxyConfig\|proxyBypassRules\|resolveProxy"`（`apps`/`packages`/`config`） | 只有**账号级代理**功能（`ipc-handlers/account.js` 的 `account:set-proxy` → `rpa-view-session._configureProxy`），参数由用户显式提供；`normalizeProxyConfig(proxy)` 为空即整段跳过。`login-network-diagnostics.js` 只用 `resolveProxy` **观测**走哪条路，不改路由 |
| 默认值 | `toElectronProxyRules` / `_configureProxy` 的未配置分支 | 无默认代理。Chromium 走系统解析 ⇒ 透明代理下自动生效，**零配置** |
| 机器配置 | `git config --global --get http.proxy`、`Test-NetConnection 127.0.0.1 -Port 7897` | 全局代理已清空、本机无监听 ⇒ 直连即通（实测 `github.com` 302、`gh api rate_limit` 限额 5000） |
| 存量数据 | 两份 `accounts.json`（`shared-user-data` 与调试 profile）逐条扫 `proxy` 字段 | 8 个账号 **0 条**配置了代理 ⇒ 没有"历史上填过 127.0.0.1:7897、现在变死链"的暗雷 |

唯一**真正**依赖代理环境的是 ops-center 的 SSRF 守卫开关（见 §3），那是 fake-ip 的副作用，与"有没有本机客户端"无关。

## 2. 用报错指纹选路，不要靠猜

```
报错含 "over proxy" / "proxyconnect tcp ... refused"  ⇒ 本机代理没人接（不是 GitHub 不通）
                                                     正解：清空代理直连，别去启动代理
       git -c http.proxy= -c https.proxy= push ...        gh/curl 侧：HTTPS_PROXY= （空串）
无上述字样且超时/连接被重置                          ⇒ 链路抖动或需出口代理
                                                     先多轮复测，再考虑 -c http.proxy / -x
取 Actions job 日志 / artifact 内容                   ⇒ 一律直连（302 目标域不在代理规则内，带代理必失败）
```

两条同源的**观察者**纪律（都踩过）：

- `gh ... --jq` 在**结果为空**时输出零字符且 rc=0，和"网络被静默吞掉"一模一样。判 `gh` 可达性一律先看去掉 `--jq` 的原始输出，或读一个必然非空字段当正控。
- `||` 兜底会被管道吃掉：`(git push 2>&1 | tail -2 || git -c http.proxy=… push)` 判的是 `tail` 的退出码（恒 0），代理兜底根本不执行。要么显式捕获 `rc`，要么一开始就按指纹选路。

## 3. fake-ip 的两个副作用（这才是"换代理环境"真正会咬人的地方）

透明代理（路由器 OpenClash 等）与客户端 TUN 在**主机视角**表现一致：DNS 由代理侧接管，公网域名一律回 `198.18.0.0/15`（RFC 2544 基准段）。实测：

```
github.com       -> 198.18.0.54   [fake-ip]
api.openai.com   -> 198.18.1.215  [fake-ip]
open.bigmodel.cn -> 47.94.131.76  （CN 规则直连，真实 IP）
```

由此得到两条硬结论：

1. **「本机 DNS 能否解析某域名」不再是有效探针。** 它对"未部署"和"已部署但链路不通"给出同一个读数。
   判域名存在性改走 DoH：`https://dns.google/resolve?name=<host>&type=A` 读 `Status`（3=NXDOMAIN），
   并**必须配一个必然存在的正控**（`github.com` → 真实 IP）证明通道本身可用。
   本仓实例：`ops.iart.work` 由此确证为 NXDOMAIN（运营中心未部署），同场 `auth.iart.work` = `39.105.42.85` 线上正常。
2. **`OPS_ALLOW_PROXY_BENCHMARK_IPS` 在开发机仍需为 `true`。** 它是 `model_preset_service._is_private_or_reserved`
   对 `198.18.0.0/15` 的显式放行开关，只放行这一段（真实私网/CGNAT/链路本地仍拒），生产/ECS 保持 `false`。
   ⚠️ 其拒绝文案目前把归因写成「Clash/TUN 类代理」，在"本机没有客户端、代理在路由器上"的场景会误导运营判成真实内网；
   待拓宽为「任一 fake-IP/DNS 劫持型代理，含上游网关/路由器」。该改动属运行面（ops-center 后端），须独立走代码 PR + 质量节拍。

## 4. 工具链的自适应实现（仓外 `D:/Data/projects/.tools/mp-ci/`）

曾有 11 处脚本把 `HTTPS_PROXY=http://127.0.0.1:7897` 写死。客户端停用后它们的症状是**静默失明**
（连续 `proxyconnect refused` → 按设计报 `BLIND rc=5`），很容易被误读成"PR 卡住了"。现在统一为：

- `proxy-env.js`：探测候选端口（7897/7890/7891/7892/socks5:7890/10809），**探不到就返回 DIRECT**；
  环境变量 `MP_FORCE_PROXY` 显式覆盖、`MP_PROXY_CANDIDATES` 改候选、`MP_PROXY_PROBE_MS` 改预算。
  输出形如 `{"picked":null,"probed":[...],"decision":"DIRECT"}` —— 选路结果可被打印，不靠注释猜。
- 各脚本默认**不带**代理；需要时由 `MP_FORCE_PROXY` 注入。判据仍是「按报错指纹选路」，不是「默认加代理更保险」。
- 附带一条**观察者自身的坑**（已在仓内 AGENTS.md 有同类条目）：watcher 把确定性错误当网络抖动重试，
  会把整个预算烧成 `BUDGET_EXHAUSTED` 而看起来"一直在工作"。确定性错误必须立刻退出并如实报瞎。

## 5. 适用范围（写清楚它不管什么）

- 系统代理开关**只覆盖 WinINET 类应用**（.NET/IE/部分 Edge 场景）。git、curl、gh、node、Docker、npm 一律忽略它——
  所以"浏览器能开 GitHub 而 git 不行"不是矛盾，是两套栈。要覆盖这些进程只有 TUN 这条路（本机未启用）。
- 本文管的是**开发机/CI 之外的取数与推送链路**。应用运行时的网络路由由 Electron/Chromium 决定，见 §1 表格：无默认代理。
- `apps/desktop/tests/visual-testing/.env.example` 里被注释掉的 `HTTP_PROXY=...7890` 是历史示例，不构成依赖，也不再是推荐做法。

