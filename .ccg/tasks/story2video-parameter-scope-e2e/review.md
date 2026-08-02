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
