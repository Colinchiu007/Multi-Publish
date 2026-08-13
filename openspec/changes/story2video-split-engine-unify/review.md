# Review: story2video-split-engine-unify

## 审查方式

- 双模型要求：antigravity + claude 并行。**降级记录**：antigravity 后端不可用（账户地区限制：`Your current account is not eligible for Antigravity`），claude 单模型完成审查；按机制硬化规则记录降级，未盲等。
- 审查对象：`git diff origin/main...HEAD`（运行时代码 3 文件 + 测试 + 规格工件），claude 审查基于提交态 diff，并注意到工作区后续修复。

## Critical

无。

## Warning（已全部处理）

- **W1 [算法移植] `subtitleClean(blocks, config)` 多传 1 参**（TS2554，手抄漂移信号）→ 已修复为 1 参并提交（9f9cebfc）。
- **W2 [工具链] 新文件使 check:ts 新增 36 个类型错误** → 已通过 `@param {Record<string, any>}` JSDoc + `subtitle-rules.js` JS 包装入口 + `@ts-ignore`（JSON require）清零；check:ts 全仓存量错误由 885 降至 849。CI Gate 1（`npx tsc --noEmit`）只查 .ts，不受影响。
- **W3 [引擎字幕采纳] 无覆盖率校验，静默丢内容风险** → 已加 `ENGINE_SUBTITLE_MIN_COVERAGE=0.6` 覆盖率护栏（去空白/标点后引擎字幕拼接长度 / 场景文本），覆盖率不足回退本地分块；新增回归测试。
- **W4 [离线降级] 误删 `/socket hang up/i` 匹配 + 收窄 errorMessage** → 已恢复旧版 `errorMessage`（嵌套对象 JSON.stringify）与 `/socket hang up/i` 正则；新增降级触发面回归测试（socket hang up / 嵌套 {error:{code:ECONNREFUSED}} / 业务错误不触发）。
- **W5 [打包可达性] subtitle-rules 是模块加载期硬依赖** → 结构确认：engine 包在 desktop dependencies、electron-builder files 含 `node_modules/**/*`、无 files/.npmignore 裁剪；QM-1 打包验证增加「打包后 asar 内 require 子路径」冒烟检查（见 tasks）。

## Info（评估后处理/记录）

- **I1 aggregate subtitleSource 用 some()**：per-scene 标记准确；aggregate 语义=「至少一个场景用了引擎」，spec 已注明，保留。
- **I2 splitTextToScenes 忽略 targetCount**：当前无调用方；TS 版 targetCount 为可选适配，JS 镜像保持最小面，design.md 记录，后续需要再补。
- **I3 行为变更（有意）**：字幕块去尾标点/滤纯标点 ⇒ join≠原文；英文场景句界仅 `。！？`。spec/测试/CHANGELOG 均已背书。
- **I4 scene.subtitles 双真相源** → 已修：输出场景剔除原始 `subtitles` 字段（解构排除），仅保留规范化 `subtitleBlocks`。
- **I5 buildSubtitleTimeline normalizeText 折叠换行**：既有行为，非本 change 引入，不处理。
- **I6 normalizeSegmentationOptions 钳制**：Electron 侧防呆（范围外与 TS 行为不同），范围内 parity 测试锁定等价；design.md 记录。

## 验证（主代理）

- parity：JS 镜像 vs TS 权威版 10 组语料 21 用例全绿。
- 受影响套件：segmentation（20）、stage-executor（57）、compose-engine（94）、pipeline-story2video-contract、text-config、stages、talkinghead/podcast/localization stages、story2video-manual-assets、story2video-engine 包（127）全绿。
- lint：改动文件 eslint 0 error；check:ts 改动文件 0 error。
- 全量桌面 vitest：后台运行中（结果见最终交付报告）。
- QM-1：待打包验证（见 tasks）。
