# Story2Video 参数边界与真实 E2E 审查

## 结论

- 产品变更：通过人工差异审查；未发现需要阻断提交的参数合同、IPC 序列化、敏感信息或范围漂移问题。
- 外部独立审查：未完成。2026-08-01 并行调用 antigravity 与 Claude：前者因 `agy command not found` 不可用，后者 wrapper 以 status 1 退出。原始日志保留在 `external-analysis/`，本记录不把它们表述为通过。
- 真实 Provider E2E：已真实启动隔离 Electron、选择 Story2Video、加载已启用的 MiniMax 图片/语音 provider 并提交编排。流程在调用模型前被 `pipeline:startOrchestrated` 的认证门禁拒绝；页面可见错误为“当前许可证无权访问 pipeline:startOrchestrated”。截图与脱敏 JSON 在 `e2e-evidence/`。页面顶栏显示“登录”，因此根因是该 profile 未认证，而不是 API Key 缺失。

## 人工检查

- 归一化器、Vue 请求体与 YAML 一致移除 `seconds`、`versions` 和平台映射；旧输入继续被安全忽略，优化器固定使用 `generic`。
- 已归档运行通过 `PipelineEngine.getRunSnapshot()` 回退 `_history`，且 IPC 将缺失运行明确返回 `NOT_FOUND`；renderer 对非零、空数据、异常和失败终态都停止轮询并展示错误。
- provider 下拉只接收 `model-provider:list` 返回的已启用项目，选项不携带 API Key。

## 验证

| 项目 | 结果 |
| --- | --- |
| Desktop 聚焦回归 | PASS，5 文件 / 148 tests |
| Story2Video 引擎 | PASS，2 文件 / 52 tests |
| Story2Video TypeScript 构建 | PASS |
| Vue 构建 | PASS（仅既有 Rollup chunk/PURE annotation 警告） |
| Preload sandbox | PASS，true/false |
| Electron Windows x64 打包 | PASS，输出至 E: 临时构建目录；原输出到 C: 的同一命令因磁盘空间不足失败 |
| ASAR / RPA require / bundled FFmpeg+ffprobe | PASS；生成并探测 1 秒 MP4 |
| 打包应用 8 秒启动 | 存活；stderr 仅软件渲染提示。stdout 另记录既有 Python runtime 缺失与端口占用降级，不能当作干净安装验证 |
| 真实 Provider MP4 | BLOCKED：profile 未登录，未调用外部模型，未生成 MP4 |

## 后续

用户在桌面应用登录到具有普通认证权限的账号后，重新执行同一最小文案流程即可继续验证真实 provider、六阶段状态和最终 MP4/ffprobe；不应通过修改代码绕过许可证/身份门禁。

---

## API Key 状态一致性复审（2026-08-01）

### 根因与逃逸链

- 历史不可解密的 `api_key_enc` 让 `_safeRow()` 对空字符串调用 `crypto.mask()`，产生 `****`；但测试调用读取到空 Key 后失败，造成列表、统计与调用入口矛盾。
- 单元测试覆盖了解密抛异常，却没有覆盖 `crypto.decrypt()` 正常返回空字符串；类别状态又只按数据库 blob 是否存在统计。
- UI 端因此把掩码作为已配置依据，视觉测试和预设测试没有穿过真实历史失效密文状态。

### 修复与验证

- `ModelProviderManager._getApiKey()` 成为唯一解密入口；安全行、含 Key 的内部读取和 `isConfigured()` 都复用其结果。
- 解密为空或失败时列表不显示掩码、类别统计不计入、真实测试入口继续给出可操作的“请重新填写 API Key”提示。
- 聚焦 Vitest：5 files / 84 tests PASS。
- `npm run build:ts` PASS；Windows x64 Electron Builder PASS；打包 EXE 隔离 profile 启动 10 秒存活、stderr 0 bytes、无 ASAR/配置路径错误。
- 真实开发窗口（隔离 worktree）验证：设置可点击；历史三项凭据显示已配置 0；全部预设 52；新增推理模型第二步提供 12 个预设（含 SenseNova）。

### 审查状态

- 外部 antigravity 与 Claude 审查均已并行尝试：前者缺少 `agy`，后者 wrapper status 1；原始失败输出保存在 `external-review/`，不计为审查通过。
- 独立本地审查正在针对隔离工作树的实际 diff 复核；第一次审查错误地落在主工作树，仅作为修复前根因佐证，不作为本次结论。

### 真实 Provider 验收前置

- 旧 profile 中三条密文当前不可解密，应用不再伪装为可用。需要用户在当前已打开的“模型服务商设置”中重新保存 SenseNova、MiniMax Image、MiniMax TTS 三个 Key；保存后才能不泄露密钥地执行真实模型测试和 Story2Video 最小视频流程。
### 复审闭环（本次补充）

- 独立本地复审先后指出空白 Key、不可解密默认回退与本地免 Key 默认选择三个缺口；均已修复并新增回归。
- 当前合同：可用凭据必须是可解密且非空白 Key；合法回环本地 provider 可按既有 `canUseWithoutApiKey()` 规则作为默认项，但不会被计入需要 API Key 的“已配置”统计。
- 最终聚焦回归：6 files / 88 tests PASS；TypeScript、ESLint、Windows x64 Electron Builder PASS。
- 外部 antigravity/Claude 审查工具仍不可用，未将其标记为通过。