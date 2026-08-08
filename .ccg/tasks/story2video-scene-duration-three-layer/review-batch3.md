# Batch 3 双模型审查汇总（codex + claude）

## 结论：**通过**（无 Critical；W 级意见已全部处理）

- 审查对象：`.ccg/tasks/story2video-scene-duration-three-layer/review-batch3.diff`（5 个任务文件，604 行）
- 验证方式：双模型独立审查 + 实跑 `vitest run electron/services/story2video-compose-engine.test.js`（60/60 通过，含真实 ffmpeg 双轨/xfade+BGM 断言）

## codex 审查（review-batch3-codex.log）

- Critical：无
- W-1（文档措辞）：探测失败但场景带上报 duration 时沿用既有 `-t reported` 上限语义，文档「不 -t」措辞不准确 → **已修**（PRD/CHANGELOG/learnings 收紧为「不启用补齐 -t」）
- W-2（提交卫生）：5 个并发脏文件不得 `git add -A` → **已处理**（按文件白名单 stage）
- W-3（voiceVolume≠1 + padTo 链顺序无覆盖）→ **已修**（真实 ffmpeg 用例补 volume=0.5 + padTo 段，≈6s 断言）

## claude 审查（review-batch3-claude.log）

- Critical：无
- W1（audioDuration == minSceneDuration 等值边界无用例）→ **已修**（边界矩阵补 `[6,6,6,6,false]` 行，60/60 绿）
- W2（提交卫生，同 codex W-2）→ 已处理
- I1-I5（记录不改）：duration=0 退化输入预检/循环 base 公式微差、_createSegment 隐式契约、BGM 尾音利好待听感验证、renderSegment mock 时长、文档计数口径

## 关键验证证据

- C1 四层守卫（预检/场景循环/renderSegment/_createSegment）全部挡住 `Math.max(null, N)` 陷阱
- 真实 ffmpeg：min-duration 段视频/音频双轨 ≈6s（±0.3）；2 段 xfade+BGM 成片 ≈11.6s；follow-audio ≤3s 不补齐
- 补齐超限预检：11 段 × 50s 音频 + min=60 → 660s > 600s 在渲染前拒绝（`_createSegment` 未调用）
- QM-1 打包：electron-builder exit 0；asar 含 compose-engine.js；require 链 OK；启动 8s 存活、stderr 无 config/plugin 错误
