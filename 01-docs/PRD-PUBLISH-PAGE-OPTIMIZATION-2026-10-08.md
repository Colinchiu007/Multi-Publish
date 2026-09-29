# PRD：发布页优化 Roadmap——对比参考产品的差距分析与落地计划（2026-10-08）

> **立项日期**: 2026-10-08
> **分析对象**: 视频发布页 + 图文发布页（`apps/desktop/src/views/Publish.vue` 两分支 + 批量模式）
> **对比基准**: 参考产品 4.13.19（本机逆向工程目录取证；主进程 bundle 8.4MB，其发布页 UI 走远程 Web，本地无界面代码，故页面级对比以其**任务结构、状态模型、引擎行为**为基准）
> **状态**: 分析完成；P1-4 已实现（本文档同 PR）；P0-1/P0-2/P1-3/P1-5 待立项
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
| 1 | **发布后平台审核状态跟踪** | 16 态 + 主动回查平台作品列表 | 发布历史 3 态（success/failed/pending），终态即终点；「发布成功」后内容被审核拒绝/仅自己可见/转码失败/被下线**用户完全不可见** | 🔴 P0-1 |
| 2 | **账号风险前置预检** | -110 风险码族 + 行动指引 | 只有登录态三态（active/expired/unverified）；风控账号走到发布中途才失败 | 🔴 P0-2 |
| 3 | **平台原生草稿往返** | per-platform draftId 存平台侧可回取 | 草稿只存本地 | 🟠 P1-3 |
| 4 | **定时×草稿互斥校验** | 引擎层硬拒绝「定时发布不能存草稿」 | 定时和存草稿独立可组合，无互斥提示 | 🟠 P1-4（**本文档同 PR 已实现**） |
| 5 | platform-capable 字段补齐 | visibility(5)/location(3)/goods(4)/activity(3)/download(2)/music(2)+独有项 | 注册表已收录未实现（PRD §十一 roadmap） | 🟠 P1-5 |
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

### P0-1 审核状态跟踪（建议下一个大 change）

- **状态机**：发布历史增加 `auditStatus` 列（枚举对齐参考产品 16 态裁剪：published/inAudit/prePublish/deny/notPublic/withdrawn/transferFail(转码失败)/unknown）
- **回查通道**：按平台回查创作者中心作品列表（`aweme_id`/`docId` 匹配 + `status_value` 映射——参考产品实测口径）；定时任务轮询 + 状态变化通知
- **显示**：历史列表状态列（含平台差异图标）、详情页状态时间线、拒绝/下线醒目提醒
- **依赖**：发布结果需落 `platformWorkId`（当前部分链路已回传 url，需补 workId）

### P0-2 账号风险预检

- **风控码映射表**：从参考产品 -110 码族 + 本仓实测积累（注册表或独立映射文件）
- **预检时机**：发布前对已选账号做风险探测（轻量：登录检测通道复用 + 风控特征）
- **显示**：目标选择器账号行风险标记 + 「去创作者中心验证」指引

### P1-3 平台原生草稿往返

- registry `draft` 语义（5 平台）→ 「存到平台草稿箱」动作 + 平台草稿列表 + 回取编辑
- 与 P1-4 的本地草稿守卫共存（平台草稿走平台语义，本地草稿走本地语义）

### P1-5 可见性通用控件（registry 语义级映射）

- `visibility` 语义（5 平台：YouTube/TikTok implemented + 抖音/快手/微博 platform-capable）→ 通用区语义级控件（公开/私密/好友 → 各平台值映射）

## 五、残余限制

- P1-4 保存侧不判定时时间是否过期（发布链路已有拦截；保存侧只消灭「误解」不管「有效性」——过期定时的草稿加载时会被清除）
- 互斥确认的取消/关闭（含右上角 X）都映射为「保留定时保存」——无「放弃保存」路径（设计取舍见 §3.4）
- 批量模式（batchMode）暂未接入本守卫（批量表单无存草稿动作，天然无此误解路径）
