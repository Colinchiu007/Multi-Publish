## Context

- C-1 已独立复核成立：`apps/desktop/src/api/publisher.js:396` 以扁平名 `filmEngineeringRetryShot` 调用；`apps/desktop/electron/preload/film-engineering.js:14,26` 只在 `filmEngineering` 命名空间下暴露 `retryShot`；`apps/desktop/src/api/electron-bridge.js:34` 判 `typeof api[method] !== "function"` 即 `return undefined`。
- preload 侧测试已存在且强：`apps/desktop/electron/preload.test.js` 有 `api.filmEngineering[method](...)` 转发矩阵、`toHaveProperty` 暴露面断言、以及 `expect(Object.keys(api).length).toBe(334)` 一类总数锁。**缺的是反向那一侧**。
- 渲染层测试 `useFilmVideoGen.test.js` / `useFilmProduction.test.js` 用 `vi.mock('@/api/publisher')` 整体 mock 本模块，只断言"调用了 `filmEngineeringRetryShot`"，结构上无法发现 preload 没有该方法。
- 同仓已有可复用的先例形态：`apps/desktop/electron/services/settings-roundtrip-contract.test.js`（结构锁 + 判据矩阵 + `KNOWN_LAGGING` 棘轮），其"先跑基线再变异反证"的取证纪律直接沿用。
- 报告中提到 `preload.test.js:716` 有 `retryShot` 转发断言——已复核为真，但那是**暴露面自证**，与本次要补的**跨侧对账**不是同一件事，不可当成已有守护。

## Goals / Non-Goals

**Goals:**

- 让 C-1 失效功能恢复可用，且失败时界面有可读错误而非静默 `undefined`。
- 补一条跨渲染层与 preload 的反向对账测试，拦死本类及未来全部同类缺陷。
- 判据能识别命名空间成员形态，且不误伤合法写法。
- 失败为阻塞级门禁。

**Non-Goals:**

- 不收敛 9 份独立 `getApi()`，不迁移 6 个绕过桥接层的文件。
- 不改 preload 暴露面形状、不改主进程 handler、不改 IPC channel 名。
- 不给桥接层加"调用名不存在就抛错"的运行时防御——那是行为变更，另开切片（理由见 D2）。
- 不处理审查报告的其余 16 MAJOR / 11 MINOR。

## Decisions

### D1：C-1 调用侧改走命名空间，而不是给 preload 补扁平别名

**选**：`publisher.js` 侧改为经 `filmEngineering` 命名空间取 `retryShot` 后调用。
**备选 A**：在 preload 额外暴露 `filmEngineeringRetryShot` 扁平别名。
**备选 B**：新增一层 `filmEngineering` 命名空间封装函数供调用方使用。

- 选命名空间的理由：preload 已有 8 个命名空间共 334 键，扁平别名会把命名空间体系反向拉平，且每加一个别名就多一处可错配的接缝——正是本次要消灭的形状。
- 否决备选 A：它治的是这一行，而根因是接缝无测试；补别名后 C-1 变成"另一个名字又写错"仍会复发，且别名本身无守护。
- 备选 B 与"选"本质相同，仅封装位置不同；差异在于是否新增一层间接。选择直接改调用侧，因为调用方只有 2 处（`useFilmProduction.js:280`、`useFilmVideoGen.js:237`），不值得引入新抽象层；若后续调用点增至 5 处以上再抽封装。

### D2：不加运行时防御，失败可见性由调用方承担

`electron-bridge.js:34` 的静默 `return undefined` 是全仓 334 个能力的公共回落路径，为一条缺陷改它会波及所有调用方。**本次不改桥接层**，改为：修好 C-1 后，在两个调用方的失败分支补可读错误文案，使"重试失败"在界面上有反馈。运行时"调用名不存在即抛错"的防御另开切片。

### D3：判据用静态抽取 + 显式扫描域 + 棘轮自检，不用运行时枚举

**选**：从 `src/api/**` 静态抽出 `invokeWithFallback("<名>", ...)` 的调用名，与 preload 暴露面对账；扫描域写成显式清单，并加一条"含调用的文件必须都在清单里"的自检。
**备选**：运行时枚举——在 Electron 里遍历 `window.electronAPI` 与调用记录比对。

- 选静态抽取：可在 vitest 里无 Electron 环境运行，秒级，且失败信息直接点名调用名；运行时枚举需要拉起真实窗口，成本高、与 QM-1 打包强绑定，反馈太慢。
- **已知边界（必须写明，不得当"不可能再发生"信任）**：① 拆句等价绕得过（`const m = "filmEngineeringRetryShot"` 再 `invokeWithFallback(m, ...)`）；② 别名/动态取名绕得过；③ 字面量实参里的右括号会让配对扫描提前收口；④ 扫描域是写死清单。①②③ 属静态判据的固有欠精确，④ 由 D3 的棘轮自检兜底。
- 棘轮自检本身也可能被"把扫描域写宽"绕过——因此该自检的判据必须按"文件里是否真的含 `invokeWithFallback(`"取，而不是按文件名硬编码清单比对。

### D4：复用 preload 暴露面基线，不新建第二份暴露面真源

对账测试直接 require `createFilmEngineeringApi` 等工厂函数取真实暴露面，**不**手抄一份键名清单。手抄会立刻退化成第二真源，重演本次要消灭的漂移形状。

## Risks / Trade-offs

- **静态判据的固有欠精确**（D3 ①②③）：极端绕行写法仍可能逃逸。接受该边界，理由是逃逸形态需要刻意构造，而本类缺陷的实际形态是直接写错名字——已被完全覆盖。
- **误报风险**：判据若过宽会把合法写法判红，导致后续会话直接删锁。缓解：判据矩阵必须同时含正例（必须抓到）与负例（不得误伤），并先跑基线证明未变异时为绿。
- **门禁阻塞性带来的摩擦**：新测试可能一次性暴露多个既有未对账调用名。处理方式见 tasks.md——先量化存量、按"真实缺陷优先"分批修，不允许为了让门禁变绿而放宽判据。
- **preload 暴露面重构会大面积触发本测试**：这是预期行为（暴露面变了就该重新对账），但需在 design 层面知会，避免被误当成测试过于敏感。
