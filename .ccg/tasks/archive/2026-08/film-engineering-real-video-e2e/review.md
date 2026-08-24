# Review

## 本地审查结论

- **Critical**：无。
- **Warning**：全量 ESLint 仍有 `story2video-stages.js` 的存量告警（duplicate key、no-useless-assignment、empty block、unused），不属于本次变更引入。
- **Info**：图片片段编码超时现在按 `effectDuration × fps × workScale²` 估算，单次预算范围为 60 秒至 10 分钟；2x/1.5x/1x 降档重试分别获得与工作倍率匹配的预算。

## 定向验证

- `story2video-compose-engine.test.js`、`tts-voice-clone-service.test.js`、`story2video-stages.test.js`：**327 tests passed**。
- `node --check`：Story2Video compose、TTS clone service 通过。
- `node scripts/verify-worktree-deps.js`：9 项 workspace 解析通过。
- OpenSpec strict validate：通过。
- Vue/Vite production build：通过。
- Electron Builder `--win --dir --publish never`：通过。
- 打包版启动 8 秒：进程保持存活，stderr 无 ASAR/config/plugin 崩溃。

## QM-5 根因与防回归

- **第一性原因**：`feffc5daee`（2026-08-09）把片段 timeout 从固定 30 秒改为时长/帧率估算并加入降档重试，但未将 `zoompan` 的 `workScale` 中间画布成本纳入预算。真实 2x 图片片段在低速机器上仍会在输出持续增长时超时。
- **逃逸链**：既有单测覆盖了 30 秒下限、长时长和 2x->1x 重试顺序，却没有用 6 秒真实 TTS + 2x 中间画布验证预算；此前 E2E 重点覆盖 AI 视频成片，未覆盖纯图片轮播的慢速合成。代码审查延续了“时长/帧率足够描述成本”的假设。
- **系统性漏洞**：性能预算测试场景缺少工作分辨率这一维度。
- **修复与回归保护**：timeout 变为 `duration * fps * workScale^2`，范围 60 秒到 10 分钟；新增 2x/1.5x/1x 预算断言，并用真实 JPEG/TTS 素材直接合成验证当前 ffmpeg 路径。
- **预防措施**：未来修改 zoompan 工作倍率、输出分辨率或片段 timeout 时，必须同时覆盖各档 workScale 预算，并至少执行一次真实媒体素材合成。

## 真实环境 E2E 证据

### 电影工程

证据：`C:/tmp/film-engineering-real-20260823/film-engineering-real-e2e.json`、`C:/tmp/film-engineering-real-20260823/film-engineering-final.png`。

真实 Electron/IPC/provider 流程已覆盖：加载 `Hell Grind`（162 场景、153 分镜、332 资产引用）、分镜详情、单条/批量提示词复制、JSON/Markdown 导出、剧本套用并生成本地分镜、提示词方法论、真实图片生成入口。未复现“提交的数据不符合要求”。

### Story2Video

已真实生成并用 ffprobe 验证：

- `C:/tmp/s2v-real-20260823/real-minimal-no-video.mp4`：H.264 1920x1080、AAC、3.104s、931,717 bytes。
- `C:/tmp/s2v-real-20260823/real-safe-video.mp4`：H.264 1920x1088、AAC、4.033s、1,771,825 bytes。
- `C:/tmp/s2v-real-20260823/real-carousel-fixed.mp4`：真实 AI 视频，H.264 1920x1088、AAC、4.033s、5,893,762 bytes；报告 `real-carousel-fixed-report.json`。
- `C:/tmp/s2v-real-20260823/real-carousel-timeout-fixed-direct.mp4`：复用真实 JPEG/TTS 素材直接驱动当前合成引擎，2x `zoompan` 成功，H.264 1920x1080、AAC、6.264s、1,516,241 bytes。

本轮新修复的图片轮播超时回归已由 327 个定向测试覆盖。尝试用复制的 profile 重跑 UI 时，Chromium 加密 session 无法跨 user-data-dir 复用，页面显示“需要登录”；没有把这个环境限制误记成业务失败。

## 外部审查降级

按 CCG 要求并行启动 opencode reviewer 与 Claude reviewer；两个 wrapper 均在本机无输出并超时，已中止。降级为主代理本地审查，未发现 Critical。

## 真实依赖失败记录

- 默认 `opencode-go / mimo-v2.5` 曾真实返回 `401 Model is not supported`，切换到 profile 已启用的 `sensenova-llm / deepseek-v4-flash` 后 prompt optimize 成功。
- 纯图片轮播曾因低速环境的 `image_segment_encode` 固定预算误杀；本次已改为工作倍率感知预算并加回归测试。
- 对齐服务曾超时后 fail-open 保留估算，不阻塞合成，但会增加等待时间。

## 变更审查

克隆音色恢复只在当前 owner registry 内替换旧 ID，目标 ID 冲突时 fail-closed；偏好迁移 best-effort，不阻断本次已成功的 TTS。真实 SQLite 已确认旧 ID 被新 ID 替换，后续调用不再先走失效 voice ID。
