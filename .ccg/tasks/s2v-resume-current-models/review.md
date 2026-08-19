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

## CI 复核与补丁

首轮 PR CI（run `32270074499`）暴露了本次新增恢复夹具的 Windows runner 差异，已完成最小修复：

- `story2video-stages.test.js` 在测试导入时显式创建 `STORY2VIDEO_TEMP_DIR`，避免干净 runner 的 `mkdtemp` 因父目录不存在而失败。
- resume 资产断言比较 `fs.realpathSync.native()` 的 canonical 路径，避免 `C:\Users\RUNNER~1` 与 `C:\Users\runneradmin` 的 8.3 短路径差异造成误报。生产代码仍保持受控根目录、普通文件、扩展名、大小和符号链接边界校验。
- 本地补丁后定向回归：3 个文件、175 tests passed；`node --check` 与 `git diff --check` passed。
- 第二轮 CI 仍发现一个部分资产测试使用 raw Windows 路径断言；已将旧音频/图片输入与输出断言统一为 `fs.realpathSync.native()` canonical 路径。该用例单独运行通过，完整 3 文件聚焦集合仍为 175 tests passed；此补丁只改测试夹具，不放宽生产路径校验。

首轮 CI 的其他失败与本次运行时代码无关，已分离记录：

- `ResultView.test.js` 的 7 个既有素材槽位、AI 视频按钮和媒体 URL 断言失败；`build-preload.test.js` 的源码与已提交 bundle API 列表漂移。它们属于主线既有 UI/preload 基线，不修改本任务范围。
- Browser E2E 仅失败 `/` 首页 1 项和 `/create` 内置流水线卡片计数 1 项，`/create/pipeline` 通过；视觉测试仅失败 `/create` 与 `/create/pipeline`，两者同为 28.59% 基线漂移，其余 15/17 页面通过。
- Autonomous coverage audit 为 PRD 覆盖审计 `score: 0, items: 89`，不是 Story2Video 恢复执行失败。

## 残余风险

- 远程视频 `taskId` 目前仍未持久化，进程中断后的远程任务不能安全查询；恢复不会伪造完成，未来需单独设计任务持久化与原始绑定查询。
- 视频状态轮询沿用既有“显式失败立即结束、无 URL 继续轮询至超时”的合同；本次不扩大远程 provider 状态枚举。
- 当前 LLM 的 PromptBridge 路径在每次请求边界读取模型管理器默认配置，未新增外部 `useCurrentModels` 字段，避免污染 Python 服务协议。
- 远端 PR CI 需要在本次最终 Windows 测试补丁推送后重新运行；首轮 UI/preload/视觉/Autonomous 基线问题仍需项目级别另行治理，不在本次补丁范围。
