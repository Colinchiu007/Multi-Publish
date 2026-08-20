# Review: video-history-card-detail

## Scope

本次审查覆盖 Story2Video 历史卡片、project/run 历史合并、更新时间、首场景缩略图 IPC、非运行任务编辑入口和 ResultView 缺失素材占位。

## Local findings and resolutions

- Project/run 旧数据可能只有 run id：已按 projectId、项目 runId、legacy id 建索引并在合并测试中覆盖，避免同一任务生成重复纯 run 卡片。
- 运行耗时与视频时长语义不同：卡片使用显式 videoDuration/成片时长字段，缺失时显示“未生成”，不把 duration 当视频时长。
- 首场景缩略图：图片优先；无合法图片时通过受控 FFmpeg 生成视频第 0 秒首帧，路径、大小、符号链接和输出格式校验，失败 fail-soft。
- 缩略图并发请求：项目服务按 projectId 合并进行中的首帧请求，renderer 以请求快照守卫避免旧列表写回新列表。
- 取消任务详情：有有效项目且已启动流水线的 cancelled 任务可以进入编辑页，但不显示/执行断点继续；running 仍保留流水线控制流。

## Review status

- 内部只读审查：无 Critical；发现并修复 project/run ID 匹配风险。
- 外部 Antigravity：因区域/账户资格不可用，未返回可用报告。
- 外部 Claude wrapper：超时/代理连接失败，未返回可用报告。以上限制如实记录，未将内部审查冒充双模型外部审查。

## Independent review follow-up

- 两路只读审查均确认 0 Critical；主要关注点是媒体预览失败后槽位仍可选、缺少旁白时下载动作仍可点击，以及历史卡片运行中详情边界。
- 已修复媒体预览失败处理：renderer 使用按 `segmentId:kind` 的临时不可用标记，让失效槽位显示“未生成”并禁用选择，同时保留来源路径供重新生成/后续刷新恢复；新增 ResultView 回归测试。
- 已修复无旁白交互：`audioPath` 为空时“下载旁白”按钮禁用，保留固定占位；新增回归测试。
- 运行中任务不进入编辑详情是本次规格明确的产品边界，继续保留流水线暂停/继续/取消控制入口；详情页视频预览不承担历史列表的首帧生成合同。
- 缩略图缓存重复 helper 已合并，未使用的 metadata helper 已删除。

## Residual risks

1. 结果页现有 AI 视频重新生成路径仍主要写入 primary video slot；video2 的生成槽位能力属于既有范围外残余风险，本次未扩大功能范围。
2. 缩略图服务、Electron IPC 和完整 ResultView 交互仍需要真实 Electron 窗口手动验收；Vitest 无法替代打包应用中的 sender/file URL 行为验证。
3. 单个历史卡片的缩略图首帧生成可能受本机 FFmpeg/媒体编码器可用性影响；失败时按合同 fail-soft 为“未生成”。

## Verification record

已通过的定向回归：

7 files passed, 871 tests passed

补充通过：ResultView 单文件 96 tests；OpenSpec strict validate；locale pair check；CJK scan（基线 1489，无新增硬编码）；变更文件 ESLint（0 errors，2 个既有 warning）；Node syntax check；`git diff --check`；worktree dependency resolution。`build:vue` 已通过。`check:ts` 仍被仓库既有的 Electron/服务类型声明漂移阻断，相关输出未显示本次 ResultView/历史组件新增错误；packaged smoke 在最终交付阶段继续记录。
