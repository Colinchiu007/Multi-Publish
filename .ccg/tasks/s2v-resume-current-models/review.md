# 质量节拍审查报告

## 结论

- 变更类型：Story2Video 历史断点恢复行为合同与实现
- 规模：大型，跨 PipelineEngine、Story2Video stages、测试、PRD、架构、OpenSpec 与记忆
- 风险：中等，涉及模型路由、媒体资产复用、TTS 音色兼容和远程视频任务边界
- Critical：0
- Major：0（初审提出的 current LLM 证据缺口已补充回归测试；其余意见属于现有远程任务合同或建议性扩展）
- Minor：0 个阻塞项

## 审查来源

外部双模型审查按项目要求尝试执行，但当前环境不可用：

1. Antigravity：账户/地域资格限制，无法启动审查。
2. Claude wrapper：本机代理/API 连接失败，进程以非零状态退出。

随后使用三个独立本地只读审查探针交叉检查运行时代码、文档交付和回归测试，并在发现问题后由主代理修正、复跑测试：

- 资产路径必须是真实存在且位于受控媒体根目录；已补 `normalizeResumeEntry()` 校验和失效路径再生成测试。
- 图片、音频、视频按资产独立复用；已补部分资产测试，并更新旧断点测试夹具。
- 断点保存按资产分别记录，不再要求完整场景三类资源同时存在。
- 视频成功结果必须有非空路径；旧视频路径经过统一可读媒体校验。
- current LLM / current video 的直接回归已补：恢复标记下旧 `video_plan.provider/model` 不被使用，AI 场景判断记录当前默认 LLM。
- 复用音色保留原 `voiceId`；兼容性和 re-clone 继续由既有 TTS 合同测试覆盖，不静默换音色。

## 验证证据

- 聚焦测试：3 个文件，175 个测试通过。
- 语法检查：`pipeline-engine.js`、`story2video-stages.js` 通过 `node --check`。
- `git diff --check`：通过。
- 文档冲突：已解决并 `git ls-files -u` 无输出。

## 残余风险

- 远程视频 `taskId` 目前仍未持久化，进程中断后的远程任务不能安全查询；恢复不会伪造完成，未来需单独设计任务持久化与原始绑定查询。
- 视频状态轮询沿用既有“显式失败立即结束、无 URL 继续轮询至超时”的合同；本次不扩大远程 provider 状态枚举。
- 当前 LLM 的 PromptBridge 路径在每次请求边界读取模型管理器默认配置，未新增外部 `useCurrentModels` 字段，避免污染 Python 服务协议。
- 尚需完成 Electron 依赖检查、Vue 构建、QM-1 打包/ASAR/启动检查、远端 PR 合并及归档闭环。
