# 审查记录：通知/错误文案统一标准 + 日志关联 方案评审

日期：2026-08-29
任务：`notify-log-standard-review`
评审对象：`01-docs/ARCH-notify-log-standard.md`

## 审查方式

按 CCG 双模型交叉审查方法论，派发两个独立只读评审代理（架构视角 + 安全/可观测性视角），各自核验真实代码后交叉汇总。

核验代码：`user-facing-error.js`、`pipeline-error-formatter.js`、`story2video-notifications.js`、`logger.js`、`ipc-handlers/misc.js`、`ipc-handlers/logs.js`、`preload/system.js`、`bootstrap/phase3-services.js`、`useBatchPublish.js`。

## 总体结论

方案方向正确、结构清晰（五层分层、契约层、`notify:log` IPC、4 阶段迁移、决策记录到位），对既有成熟模块的"零侵入"承诺与 `show-notification` 死通道判定均与代码事实吻合。

**但存在 3 个 CRITICAL（两份评审交叉印证 2 个 + 各 1 个）与多个 MAJOR，必须修复后才能进入实现。** 建议先修订文档，再经 openspec 建 change。

## 分级发现（交叉去重后）

### 🔴 CRITICAL

#### C1. G1/A4 核心前提误判：三模块正则并非"字面重复"而是"语义重叠"，"重复正则归零"验收不可达（架构评审）
- 逐条比对 `pipeline-error-formatter.js` 与 `story2video-notifications.js`：`quota_exceeded`/`rate_limited` 等正则**字面量不同、覆盖范围不同**，且各带 `extract()` 提取逻辑。不存在可 grep 去重的"字面重复"，只有"语义重叠"。
- 若真合并（单一正则）→ 行为必然改变；若只搬进共享表 → 无去重收益。A4"grep 去重归零"**客观无法满足**，Phase 0 验收必然失败。
- **修复**：重定义 A4 为"语义重叠模式收敛为单一规则 + 逐模式行为回归断言"，去掉"归零/grep 去重"表述；明确共享表是"每类错误一条规范正则（真收敛，接受行为变更并回归）"还是"各模块规则注册表（仅去漂移，不承诺归零）"——二选一写清。

#### C2. `notify:log` 主进程侧无 params 白名单复验/换行消毒/sender 校验，"双重防线"名不副实（架构评审 + 安全评审交叉印证）
- params 白名单只在 renderer 侧，主进程 handler 只做"已知 messageKey 校验 + redactText"，未对 params 做 schema 复验、未做换行消毒、未做 sender 校验。
- `logger.log()` 的 message 段**不转义换行**（仅 JSON meta 经 stringify 转义），params 若拼进 message 段可注入新行 → **log injection**。
- 攻击面：日志伪造（伪造 messageKey/level/module）、日志注入（换行）、日志洪泛（无速率限制）。
- **修复**：主进程 handler 内 ① 对 messageKey 服务端白名单 + 对 params 按该 key schema 复验（只落白名单字段）；② 所有落盘字段统一经 `JSON.stringify` 进 meta 段，禁止拼进 message 字符串；③ 按 QM-2 对 sender 做 file URL canonical 校验；④ level ∈ {info,warn,error} 白名单；⑤ 速率限制；⑥ 补换行注入/伪造行回归测试。

#### C3. params 白名单嵌套绕过 + 主进程侧无独立 deny-list 兜底（安全评审）
- 白名单只做"字段名"过滤，不做"值"校验。`context`/`detail`/`provider` 等自由文本字段值若含 secret 会被原样落盘。
- 模板插值注入：params 值含 `{xxx}` 或原始错误文本可能带进用户文案。
- **修复**：白名单双层化——renderer 字段名白名单 + 主进程值级 deny-list（对每个 params 值再跑 redactText + 高熵 token/IP 正则 + 长度截断）；params 值类型约束（只接受 string/number/boolean，拒绝嵌套 object/array 直落）；用户文案插值前对 params 值跑 `TECHNICAL_TEXT_PATTERNS` 检测，命中回退兜底。

### 🟠 MAJOR（合并去重后）

- **M1**（架构）：`messageKey` 唯一关联键名不副实——同一错误（如 quota_exceeded）在 `userErrors.QUOTA_EXCEEDED` 与 `story2video.quota_exceeded` 各有一个 key，无法用单一 key 跨模块检索。→ 引入独立于文案 key 的稳定 `errorCategory`，日志行同时记录两者。
- **M2**（架构+安全交叉）：keyword-spike 主进程推送的日志闭环依赖 renderer 存活 + renderer 未就绪时序。→ 主进程在源头直接写结构化日志，renderer 只做 UI 渲染且对主进程推送不重复上报；补 ready 握手/缓冲。
- **M3**（架构）：renderer 崩溃/未捕获异常（window.onerror/unhandledrejection/Vue errorHandler）无日志通道。→ Phase 1 增加 renderer 全局错误钩子 → notify:log。
- **M4**（安全）：`logger.redactText` 的 SECRET_PATTERNS 覆盖不全（裸 API Key、IP:端口、自定义凭据片段）。→ 落盘前追加 `TECHNICAL_TEXT_PATTERNS` 检测或新增高熵 token/IP 正则。
- **M5**（架构）：试点 `useBatchPublish` 硬编码清零不完整——除 ElMessage 外还有约 8 处 `batchProgress.push({text:'✅...'})` 硬编码中文（非 ElMessage，notify() 不覆盖）；且传递依赖 useLoginGate。→ 界定非 toast 文案范围，修正试点验收口径。
- **M6**（架构）：非 toast 用户可见文案（进度列表/内联状态）未纳入方案范围。→ 显式界定"通知"与"非通知用户可见文案"两类处理路径。
- **M7**（架构）：G4"用户↔日志互查"实际单向，缺 text→key 反向机制。→ 错误详情暴露 messageKey / 生成 key↔text 对照表。
- **M8**（安全）：`notify:log` 无 sender/level/rate 校验（与 C2 部分重叠，已并入 C2）。
- **M9**（安全）：`success`/`confirm` 级别无对应 logger 级别，批量场景日志洪泛。→ 明确级别映射表（success→INFO、confirm→可选不记），高频成功类通知节流/聚合。

### 🟢 MINOR（合并去重后）

- m1：`logger.js` 现无 `notify()` 方法，需明确新增方法还是复用 `log()` 三参形态。
- m2：日志行格式 `module` 在前缀与 meta 重复，需统一。
- m3：Phase 0 标注"低风险"不准确（改动两个成熟模块），应标"中风险、需逐模式回归"。
- m4：D2 新增 key `monitor.keywordSpike` 需 zh/en 成对文案，现有 keyword-spike title 是硬编码英文，迁移时需一并替换并过 CI Gate 7。
- m5：D1 将非组件薄封装推迟实现阶段，建议契约层先定义纯函数核心，composable 仅作薄封装。
- m6：多窗口场景未覆盖（cover-cropper/playwright-manager 等独立 BrowserWindow），主窗口最小化时 ElMessage 不可见，需兜底策略。
- m7：`notify()` 的 error 字段需长度上限（复用 safeMeta 8000 截断）。
- m8：keyword-spike 无窗口时降级策略未定义（可走系统 Notification）。

## Completeness 评分

- 架构评审：**7 / 10**
- 安全评审：**未达标（存在必须修复项）**

## 必须修复才能进入实现

1. **C1** — 重定义 A4 验收与共享规则表语义（真收敛 vs 注册表）。
2. **C2** — `notify:log` 主进程侧补 params 白名单复验 + 换行消毒 + sender 校验 + 速率限制。
3. **C3** — params 白名单双层化（值级 deny-list）+ 用户文案插值前技术文本检测。
4. **M2** — keyword-spike 日志归属（主进程源头记日志，renderer 不重复上报）+ renderer ready 时序。
5. **M3** — renderer 全局错误钩子 → 日志通道。
6. **M5/M6** — 界定非 toast 用户可见文案范围，修正试点验收口径。

修复以上后，方案可进入实现（建议先修订文档，再经 openspec 建 change，运行时改动在隔离 worktree 进行）。