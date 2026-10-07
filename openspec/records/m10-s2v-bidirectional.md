---
record: m10-s2v-bidirectional
task: 为 S2V 父子契约补双向交叉校验回归锁，堵住「已登记但父级已删」这一唯一缺口
date: 2026-10-07
# ↓ 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后立即开回填 PR 收口）
---

## 本次执行记录：S2V 父子契约双向交叉校验（M-10，m10-s2v-bidirectional，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码目录下的**新增测试文件**（不改生产代码）⇒ 仍按隔离 worktree 执行。`D:\Data\projects\mp-worktrees\mp-m10-s2v`、裸分支 `m10-s2v-bidirectional`，基线 `d936ba72`；共享主工作区未写入 |
| 第一性原因（QM-5 ①） | PASS | `s2v-panel-contract.js:105-113` 的 `createS2VPanel` 先用 `Object.defineProperty` 把**每个** `S2V_PANEL_STATE` 键预置到 `state` 上；随后 `:126-132` 的 guard 用 `if (!(prop in target))` 判存在性 —— 对白名单内键该表达式**恒为假**。结果：未登记键抛错（防住了），**已登记但父级已改名/删除的键静默返回 `undefined`**，面板控件退化为空值或默认值且零报错。这正是契约注释（`:125`）声称要防的那类 Bug |
| 逃逸分析（QM-5 ②） | PASS | ①既有测试层：`S2vConfigPanels.test.js`（`:45-60`）拿 `S2V_PANEL_STATE` **自身**构造 mock `vm`，白名单与真实 `CreateView` 之间**零交叉校验** —— 结构上不可能发现这类漂移。②运行层：构造这个缺陷需要在 5600+ 行的 `CreateView.vue` 里删一个真实键再挂载面板，成本与复现率都不可接受。③评审层：白名单是一个「看起来正确」的常量数组，diff 里极易滑过 |
| 修复 + 回归保护（QM-5 ④） | PASS | **未改生产代码** —— 缺陷是「防线的缺口」，不是「防线的错误」，补断言即可。新增 `s2v-panel-contract.parent-keys.test.js`（5 用例）：静态解析 `CreateView.vue` 取出 data/computed/methods 真实键集合，与两份白名单**双向**对账。**反证已做**：向 `S2V_PANEL_STATE` 注入 `s2vKeyThatDoesNotExistOnParent` ⇒ 转红，并点名该键 + 说明后果 + 给出两条修法；撤销后 5/5 绿。`video-creation/` 目录全量 **8 文件 73 用例通过** |
| 防止再次发生（QM-5 ⑤） | PASS | 另加 2 条**防装饰**用例：①提取器规模下限（data>80 / computed>30 / methods>100）—— 提取器一旦静默失效，后两条会「全部通过」而非「全部失败」，那种绿是装饰；②断言一个必然不存在的键确实被判为缺失，证明提取器返回的不是全集也不是空集。这两条**不是凑数**：本轮开发过程中提取器真的坏过一次（见下） |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致（仅 1 个新增文件） |
| 接线棘轮 | PASS | 未新增目录，在既有 `src/views/video-creation/` 下；`vitest.config.js` 的 `include` 已含 `src/**/*.test.{js,ts}`，无需改 workflow |
| QM-1 打包 / QM-4 视觉 | N/A | 未触运行面：纯新增测试，零生产代码改动 |
| QM-6 CCG 双模型外部评审 | 未能执行 | 与 #3012 / #3029 同因：`codeagent-wrapper` 只有 `codex`/`gemini`/`claude`，`opencode` 不在其中，三者实测均失败 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin <branch>` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 关键结论：这是潜伏陷阱，不是现行 Bug

首次跑对账得到「48 条 state 中 43 条在父级无对应键」的**假警报** —— 根因是提取器坏了，
不是代码有漂移（详见下节）。修好提取器后的真实结果是：

```
CreateView：data 154 键 / computed 75 键 / methods 243 键
S2V_PANEL_STATE  48 条，父级无对应键 0 条
S2V_PANEL_METHODS 27 条，父级 methods 无对应键 0 条
=> 当前无漂移
```

即**当前 CreateView 与白名单完全一致，这条测试今天是绿的**。它的价值是把这个不变量钉住：
今后任何一次对 `CreateView` 的 data/computed/methods 删改，只要碰了白名单里的键，
CI 立刻红并点名是哪一个键。这正是报告「修复建议」里那条「纯新增测试，零风险」的本意。

### 本轮提取器真的坏过一次（故加了防装饰用例）

第一版提取器只识别 `ObjectProperty`，而实测 AST 里：

- `data` 是 **`ObjectMethod`**（`data() { return {...} }`）→ data 提取为 0 键
- `computed` / `methods` 的成员是**方法简写**，同样是 `ObjectMethod` → 被过滤器全部排除

结果是 `data 0 / computed 5 / methods 0`，直接推出「43 条缺失」的假结论。修正为同时接受
`ObjectProperty` 与 `ObjectMethod`（并从 `data` 方法体的 `ReturnStatement` 取键）后，
真实规模为 154 / 75 / 243。

**如果当时把「43 条缺失」当成真漂移去改生产代码，就会为了一个自己的 bug 去动
5600 行的 `CreateView.vue`。** 这也是本条测试必须带防装饰用例的直接理由。

### 遗留（不假装已闭合）

- **QM-6 CCG 双模型外部评审未能执行**（同 #3012 / #3029）。
- **只锁了「白名单 ⊆ 父级」这一个方向**。反向（父级有键但白名单没登记）不构成缺陷 ——
  子面板本就不该看到父级全部状态，报告也只要求防「白名单有、父级无」这一侧。
- **提取器对 Options API 的四种写法**：本次实测到 `data` 是方法、`computed`/`methods`
  是对象属性。若将来 `CreateView` 改用 `data: () => ({...})`（箭头函数形式）或
  其它形态，提取器会再次静默失效 —— 防装饰用例（规模下限）届时会转红，但报错信息指向
  「提取器」而非「漂移」，需要人看一眼。
- **与 M-9 的关系**：M-9 的最高收益项（遍历 `src/api/` 断言每个方法在 preload 暴露面内）
  已由 #2952 的 `ipc-exposure-contract.test.js`（532 行）落地，本次未重复造。