# PRD：发布失败自动保存草稿 + 内容指纹防重复（publish-fail-draft-guard）

- 日期：2026-10-09
- 分支：`publish-fail-draft-guard`（隔离 worktree `D:\Data\projects\mp-worktrees\mp-publish-fail-draft-guard`）
- 类型：Bug 修复 + 功能加固（用户数据丢失防护）
- 关联：草稿箱 IPC（`draftSave/draftList/draftDelete`）、发布失败终态单一来源（`bootstrap/phase4-events.js` task:failed）、发布进度富化事件（`publish-progress-events.js`）

---

## 1. 背景与问题

用户在发布页选择图片/视频内容发起发布后，若发布失败：

1. **内容只存在于发布表单（内存态）**。发布失败后页面停留、误刷新、误关闭或跳转其他页面再回来（非 keep-alive 场景重挂载），表单状态丢失，图片/视频需重新选择，标题正文需重写。
2. **发布历史只存 title/error**（`history.addRecord` 不存正文与媒体引用），无法从历史恢复内容。
3. **用户手动点了「保存草稿」之后，系统若再做自动保存**，当前 `draftSave` 按 `draft.id` 去重——自动保存生成新 id，必然追加第二条内容相同的草稿，草稿箱出现重复条目。

需求（用户原话）：发布失败的图片/视频内容应自动保存到草稿箱以免丢失；用户随后再点「保存草稿箱」时不要重复保存——**同一份内容在草稿箱中只保留一份**。

## 2. 目标与非目标

### 目标

- G1：媒体内容（含 `video_path` 的视频任务、含非空 `images` 的图文任务）发布失败时，自动把完整内容快照写入草稿箱，按当前登录用户（owner_subject）隔离。
- G2：`draftSave` 按**内容指纹**幂等：同一份内容无论手动保存多少次、自动+手动混合保存多少次，草稿箱中只存在一条草稿（原地更新，不追加）。
- G3：自动保存成功后渲染层给出一次性提示，同一任务（同 taskId）不重复提示。
- G4：自动保存链路任何失败只记 warn，绝不影响发布失败主流程（历史落库、失败通知、风控挂起）。

### 非目标（明确不做）

- N1：纯文字内容发布失败**不**自动保存（表单仍在，内容丢失风险低；且纯文字草稿可随时手动保存）。范围严格按用户需求限定为图片/视频内容。
- N2：不自动从草稿恢复到表单（恢复始终由用户在草稿箱面板显式触发）。
- N3：不改变草稿存储结构（仍是 owner-scoped setting `drafts` JSON 数组，无数据库迁移）。
- N4：不新增 IPC 通道、不改 preload 暴露面（`draftSave`/`onProgress` 已存在）——preload bundle 零改动。

## 3. 方案总览（三道防线）

```
发布失败 (task:failed)
    │
    ├─ ① 主进程兜底层（新增 services/publish-failure-draft.js）
    │     媒体任务 → 构造草稿快照 → draftSave 语义（含指纹去重）写入
    │     任何失败 → logger.warn，主流程不受影响
    │
    ├─ ② 主进程幂等层（改 ipc-handlers/store.js draftSave）★ 去重单一真源
    │     内容指纹（sha256）命中既有草稿 → 原地更新（保留原 id），返回 reused:true
    │     未命中 → 追加新草稿，写入 _fp 指纹字段
    │     「手动保存」与「自动回存」共用此入口 ⇒ 天然不重复
    │
    └─ ③ 渲染层提示（新增 src/services/publish-failure-draft-saver.js）
          App 级订阅 publish:progress phase=failed → toast 提示（按 taskId 一次性）
```

设计要点：

- **去重判定只存在于主进程 `draftSave` 一处**。渲染层不做任何去重判断（渲染层只负责提示），避免第二份真相。
- 指纹是**内容身份**，不是草稿身份：`platforms/accounts/platformOverrides/publishTime` 等发布指向性元数据**不进**指纹——同一份内容改平台再保存仍视为同一份内容（更新原草稿），也使批量发布同内容到 N 个平台全部失败时只产生一条草稿。
- 自动保存构造的草稿复用与手动保存完全相同的存储通道（同一 IPC handler 逻辑），不另建第二条写入路径。

## 4. 数据校验

### 4.1 内容指纹（`services/draft-fingerprint.js`，新增）

- `computeDraftFingerprint(draft) -> string`（64 位 hex sha256）。
- 参与指纹的字段（白名单，缺省视为空）：
  `title, content, author, cover_url, cover_path, cover_file, video_path, images, image_files, tags, topics, mentions`
- **不参与**指纹的字段：`id, createdAt, updatedAt, _fp, publishTime, publishType, source, platforms, accounts, platformOverrides, owner_subject` 及其他任意未列出字段。
- 规范化规则：
  - 字符串字段：原样参与（不做 trim——首尾空格是用户内容的一部分；仅 `null/undefined` 归一为 `''`）。
  - 数组字段：**保持顺序**参与（图片/视频顺序即内容顺序）；`null/undefined` 归一为 `[]`；非数组归一为 `[]`。
  - 对象序列化：键递归排序后 `JSON.stringify`，保证键序无关。
- `draft` 非对象（null/undefined/原始值）→ 返回空内容指纹常量（确定性，不抛错）。

### 4.2 draftSave 幂等契约（改 `ipc-handlers/store.js`）

| 输入 | 校验/行为 | 响应 |
|---|---|---|
| `draft` 非对象 | 拒绝 | `{ code: REQUEST_ERROR, message: '草稿内容无效' }` |
| 内容指纹命中既有草稿 | **原地更新**该条（保留原 `id` 与 `createdAt`，刷新 `updatedAt` 与 `_fp`），不追加 | `{ code: 0, data: { draftId: <原id>, reused: true } }` |
| 未命中 | 追加（保留调用方 id；补 `createdAt/updatedAt/_fp`） | `{ code: 0, data: { draftId: <新id>, reused: false } }` |
| 既有草稿无 `_fp`（历史数据） | 匹配时**现算**其指纹参与比对；更新时回填 `_fp` | 同上 |
| owner 隔离 | 与现状一致：Logto 模式按 `owner_subject` scoped setting；无 identityService 走 legacy；identityService 存在但 sub 缺失 → `AUTH_ERROR` | 不变 |

向后兼容：旧调用方只判 `result.code`，`data` 从 `true` 变为对象属加法变更（`usePublishDrafts` 不读 `data` 值）。

### 4.3 自动回存资格判定（`services/publish-failure-draft.js`，新增）

`saveFailureDraft(task)` 逐条门禁（任一不满足 → 跳过并 `log.info` 说明原因）：

1. `task.article` 为对象。
2. **媒体门槛**：`article.video_path`（字符串非空）或 `article.images`（非空数组）——即「图片/视频内容」。
3. **内容门槛**：`title` 或 `content` 至少一个非空（与手动保存的空校验对齐；纯媒体无文字也允许——媒体路径本身就是内容）。
4. **身份门槛**：identityService 存在（Logto 模式）时 `task.owner_subject` 必须为非空字符串，否则 fail-closed 跳过（绝不写到 legacy 全局命名空间）；无 identityService（legacy 模式）直接放行。
5. **取消的任务不回存**：仅处理 `task:failed`（取消终态走 `task:cancelled`，本模块不被调用）。

写入内容（草稿快照字段）：

```
id:            'draft_' + Date.now()          // 由 draftSave 幂等层决定最终 id
title/content/author/cover_url/cover_path/cover_file/
video_path/images/image_files/tags/topics/mentions:   // 逐字段透传自 task.article（缺失为空）
publishTime:   ''                              // 失败回存不带定时（定时由用户恢复后自行设置）
platforms:     [task.platform]
accounts:      task.article.accountId ? { [task.platform]: task.article.accountId } : {}
platformOverrides: {}
source:        'auto_failure'                  // 溯源标记（不进指纹）
```

写入失败（store 异常/返回非 0）→ `log.warn`，不抛出、不重试。

## 5. 流程

### 5.1 发布失败自动保存（主进程）

```
task:failed (taskQueue 事件，失败终态单一来源)
  → phase4-events 既有动作（进度事件/落历史/风控挂起）——不变
  → failureDraftSaver.saveFailureDraft(task)          ← 新增，try/catch 包裹
      ├─ 资格判定（§4.3）
      ├─ 构造快照 → 复用 draftSave 写入语义（含指纹幂等）
      │    ├─ 指纹未命中 → 新增草稿
      │    └─ 指纹命中（例如用户失败前已手动存过草稿）→ 原地更新，草稿箱仍是一条
      └─ 任何异常 → log.warn('FailureDraftSaver', ...)
```

### 5.2 用户手动保存（渲染层，不变 + 幂等收益）

```
点击「保存草稿」 → usePublishDrafts.saveDraft() → draftSave(buildDraftSnapshot())
  → 主进程指纹比对
      ├─ 此前自动保存过同内容 → reused:true（原地更新，不产生第二条）
      └─ 无同内容草稿 → 新增
```

### 5.3 失败提示（渲染层）

```
App 启动 → createFailureDraftSaver({ onProgress, notify }).start()
publish:progress { phase:'failed', taskId }
  → 该 taskId 未提示过 → notify.info('publish.failureDraftSaved')
  → 已提示过（重试后再失败等）→ 静默
stop() → 取消订阅
```

注：订阅位于 `main.js` App 级服务（与 risk-hold-notifier 同位先例），非页面级 composable 订阅，不违反「发布进度状态唯一承载是 stores/publishProgress.js（页面级订阅禁令）」契约——本服务不承载进度状态，仅消费失败边界做一次性通知。

## 6. 交互逻辑与显示项

| 场景 | 表现 |
|---|---|
| 媒体内容发布失败 | toast（info）「发布失败：内容已自动保存到草稿箱，可在草稿箱恢复后重试」；同一 taskId 只提示一次 |
| 非媒体（纯文字）发布失败 | 无自动保存提示（现状失败通知不变） |
| 用户失败后手动点「保存草稿」 | 命中指纹 → 正常「草稿已保存」toast；草稿箱中不出现第二条 |
| 用户从草稿箱恢复 | 现有 applyDraft 流程不变（title/content/媒体路径/平台/账号全量恢复） |
| 草稿箱列表 | 无新增显示列；`source: 'auto_failure'` 仅作为数据溯源字段存储，本版不展示（预留 P2：自动草稿角标） |

## 7. 提示文字（i18n，zh/en 成对）

| key | zh | en |
|---|---|---|
| `publish.failureDraftSaved` | `发布失败：内容已自动保存到草稿箱，可在草稿箱中恢复后重试` | `Publish failed: content was saved to drafts automatically. Restore it from Drafts and retry.` |

新增用户可见文案仅此一条，进 `src/locales/zh.js` + `en.js`（成对，过 check-locale-sync）。

## 8. 测试映射（TDD）

| # | 场景 | 测试文件 |
|---|---|---|
| T1 | 指纹：键序无关/排除易变字段/数组有序/媒体路径变化敏感/空对象确定 | `electron/services/draft-fingerprint.test.js` |
| T2 | draftSave：同内容二次保存复用（1 条，reused:true，保留原 id/createdAt） | `ipc-handlers/store.test.js` |
| T3 | draftSave：publishTime/platforms 差异不影响复用；内容差异产生第二条 | 同上 |
| T4 | draftSave：历史无 `_fp` 草稿现算比对 + legacy 作用域同行为 | 同上 |
| T5 | 自动回存：视频/图文任务命中、纯文字跳过、空 article 跳过、Logto 无 subject 跳过、写入异常不冒泡、同内容两次失败只一条 | `electron/services/publish-failure-draft.test.js` |
| T6 | task:failed 接线：saver 被调用一次；saver 缺省/抛错不炸 | `bootstrap/phase4-events.test.js` |
| T7 | 渲染提示：failed+新 taskId 提示一次；同 taskId 二次静默；其他 phase 忽略；stop 解绑 | `src/services/publish-failure-draft-saver.test.js` |

## 9. 验收标准

- [ ] T1–T7 全绿；`usePublishDrafts.test.js`、`Publish.test.js`、`store-owner-isolation.test.js`、`phase4-events.test.js`、`publish-progress-events.test.js` 相关既有面零回归
- [ ] eslint 0 error；check-locale-sync PASS
- [ ] 文档同步：本 PRD + CHANGELOG 前插 + AGENTS.md QM-2 新增「草稿内容指纹幂等契约」条目
- [ ] CI 全绿，PR squash 自动合并

## 10. 边界与降级

- 存储仍为 JSON 数组全量重写：指纹计算 O(n)（n=草稿条数，个人草稿量级小），无性能风险。
- 自动保存不弹确认框（失败场景不打断用户）；手动保存的定时×草稿互斥确认流程不受影响（自动保存不携带 publishTime）。
- 主进程自动保存与渲染层无往返依赖：渲染层不感知保存结果（toast 文案按「已保存」陈述，与主进程实际写入结果可能存在极端不一致——例如磁盘满；此时 warn 日志可查，用户手动保存仍可兜底，可接受）。
