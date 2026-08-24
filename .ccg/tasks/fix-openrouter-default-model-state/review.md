# 修复审查：OpenRouter 默认模型状态

状态：本地交付门禁通过；外部双模型审查因后端无最终回执降级，待 PR/CI 远程验证。

## QM-5 Bug 反思

### 1. 第一性原因

`git blame` 与 `git show` 确认问题由 `9d7fa58fc21ef8e52333e71700250f7965f16bb1`（2026-08-18，`feat: 多模态模型按能力设置默认，移除全局偏好开关`）引入。

该提交在 `_clearCapabilityDefaultForCapability()` 中只从多模态行的 `config.capability_defaults` 删除被覆盖能力，却没有同步清除遗留的多模态 `is_default=1`。而 `_multimodalProviderFor()` 仍把 `capability_defaults.includes(category) || row.is_default` 视为能力默认。因此 OpenRouter 的普通 LLM 行虽然写入成功、Toast 也成功，但文字推理仍优先路由到 MiniMax 多模态行，卡片状态与真实路由不一致。

### 2. 测试逃逸链

| 层级 | 为什么没有拦住 |
| --- | --- |
| 单元测试 | 既有 `model-provider-multimodal.test.js` 覆盖显式 `capability_defaults` 和正常回退，未构造“历史全局 `is_default=1` + 普通 LLM 覆盖”的顺序。 |
| 集成/IPC | IPC 侧主要验证调用结果码，未同时断言 `getDefault('llm')`、持久化行和列表返回状态。 |
| E2E/视觉 | 设置页没有实际执行该历史状态组合，Toast 成功被错误当作状态已同步的证据。 |
| 代码审查 | 首次能力改造只检查了显式能力列表互斥，没有把 `is_default` 作为第二个默认事实来源逐项比对。 |

### 3. 系统性漏洞

类型：测试场景缺失 + 审查盲区。

具体缺口是 `apps/desktop/electron/services/model-provider-multimodal.test.js` 未覆盖“全局默认兼容路径被类别默认覆盖”的状态转换；`apps/desktop/src/composables/useModelProviderCrud.test.js` 虽有成功刷新逻辑，但没有断言刷新后的卡片数据发生了默认标记切换。测试只验证单一来源，未验证路由、数据库状态和 UI 列表三者一致。

### 4. 修复与回归保护

- `model-provider-manager.js`：当普通 provider 覆盖一个具有遗留全局默认标记的多模态 provider 时，将其余已声明能力转成显式 `capability_defaults`，删除被覆盖能力，并清除多模态 `is_default`。
- `model-provider-multimodal.test.js`：用真实内存 SQL store 覆盖 MiniMax 全局默认后设置 OpenRouter 为 LLM 默认；断言文字推理路由、两个卡片的持久化标记，以及 TTS/图片默认均正确。
- `useModelProviderCrud.test.js`：覆盖成功 IPC 后调用 `loadProviders()` 并把重新加载的 `is_default` 映射到 OpenRouter 与 MiniMax 卡片数据。

### 5. 预防措施

- 在 `.ccg/spec/guides/index.md` 固化“全局默认拆分为能力默认”的状态归一化规则。
- 将上述两项回归纳入桌面 Vitest 套件；后续默认状态改动必须同时验证运行时路由、持久化行和 renderer 重载数据。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `node scripts/ensure-electron.js` | PASS |
| `node scripts/verify-worktree-deps.js` | PASS（9 个消费方解析正确） |
| 相关 Vitest 6 文件 | PASS（128 tests） |
| `node --check` + 变更文件 ESLint | PASS |
| `git diff --check` | PASS |
| `pnpm --dir apps/desktop run build:vue` | PASS；仅既有 dynamic import / 大 chunk 警告 |
| `openspec validate fix-openrouter-default-model-state --strict` | PASS |
| `electron-builder --win --x64 --dir --publish never` | PASS |
| ASAR / require 语法 | PASS；ASAR 含 `electron/services/model-provider-manager.js`，抽取后 `node --check` 通过 |
| 打包启动冒烟 | PASS；8 秒存活、主窗口已创建、stderr 0 字节 |

Prettier 例外：三份变更文件与 `origin/main` 对应版本均返回非零检查结果，属于现有格式基线；未执行整文件格式化，避免扩大无关 diff。

构建副作用处置：Windows 打包验证临时改写了 `apps/desktop/package.json` 与 `pnpm-lock.yaml`（移除开发依赖，非本任务范围）。已在确认任务开始时两者均干净后，精确恢复至 `HEAD`；恢复后 `git diff --exit-code -- apps/desktop/package.json pnpm-lock.yaml` 通过，二者不纳入提交。

## 审查

本地逐行复审结论：无 Critical / Warning。状态转换保持原子执行；OpenRouter 的 `is_default` 由既有 `setDefault()` 写入，原多模态全局标记被清除，其余能力显式保留；renderer 继续以刷新后的持久化列表驱动 `.default-active`，无需 Toast 或 CSS 补丁。

外部双模型审查按 M 级任务要求并行尝试，但无可消费的最终报告：

- OpenCode：首次 wrapper 调用的手工构造提示载荷有损坏字节，已作废且未采纳任何结论。随后改为 Node 直接读取仓库 UTF-8 `requirements.md`/OpenSpec/diff 并以 `child.stdin.end(Buffer.from(prompt, 'utf8'))` 写入原生 `opencode.exe`；发送前校验 `hasReplacement=false`、内容包含“模型设置”，SHA-256 `64364fe660c2ecb29c0505a2181bd6b8e553a414ab5d1b1125f7255c7e56285b`。CLI 只返回 `step_start`，120 秒内没有最终审查消息，按超时降级。
- Claude：同样使用 UTF-8 Buffer（`hasReplacement=false`，SHA-256 `e1e75b377bae45691a4e45e0f08e980f8068a8a26a3eb2a8428cc4dc9fd5db19`）直连 `claude.exe`；120 秒无 stdout/stderr，按超时降级。

这次已修正 OpenCode 提示词传输：不再通过 PowerShell 管道发送中文，而是由 Node 从 UTF-8 文件读取并以 Buffer 写 stdin。外部模型不可用不影响代码验证，但 PR 创建后仍必须以 CI 结果为最终远程门禁。

## 远程同步

PR #1150 已于 2026-08-24 创建并推送，head 初始提交为 `4dca22c0f`；`remoteStatus=pr_open_checks_pending`。下一步：等待 required checks；合并后核对 `origin/main`，再执行 OpenSpec + CCG task + 质量门禁三同步归档。
