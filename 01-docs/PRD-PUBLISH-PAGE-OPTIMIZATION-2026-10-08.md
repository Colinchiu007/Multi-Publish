# PRD：发布页优化 Roadmap——对比参考产品的差距分析与落地计划（2026-10-08）

> **立项日期**: 2026-10-08
> **分析对象**: 视频发布页 + 图文发布页（`apps/desktop/src/views/Publish.vue` 两分支 + 批量模式）
> **对比基准**: 参考产品 4.13.19（本机逆向工程目录取证；主进程 bundle 8.4MB，其发布页 UI 走远程 Web，本地无界面代码，故页面级对比以其**任务结构、状态模型、引擎行为**为基准）
> **状态**: 分析完成；P1-4 / P0-2 / P1-5 / P0-1（第一切片）已实现（本文档同 PR 链）；P0-1 回查通道第二切片 / P1-3 / P2 待立项
> **关联**: [PRD-PUBLISH-CAPABILITY-REGISTRY-2026-10-08.md](./PRD-PUBLISH-CAPABILITY-REGISTRY-2026-10-08.md)（字段面注册表，已合并）

---

## 一、证据基础

### 1.1 参考产品侧取证（主进程 bundle）

| 证据 | 出处（bundle 内特征） |
| --- | --- |
| 16 态审核模型 | `auditStatusEnum`：published/inAudit/prePublish/deny/notPublic/notSuitableForPublicity/customWithdrawn/draft/executeFail/waitExecute + 字符串态（视频转码中/视频转码失败/封面图转码失败/已推荐/已下线/仅我可见/审核不通过/已提交） |
| 主动回查平台 | 用 `aweme_id` 匹配创作者中心作品列表，读 `status_value`（144→deny）、`timer`（→prePublish 定时中）映射到枚举 |
| 6 态执行模型 | `publishStatusEnum`：uploading/uploadSuccess/uploadFail/pushing/pushSuccess/pushFail |
| 账号风险码族 | `-110` 码族 + 行动指引文案（「官方检测到您的账号存在风险，请先前往创作者中心发布作品，验证通过即可一键发布」） |
| 平台原生草稿 | per-platform `draftId`（知乎 `saveArticleDraftAsync`、视频号 draftId 回传）；引擎层强制「定时发布不能存草稿」（pubType 互斥） |
| 数据看板 | 总转评赞/视频发布总数/播放总数/转评赞总数 + `videoPlayTrend` 趋势图 |
| 定时发布 | `publish_time`（10/13 位时间戳归一）；平台原生定时（抖音 timing/快手 publishTime/B站 dtime） |

### 1.2 本仓现状核对

- 字段主面：注册表驱动（15 平台 titleMode/限制/差异化字段/通用矩阵），差异化面板数据驱动渲染，支持度徽标 + 无标题平台首行提示——**字段面已反超**（参考产品为逐平台硬编码）
- 进度反馈：`phase/stageKey/percent` + start/success/failed 双边界 + 可最小化后台面板（PR #2593）——与其两段式（upload→push）粒度对齐
- 失败重试：批量 `retryFailedBatch` + 历史页 `retryTask` + 单篇 `retryPublish`；任务取消 `cancelPublish`；本地草稿 `saveDraft/loadDrafts` 往返
- 智能辅助（领先项）：标题助手/标签建议/最佳发布时间/AI 写作/AI 封面/封面裁剪/视频抽帧封面

## 二、差距清单（按价值排序）

| # | 差距 | 参考产品形态 | 本仓现状 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | **发布后平台审核状态跟踪** | 16 态 + 主动回查平台作品列表 | ~~发布历史 3 态，终态即终点~~ → **状态机 + 原记录回写 + 展示已落地**（2026-10-09 第四切片：7 态枚举 + 监控结论就地回写 + 历史/详情徽标 + 拒绝下线醒目提醒）；**回查通道可用性待第二切片**（凭证传递 + 端点证据） | 🔴 P0-1 ◐ |
| 2 | **账号风险前置预检** | -110 风险码族 + 行动指引 | ~~只有登录态三态~~ → **已实现**（2026-10-08 第二切片：目标选择器风控徽标 + 行动指引具体化 + 词表增强，详见 §四 P0-2） | 🔴 P0-2 ✅ |
| 3 | **平台原生草稿往返** | per-platform draftId 存平台侧可回取 | 草稿只存本地 | 🟠 P1-3 |
| 4 | **定时×草稿互斥校验** | 引擎层硬拒绝「定时发布不能存草稿」 | 定时和存草稿独立可组合，无互斥提示 | 🟠 P1-4（**本文档同 PR 已实现**） |
| 5 | platform-capable 字段补齐 | visibility(5)/location(3)/goods(4)/activity(3)/download(2)/music(2)+独有项 | ~~注册表已收录未实现~~ → **visibility 5 平台已打通**（2026-10-09 第三切片：语义级通用控件 + resolver/adapter 补齐 + 字段转 implemented）；其余语义仍待立项 | 🟠 P1-5 ✅ |
| 6 | 数据回流看板 | 总转评赞/播放/发布总数 + 趋势图 | 无发布后数据回流 | 🟡 P2-6 |
| 7 | 批量模式字段面 | 任务结构支持全字段 | 批量缺封面/徽标/无标题提示/差异化面板 | 🟡 P2-7 |
| 8 | 账号分组/矩阵管理 | 账号分组、团队/子账号 | 无分组 | 🟡 P2-8 |

**核心结论**：字段面已反超；真正差距集中在**发布后的世界**——审核状态跟踪（P0-1）是矩阵工具的核心价值分水岭，参考产品把「发布成功」当起点，我们目前当终点。

## 三、P1-4 定时×草稿互斥（本轮已实现）

### 3.1 问题定义

本地草稿是**静态快照**（存本地 JSON，不会自动触发任何动作）；定时发布是**调度队列语义**（点击「一键发布」时 `validateScheduleEntries` 校验后进 scheduled-publish 队列）。两者可独立组合出「带定时时间的草稿」，产生两类用户误解：

1. **保存侧误解**：用户设置定时时间后点「存草稿」，以为「到点自动发」——草稿永远不会自动发布
2. **加载侧陷阱**：草稿恢复出**已过期**的定时时间 → 用户直接点发布 → 被 `validateScheduleEntries` 以「定时时间已过去」拒绝，且不知道原因在草稿里带出来的旧时间

参考产品在引擎层硬拒绝（pubType 互斥：定时任务不得存草稿）；本地草稿语义更宽（WIP 快照，保留定时字段有合理性——用户可能想保存「打算定时发」的意图），故本仓采用**保存前确认 + 加载时清过期**的双侧守卫而非硬拒绝。

### 3.2 数据校验

| 校验点 | 规则 | 位置 |
| --- | --- | --- |
| 保存侧触发条件 | `String(article.publishTime || '').trim()` 非空 | `usePublishDrafts.confirmScheduleDraftConflict` |
| 加载侧过期判定 | `Date.parse(time)` 非 NaN 且 `ts <= Date.now()` → 过期清除 | `usePublishDrafts.clearStaleDraftSchedule` |
| 加载侧保留 | `ts > Date.now()`（未来时间）→ 原样保留，不提示 | 同上 |
| 无定时时间 | 保存/加载均不触发任何守卫（零打扰） | 同上 |
| 既有校验不变 | `validateScheduleEntries`（过去时间/超 30 天/同账号 5 分钟间隔）在发布链路原样生效 | `publish-contract.js` |

### 3.3 流程

```
保存侧（saveDraft）：
  ① 空 title+content → notifyWarning「标题和内容不能都为空」→ 中止
  ② publishTime 非空 → ElMessageBox 互斥确认：
       「已设置定时发布时间（{time}）。草稿是本地快照，不会在定时时间自动发布
        ——定时只在点击「一键发布」时进入调度队列。保存前清除定时时间？」
       [清除定时并保存]（确认）→ article.publishTime = '' → 继续保存
       [保留定时保存]（取消/关闭）→ 原样继续保存
  ③ buildDraftSnapshot() → IPC draftSave → 成功 notifySuccess / 失败 notifyError

加载侧（applyDraft，loadDraft 与所有直接调用方共用）：
  ① 恢复全部 ARTICLE_FIELDS（含 publishTime）
  ② clearStaleDraftSchedule(draft)：
       过期 → article.publishTime = '' + notifyWarning（含原时间）
       未来/缺失 → 无操作
  ③ 恢复 platforms/accounts/platformOverrides
```

### 3.4 功能逻辑

- **确认框双按钮都保存**：确认=清除定时字段后保存；取消/关闭=保留定时字段保存。没有「放弃保存」路径（用户已明确点击存草稿，无需再给退出项；ElMessageBox 右上角关闭等价于保留侧）
- **守卫只在 `saveDraft` 入口**：`buildDraftSnapshot`（导出的纯快照函数）不弹确认——它被 `saveDraft` 调用前已过守卫，直接调用（如测试/其他调用方）拿到的是当前状态的忠实快照
- **过期清除在 `applyDraft` 内**（单一恢复路径）：`loadDraft`、未来任何直接 `applyDraft` 调用方都自动受益，不会出现「某条加载路径忘了清」
- **时区口径**：`Date.parse` 对 `datetime-local` 格式（`YYYY-MM-DDTHH:mm`）按本地时区解析，与用户在表单里看到的时间一致

### 3.5 交互逻辑

| 交互点 | 行为 |
| --- | --- |
| 存草稿（无定时） | 直接保存，零打扰 |
| 存草稿（有定时，未来） | 弹互斥确认（warning 型）；确认→清定时保存；取消→保留保存 |
| 存草稿（有定时，已过期） | 同上（保存侧不判过期——过期定时在发布链路已有拦截，保存侧只管「误解」不管「有效性」） |
| 加载草稿（定时已过期） | 静默清除 + warning toast（含原时间，用户可重新设置） |
| 加载草稿（定时未来） | 原样恢复，无提示 |
| 一键发布（定时未来） | 既有链路不变（validateScheduleEntries → 调度队列） |

### 3.6 显示项与提示文字（zh/en 成对，CI Gate 7 锁定）

| key | zh | en |
| --- | --- | --- |
| `publishDrafts.scheduleConflictTitle` | 定时发布与草稿 | Scheduled publish vs. draft |
| `publishDrafts.scheduleConflictMessage` | 已设置定时发布时间（{time}）。草稿是本地快照，不会在定时时间自动发布——定时只在点击「一键发布」时进入调度队列。保存前清除定时时间？ | A scheduled publish time is set ({time}). A draft is a local snapshot and will NOT publish automatically at that time — scheduling only takes effect when you click "Quick Publish". Clear the schedule before saving? |
| `publishDrafts.scheduleConflictClear` | 清除定时并保存 | Clear schedule & save |
| `publishDrafts.scheduleConflictKeep` | 保留定时保存 | Keep schedule & save |
| `publishDrafts.staleScheduleCleared` | 草稿中的定时发布时间（{time}）已过期，已清除；发布前请重新设置 | The scheduled publish time in this draft ({time}) has already passed and was cleared; set it again before publishing |

### 3.7 测试（usePublishDrafts.test.js，11 例）

| 用例 | 断言 |
| --- | --- |
| 保存完整快照（既有） | 互斥确认弹出 1 次（默认取消=保留）+ payload 含全部字段 |
| P1-4：确认后清除 | 确认框文案含时间与「不会在定时时间自动发布」；publishTime 清空且快照为 '' |
| P1-4：取消保留 | publishTime 原样入快照 |
| P1-4：无定时不弹 | mockConfirm 零调用 |
| P1-4：过期清除 | 加载后 publishTime='' + warning 含「已过期」 |
| P1-4：未来保留 | publishTime 原样 + 无过期 warning |
| 其余既有 5 例 | 数组字段回退/替换语义/API 失败/空草稿不提交（回归不变） |

## 四、后续项立项要点（P0/P1/P2）

### P0-1 审核状态跟踪（**2026-10-09 第一切片已实现**，publish-page-optimization 第四切片）

> 实施时发现：仓库**已有** `publish-monitor.js`（发布后轮询创作者中心）与 phase4-events 的监控回调，但三处缺陷使其未形成可用链路：① 监控回调走 `addRecord` 追加**第二条**历史记录——同一次发布在历史里出现两行，原 success 行与审核结论无法关联；② 监控状态是英文散值（published/reviewed/rejected…），没有统一枚举，渲染层无从渲染；③ 监控结果只写 `status` 字段，不落平台作品 ID。本切片修这三处并补齐展示与提醒。
>
> **第一切片范围**：状态机 + 原记录就地回写 + 历史/详情展示 + 醒目提醒。**第二切片（待立项）**：回查通道可用性——监控 cookies 取自 `task.article.cookies`（实测恒空，凭证在 authData 不随任务走）且 `CHECK_URLS` 的通用 GET+id 协议与抖音/快手真实接口形状不符；需按平台补凭证传递与端点证据。

#### 数据校验

| 校验点 | 规则 | 位置 |
| --- | --- | --- |
| 审核状态枚举 | 7 态白名单（published/inAudit/prePublish/deny/notPublic/withdrawn/transferFail）；非法值 `normalizeAuditStatus` 返回 null | `publish-audit-status.js`（shared-utils 双孪生） |
| 监控状态映射 | 只映射**平台明确结论**（published→published、reviewed→inAudit、rejected→deny、draft→prePublish）；其余（error/timeout/skipped/pending/unknown/failed 及未知取值）返回 `null` | `mapMonitorStatusToAuditStatus` |
| 回写白名单 | 落库补丁只含 `auditStatus`/`monitorStatus`/`platformWorkId`/`auditedAt` 四键；监控响应里的 `status`/`success`/`result`/`error` 一律不得改写（发布成功与否只能由发布链路改写） | `AUDIT_PATCH_KEYS` + `updateRecordAudit` |
| 未知状态不落库 | `auditStatus` 归一失败 → `updateRecordAudit` 不写任何字节 | `publish-history.js` |
| 记录归属 | 就地回写必须 `id` + `owner_subject` 双匹配（跨用户不可改写） | `updateRecordAudit` |

#### 流程

```
发布成功（task:success）
  → 落历史原记录（status=success）+ 建监控任务（postId 存在时）
  → 监控回调（platform 明确结论）
      → buildAuditPatch：映射 + 白名单 + 归一（无定论返回 null）
      → history.updateRecordAudit(task.id, patch, owner)
          → 按 id+owner 定位原记录 → 合并白名单键 → 原子重写 JSONL（tmp+rename）
  → 渲染层历史列表/详情读取 auditStatus → 徽标（拒绝/下线/转码失败标红 + 处置指引）
```

#### 功能逻辑

- **单向证据规则**：只有平台给出明确结论才改写记录；`error`/`timeout`/`skipped`/`pending`/`unknown` 一律保持原记录不变——「没拿到新证据」不是反证（与 `login-state.js` 同族）。这条决定了监控不可用时历史不会出现「审核状态=未知」的伪结论。
- **不追加重复行**：监控结论回写原记录（旧形态每次监控追加一行，历史被污染且统计口径失真——`getStats` 会把同一次发布计两次）。
- **枚举裁剪自参考产品 16 态**：只保留本仓有取证路径的 7 态；未取证状态不造字段（`notSuitableForPublicity`/`customWithdrawn`/`executeFail`/`waitExecute` 等暂不纳入）。
- **平台作品 ID 落库**：`platformWorkId` 来自监控回调的 `postId`，是第二切片「按作品回查」的锚点。

#### 交互逻辑

| 交互点 | 行为 |
| --- | --- |
| 列表审核徽标 | 有**合法**审核结论才渲染；拒绝/下线/转码失败标红（`is-alert`，含内描边强调）+ tooltip「请在平台创作者中心确认并处理」 |
| 无结论 | 不渲染徽标（不得用「无徽标」伪装成「已通过」） |
| 详情弹窗 | 有结论时新增「审核状态」行（醒目态附处置指引）；有 `platformWorkId` 时新增「平台作品 ID」行 |
| 旧记录 | 无 `auditStatus` 字段的历史记录渲染行为完全不变（向后兼容） |

#### 显示项与提示文字（zh/en 成对）

| key | zh |
| --- | --- |
| `historyPage.detailAuditStatus` | 审核状态 |
| `historyPage.detailPlatformWorkId` | 平台作品 ID |
| `historyPage.auditStatusAlertHint` | 请在平台创作者中心确认并处理 |
| `historyPage.auditStatus.published` / `.inAudit` / `.prePublish` / `.deny` / `.notPublic` / `.withdrawn` / `.transferFail` | 已上线 / 审核中 / 待发布 / 审核未通过 / 未公开 / 已下线 / 转码失败 |

#### 测试

- `publish-audit-status.test.js`（13 例）：7 态枚举无重复 / 明确结论映射（含大小写与空白容忍）/ 无定论 6 值 + 非字符串一律 null / 白名单校验 / 提醒态三红四不红 / label key 单一持有 / `buildAuditPatch` 白名单与缺 postId / 无定论返回 null / CJS-ESM 穷举 parity / 规模下界
- `publish-history.test.js` +4：明确结论就地更新且**行数不变** / 无定论与非法值不改任何字节（字节级对照）/ 只吸收白名单键（注入 `status`/`success`/`result`/`error` 全部被拒）/ owner 与 id 不匹配不改
- `phase4-events.test.js` +5：rejected→deny 回写且**不追加重复行** / inAudit-published-prePublish 三态映射 / 6 个无定论状态一律不回写不追加 / `updateRecordAudit` 抛错不冒泡 / 无 postId 不建监控任务
- `PublishHistory.test.js` +11：拒绝醒目徽标 + 指引 / 已上线中性徽标 / 五态文案逐一 / 三红四不红矩阵 / 无结论与非法值不渲染 / 详情显示审核状态与平台作品 ID

#### 残余限制

- **回查通道当前不可用**（第二切片）：监控 cookies 取 `task.article.cookies`（实测恒空，凭证在 authData 不随任务走）；`CHECK_URLS` 的 GET+id 协议与抖音 `aweme/v1/list/`（需签名 POST）、快手 graphql 形状不符（快手已按诚实跳过处理）。因此本切片交付的是**状态机 + 回写 + 展示**；实际审核结论的获取率取决于第二切片。
- 未纳入 `notSuitableForPublicity`（不宜公开）/`customWithdrawn`（自定义撤回）等参考产品状态——无本仓取证路径。
- 状态变化通知（toast/推送）未做：本切片用历史列表/详情徽标呈现；变化通知需与第二切片的轮询节奏一起设计。

### P0-2 账号风险预检（**2026-10-08 已实现**，publish-page-optimization 第二切片）

> 实施时发现：仓库已有完整风控体系（W1 §5/§6 切片——`publish-risk.js` 识别 + `risk-suspender-store.js` 挂起 + 派发前置守卫 + 账号页 RiskSuspendedBanner 恢复入口）。真实差距收敛为三点：**发布页目标选择器无风控可见性**（选中挂起账号要到发布时才被拦）、**指引模糊**（「前往平台侧确认」vs 参考产品的具体动作指引）、**词表缺参考产品取证特征**。本切片补齐这三点。

#### 数据校验

| 校验点 | 规则 | 位置 |
| --- | --- | --- |
| 账号级挂起判定 | 清单条目 `platform === platformId && accountId === accountId` | `PublishTargetSelector.isAccountRiskSuspended` |
| 平台级挂起判定 | 清单条目 `platform === platformId && accountId == null`（覆盖该平台全部账号，与 risk-suspender-store 键语义一致） | `PublishTargetSelector.isPlatformRiskSuspended` |
| 风控识别词表 | RISK_RE += `canvas illegal`（抖音/西瓜特征串）+ `账号存在风险`（参考产品原文）；**刻意不加**「服务异常」等宽泛词（普通服务端错误会误判成风控） | `publish-risk.js` + 引擎 `publish-mode-runner.js`（两侧同义） |
| 非字符串输入 | `isRiskBlocked(非字符串)` 安全返回 false（既有行为不变） | `publish-risk.js` |

#### 流程

```
发布失败（task:failed）
  → isRiskBlocked(task.error) 命中（含新增特征串）
  → riskSuspender.suspend(platform, accountId) + publish:risk-hold / publish:risk-suspended 广播（既有链路不变）
  → 渲染层 useRiskStore 权威清单更新（main.js 已全局订阅）
  → 发布页目标选择器（新增消费点）：挂起账号/平台行显示「⚠ 风控挂起」徽标 + 指引 tooltip
  → 用户按指引去平台创作者中心验证 → 账号管理页 RiskSuspendedBanner 手动解除（既有链路）
```

#### 功能逻辑

- **组件保持哑组件**：风控态经 `riskSuspended` props 注入（`Publish.vue` 接 `useRiskStore.suspended`），选择器不直接耦合 store——与既有 `groups/selectedAccounts` 注入模式一致，测试无需 pinia
- **徽标不禁用复选框**：挂起账号仍可选择（派发前置守卫会拦截），徽标是**可见性层**而非拦截层——避免「静默禁用」的困惑；tooltip 给出完整行动指引
- **平台级挂起双显**：平台行 + 该平台全部账号行都显示徽标（平台级语义覆盖全部账号）
- **词表双侧同步**：桌面 `publish-risk.js` 与引擎 `publish-mode-runner.js` 的 RISK_RE 保持同义（既有合同，注释声明）

#### 交互逻辑

| 交互点 | 行为 |
| --- | --- |
| 挂起账号行 | 「⚠ 风控挂起」徽标（warning 色，cursor:help），hover 显示完整指引 tooltip |
| 平台级挂起 | 平台行 + 全部账号行徽标 |
| 无挂起 | 零徽标零打扰 |
| 选中挂起账号 | 可选中（不禁用）；发布时被派发前置守卫拦截（既有行为） |
| 风控命中通知 | notifyWarning 含具体行动指引（创作者中心验证 + 解除挂起路径） |
| 恢复确认 | resumeConfirm 提示「确保已完成创作者中心验证，否则会再次触发」 |

#### 显示项与提示文字（zh/en 成对）

| key | zh |
| --- | --- |
| `publish.riskHold.badge` | ⚠ 风控挂起 |
| `publish.riskHold.guidance` | 该账号因平台风控已暂停发布。请前往该平台创作者中心手动发布一篇内容完成验证（发布时会弹出验证，通过即可），然后在账号管理页解除挂起。 |
| `publish.riskHold.body`（更新） | 检测到「{platform}」发布触发风控。请前往该平台创作者中心手动发布一篇内容完成验证（发布时会弹出验证，通过即可），然后在账号管理页解除挂起。 |
| `publish.riskHold.suspended`（更新） | …已自动暂停后续发布。请前往该平台创作者中心手动发布一篇内容完成验证…然后在账号管理页手动恢复。 |
| `publish.riskHold.resumeConfirm`（更新） | …请确保已在该平台创作者中心完成验证（手动发布一篇内容并通过验证），否则会再次触发风控暂停。 |

#### 测试（19+20 例新增/更新）

- `PublishTargetSelector.test.js` +5：账号级命中/平台级双显/指引 tooltip 含「创作者中心」与「解除挂起」/无挂起零徽标/跨平台不牵连
- `publish-risk.test.js` +1：参考产品特征串命中；misses 侧钉住「服务异常」不误判（词表决策的回归锁）
- `publish-mode-runner.test.js` +1：引擎侧同义特征串命中

### P1-3 平台原生草稿往返

- registry `draft` 语义（5 平台）→ 「存到平台草稿箱」动作 + 平台草稿列表 + 回取编辑
- 与 P1-4 的本地草稿守卫共存（平台草稿走平台语义，本地草稿走本地语义）

### P1-5 可见性通用控件（registry 语义级映射）（**2026-10-09 已实现**，publish-page-optimization 第三切片）

> 实施时发现：引擎侧**早已支持**抖音/快手可见性透传（`douyin-video.js` 读 `taskData.visibility_type`、`kuaishou-video.js` 读 `td.visibilityType`→`photoStatus`），缺口在**桌面 resolver 不消费**这三平台字段（registry 标 platform-capable）与**微博全链路缺失**（adapter 连 `visible` 都不传）。本切片补齐链路并把字段提升为 implemented。

#### 数据校验

| 校验点 | 规则 | 位置 |
| --- | --- | --- |
| 语义档位合法性 | 仅 `public`/`friends`/`private` 三档；非法档位返回 null（不抛错） | `mapVisibilitySemantic` |
| 档位→平台值一致性 | 注册表 `semanticValues` 声明的每个值必须存在于该字段 `options` 中（`validateRegistry` 拦截） | shared-utils 注册表校验 |
| 抖音取值域 | `visibility_type ∈ {0,1,2}`（0 公开 / 1 私密 / 2 好友），越界不透传 | `resolvePlatformArticle` |
| 快手取值域 | `visibilityType ∈ {1,2}`（1 公开 / 2 仅自己），越界不透传 | `resolvePlatformArticle` |
| 微博取值域 | `visible ∈ {0,1,6}`（0 公开 / 1 仅自己 / 6 好友圈），越界不透传 | resolver + weibo adapter |
| 好友档平台差异 | 快手/YouTube 无好友档 → 返回 null，**不透传**（保持平台默认）且 UI 如实提示 | `getVisibilitySemanticSupport` + 控件 hint |

#### 流程

```
通用区选择语义档位（公开/好友/私密/跟随默认）
  → article.visibilitySemantic
  → buildArticleData 随 payload（data.visibilitySemantic）
  → 主进程 resolvePlatformArticle 按平台映射（mapVisibilitySemantic，注册表单一真源）
     取值优先序：平台 override（差异化面板细调） > 通用档位 > 不设（平台默认）
  → article.{privacy|privacyLevel|visibility_type|visibilityType|visible}
  → 引擎 adapter/链消费（YouTube privacyStatus / TikTok privacy_level /
     抖音 item.common.visibility_type / 快手 photoStatus / 微博 visible）
```

#### 功能逻辑

- **映射单一真源**：5 平台取值映射只在注册表 `semanticValues` 声明一份，UI 与 resolver 均经 shared-utils 函数读取；UI **不持有**任何平台取值表（控件测试断言 `PUBLIC`/`unlisted` 等平台值不出现在通用区）
- **两档硬语义 + 一档软语义**：公开/私密为 5 平台全覆盖档位；「好友」为部分平台档位（tiktok/douyin/weibo 支持，kuaishou/youtube 无对应值）
- **优先级设计**：通用档位是「批量默认」，平台差异化面板的单平台选择优先——用户在面板显式选过就不再被通用档位覆盖（`override.X ?? semanticValue`）
- **字段状态提升**：抖音/快手/微博 visibility 由 `platform-capable`（平台支持但本仓未暴露）转 `implemented` + `uiExposed: true`——链路已真实消费，可进差异化面板细调；未打通的取证字段（如微博 `vote`、B站 `upCloseDanmu`）继续保持 platform-capable 且不进 UI

#### 交互逻辑

| 交互点 | 行为 |
| --- | --- |
| 控件显示条件 | 所选平台中 ≥1 个支持 visibility 语义时显示（`PublishVisibilitySelect` 由 `platforms` 空数组自行隐藏） |
| 档位选项 | 跟随各平台默认（默认）/ 公开 / 好友可见 / 仅自己可见 |
| 支持平台徽标 | 「{count} 个所选平台支持」 |
| 好友档提示 | 当前档位有平台不支持时显示「{platforms} 不支持该档位，将保持默认」（如实告知，不静默丢弃） |
| 无提示时 | 通用说明「一次设置所选平台的可见性；可在「平台差异化内容」中单独调整」 |
| 单平台细调 | 差异化面板的可见性 select 优先于通用档位 |

#### 显示项与提示文字（zh/en 成对）

| key | zh |
| --- | --- |
| `publishPage.visibility` | 可见性 |
| `publishPage.visibilitySupport` | {count} 个所选平台支持 |
| `publishPage.visibilityDefault` | 跟随各平台默认 |
| `publishPage.visibilityPublic` / `visibilityFriends` / `visibilityPrivate` | 公开 / 好友可见 / 仅自己可见 |
| `publishPage.visibilityHint` | 一次设置所选平台的可见性；可在「平台差异化内容」中单独调整 |
| `publishPage.visibilityUnsupported` | {platforms} 不支持该档位，将保持默认 |

#### 测试

- `PublishVisibilitySelect.test.js`（7 例）：无支持平台不渲染 / 四档位渲染与默认值 / 语义标签不暴露平台取值 / 选择只上报事件 / 支持数徽标 / hint 覆盖通用说明 / fallback 通用说明
- `publish-capabilities.test.js`「P1-5 语义级可见性映射」（9 例）：5 平台字段齐全 / 公开私密全覆盖映射 / 好友档三平台且快手与 YouTube 返回 null / 非法档位与未知平台 fail-closed / `resolveVisibilityOverride` 输出 fieldKey+value / 支持矩阵 / 规模下界 / CJS-ESM 穷举 parity / validateRegistry 拦截 semanticValues 漂移
- `publisher-router.test.js`「P1-5 语义级可见性映射」（6 例）：private/public 档 5 平台取值（含快手公开=1 与抖音公开=0 的差异）/ friends 档三平台且快手与 YouTube 不透传 / **平台 override 优先于通用档位** / 空档位与非法档位与无关平台不透传 / 非法 override 值被过滤
- 引擎 `no-title-contract.test.js` B-3b：微博 `visible` 透传（合法值含字符串数字 / 缺省与非法值不透传）

#### 残余限制

- 「跟随各平台默认」不写入任何字段，各平台默认值由平台侧决定（快手 1 公开、抖音 0 公开、YouTube public、TikTok PUBLIC、微博不传＝平台默认）
- 「好友」档对 YouTube 刻意不降级为 `unlisted`（不公开列出 ≠ 好友可见，语义不同），保持不透传
- 微博 `visible` 生效依赖平台对 `aj/v6/upload/upload_video` 该字段的接受度（参考产品取证同字段，未经真机验收）

## 五、残余限制

- P1-4 保存侧不判定时时间是否过期（发布链路已有拦截；保存侧只消灭「误解」不管「有效性」——过期定时的草稿加载时会被清除）
- 互斥确认的取消/关闭（含右上角 X）都映射为「保留定时保存」——无「放弃保存」路径（设计取舍见 §3.4）
- 批量模式（batchMode）暂未接入本守卫（批量表单无存草稿动作，天然无此误解路径）
