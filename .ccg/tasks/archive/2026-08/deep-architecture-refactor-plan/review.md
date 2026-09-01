# 双模型架构方案审查记录

> 基线：`origin/main@2e1b84fcf42245842ae09554a054a8d5f4b66b07`
>
> 审查对象：正式报告、CCG requirements/plan、OpenSpec proposal/design/tasks
>
> 审查性质：planning-only；不审查任何产品代码 diff，因为本任务没有运行时代码变更

## 1. 有效 reviewer 运行

| Backend | Reviewer session | 状态 | 结论 | Critical |
|---|---|---|---|---:|
| opencode | `ses_fa9cb6b42ffe5p4oWZ2nkPlaqX` | 完成；以原生 `--file` 附件审查 7 个规划工件 | `APPROVE_WITH_CHANGES` | 0 |
| Claude | `b661aa0a-b683-4a49-8a2d-bcf266e784e8` | 完成；输出完整分级审查 | `APPROVE_WITH_CHANGES` | 0 |

Claude wrapper 同时输出 `claude-code:unrecognized_model` 子代理模型识别警告。该警告没有中断主 Claude reviewer，也不改变其审查结论；工具链告警与“审查是否完成”在本记录中分别陈述。

## 2. opencode 降级与重试记录

1. `ses_fa9dfb439ffeGLIUkytvt15jNl` 首次只追问审查对象；resume 后运行超过 10 分钟，按子代理异常纪律停止。
2. `ses_fa9d40bbdffeG0EUAPgmAZWHLs` 首次同样追问；resume 设 300 秒后超时，日志显示它把范围扩大为全仓 glob，未作为有效审查。
3. 尝试把 7 个文件全文内联给 wrapper 时，Windows 启动失败：`The filename or extension is too long`。这是命令长度问题，不是 reviewer 对方案的结论。
4. 最终改用 opencode 原生 `--file` 附件固定 7 个工件，避免自动遍历与命令长度问题，取得上述有效 session。

## 3. 双方共识

- 报告没有 Critical，方向上同意增量式、契约先行、结构变更与行为变更分离。
- 固定代码基线和证据等级是必要约束，但所有规划工件都应重复声明“不是实施授权”。
- IPC inventory/sender 修复应在 0-30 天完成；完整 manifest 单轨应放在 31-60 天，避免第一波范围膨胀。
- CI 不能只列 job 名，还应给出责任域、分片、目标时间、flake 处理和禁止静默 skip 的规则。
- Windows 可见窗口/IPC 门禁、sidecar supervisor facade 应作为独立 OpenSpec change。
- Story2Video 两个分句文件需要明确区分“编排/标准化层”和“算法镜像层”。
- Wave 0 的安全修复必须先写 401/403、CORS、sender 和 secret transport 负例并接入 CI。

## 4. Warning/Info 与处理结果

| 级别 | 发现 | 处理 |
|---|---|---|
| Warning | `tasks.md`、`plan.md` 未重复固定基线和非实施授权 | 已补齐固定 SHA 与 planning-only 边界 |
| Warning | 报告未明确区分 analyzer/architect 与 reviewer 两轮 | 已将第 14 章拆分，并记录两个有效 reviewer session |
| Warning | 静态规模分项比总数少 217 文件/44,016 行 | 已补残差行：Desktop 其他 128/25,530、Remotion TSX 29/8,526、仓库工具/部署 60/9,960 |
| Warning | IPC 统一计划在 0-30 天过宽 | 已拆为 Wave 0 sender guard + inventory、Wave 1 完整 manifest 单轨 |
| Warning | CI 矩阵缺少时间、责任域、flake 和 skip 策略 | 已扩展矩阵并明确测试为 0、缺依赖、无显示器不得成功 skip |
| Warning | 缺独立 Windows 可见窗口/IPC gate 与 sidecar facade change | 已加入 OpenSpec 拆分清单 |
| Warning | Wave 0 没有明确测试先行 | 已要求先把失败负例接入 CI，再修改实现 |
| Info | 关键引用范围过窄 | 已修正为 `ipc-security.js:29-82`、`electron-bridge.js:8-54`、`main.js:64-117` |
| Info | `proposal.md` 未给正式报告路径及未来波次证据边界 | 已补报告路径及测试/打包/UI或服务/远端 CI 独立证据要求 |

## 5. 审查后源码纠错

Reviewer 之后又针对争议点做了当前基线复核，纠正了早期探索的两项误报：

- `@multi-publish/shared-utils` 是 Desktop main/renderer 的活跃强依赖：`core/container.setup.js:61-67`、`bootstrap/phase1-context.js:355-357`、`services/publisher-router.js:16-17`、`src/views/PublishHistory.vue:304`、`Accounts.vue:278` 等均真实消费。
- `@multi-publish/rpa-engine` 由 `services/rpa-view-platforms.js:21` 真实消费 `platformSelectors`；只是职责已经收窄，`browserData` 暂无外部消费者。
- `@multi-publish/ai-writer-api` 才是仓库应用依赖图中无消费者的独立 HTTP/CLI 服务候选；是否退役仍需核对外部部署和产品责任。

因此未采纳“删除 rpa-engine/shared-utils 孤立包”的建议，报告已改为公共出口、deep import、命名和未消费导出治理。

## 6. 分歧与未采纳项

- 未把 OpsCenter `PO_SECRET_KEY` 写成拼写错误：源码和文档表明它是历史共享设计；仓库内只能确认 systemd unit 缺 `EnvironmentFile`，远端变量是否注入仍是 E6 未决项。
- 未把 CORS 直接描述成账号接管：当前 Starlette 1.0.1 最小 ASGI 合同确认任意 Origin 被反射、credentials 和 Authorization 预检获准，这证明跨域信任边界过宽；具体利用仍取决于凭据获取和下游数据。
- 未把 electron-updater 描述成“无完整性校验”：HTTPS 与 `latest.yml` SHA-512 仍提供传输/内容完整性，真实缺口是 Authenticode/发布者身份锚。
- 未将本规划变成一个实施 change，也未运行与文档无关的产品全量测试、Electron 打包、真实 provider 或 ECS 验证。

## 7. 验证与基线例外

- `openspec validate deep-architecture-refactor-plan --type change --strict --no-interactive`：归档前通过。
- `openspec archive deep-architecture-refactor-plan --yes --skip-specs --json`：通过，归档为 `2026-08-31-deep-architecture-refactor-plan`，未同步 delta specs（本 change 为 `skip_specs:true`）。
- Markdown 本地链接、任务 JSON、报告必备标记、关键 `file:line`、敏感信息模式与 `git diff --cached --check`：通过。
- 将本任务的 CCG archive 与 OpenSpec archive 复制到隔离根后运行 `scripts/openspec-sync-check.js --root <isolated-root>`：`OK: 1 tasks, 0 active changes, 1 archives`。
- 全仓直接运行同一同步检查仍被固定基线中的历史工件阻断：5 个 task JSON/association 错误和 7 个 active/archive 关联违规。它们均不在本任务命名路径中，本次没有越权修复；因此“本任务三同步通过”与“全仓历史同步债仍存在”必须分开陈述。
- 本任务只新增规划文档，没有运行产品全量测试、Electron 打包/可见窗口、真实 provider、ECS 或远端分支保护验证；这些证据不适用于本次文档变更，也不得被本报告的静态结论替代。

## 8. 最终审查结论

两个有效 reviewer 均为 `APPROVE_WITH_CHANGES`、Critical 为 0。上述 Warning/Info 已在正式报告及规划工件中处理；源码纠错也已合入。最终状态：**APPROVE — 规划工件可交付，后续每个实施项仍须独立获批、独立建 OpenSpec、独立验证。**
