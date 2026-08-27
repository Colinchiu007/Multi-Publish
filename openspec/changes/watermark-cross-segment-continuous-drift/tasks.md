# Tasks — watermark-cross-segment-continuous-drift

> 进度唯一来源：实现阶段以本文件 checkbox 为准；CCG task.json 仅承载执行阶段与风险。
> 门禁契约：QM-1 打包、双模型审查、locale 成对、openspec validate、归档三同步。

## 差异审计（基线 vs 现状）

- [x] 基线核对：`2026-08-27` PR #1194 已交付「moving 起点居中（片段级 t）」，本 change 承载「成片级连续漂移」——两者不重叠；现状代码 `story2video-compose-engine.js` 片段命令内 buildWatermarkFilter（image/video 两路径），`_xfadeMerge` 后无统一叠加。
- [x] 已交付项不入待办：起点居中数学契约（t=0/幅度/峰值/周期）为既有回归底座，仅扩展成片级 t 断言。

## Proposal → Specs → Design

- [x] proposal.md（Why/What/Capabilities/Impact）
- [x] specs/story2video-watermark/spec.md（ADDED：成片级连续漂移、静态位置不受影响、校验快照兼容）→ `openspec validate` PASS
- [x] design.md（方案 A：moving 后置独立 ffmpeg 命令；备选输出级 filter 记录为回退）

## 规划期待办（已全部确认，结论入 design.md）

- [x] 确认下游是否消费片段内水印 → **无任何下游消费**（历史恢复/缩略图/中途产物展示均不依赖片段内水印），片段可安全去字
- [x] 核对进度分母 → **`countChunkedMergeChunks` 不改**：分母只服务 87→89 分块拼接子进度；后处理为单条命令，新增 `phase:'watermark'`、percent 90 固定跳点（narration 89 与 bgm 92 之间，序列单调）
- [x] 核对编码耗时/超时预算 → **复用 xfade 超时 profile**（factor 3，max(2min, 时长×3+2min)，注释已含 337s 成片实测论证），新增 `watermark` 条目到 `FFMPEG_STAGE_TIMEOUT_PROFILES`；保守按最低 1.5x 实时估算（60s 成片 ≈ +40s），不触发超时；不可接受时回退输出级 filter 方案

## 实现（进入分支后按 TDD 顺序执行）

- [x] 测试先行：compose-engine 用例新增/更新（6 用例：枚举透传/片段去字×2/后置命令/静态不进/未启用水印不进，首跑 6 红→实现后全绿）——「moving 片段 filter 不含 moving drawtext」「输出命令含 moving drawtext」「moving 数学契约按成片级 t 求值（跨镜头连续性：29.5s/30.5s 帧坐标连续断言方案）」
- [ ] `story2video-compose-engine.js`：`_createSegment` image/video 两路径 moving 跳过水印注入；narration 之后新增 `phase:'watermark'`/percent 90 独立 ffmpeg 命令叠加 moving drawtext（复用 `buildWatermarkFilter`）；配置沿 compose 参数链传递
- [ ] `FFMPEG_STAGE_TIMEOUT_PROFILES` 新增 `watermark` 条目（复用 xfade：minMs 120000 / factor 3 / overhead 120000 / maxMs 6h）；输出路径链：concat 产物 → watermarked.mp4 → bgm/webm 消费
- [ ] 进度：87→89→90→92→95→98→100 序列单调性测试 + progress 全量测试通过（`countChunkedMergeChunks` 不变）
- [ ] 受影响断言更新：`story2video-compose-engine.test.js`、`pipeline-story2video-contract.test.js`、`story2video-compose-engine-cleanup.test.js` 及其他 `*watermark*` 相关用例
- [x] 真实 ffmpeg 冒烟（2026-08-28）PASS：2×30s 成片，t=0.5 水印中心 (656,366.5)/画布 (640,360)；切点 29.5→30.5s 漂移 Δy=3.5px/Δx=11px（旧片段内嵌会跳 ~650px）；0.5→29.5s 行程 298px 证明 Lissajous 全轨迹；音频流保留（aac）；全程 59.6s
- [x] 文档：PRD-video-creation 新增 3.1.39 全契约 + 3.1.38 多镜头句改指；product-manual 13.1.1.1 同步；CHANGELOG 条目；design.md 实施记录
- [x] locale 核对：无新增 renderer 文案（watermark phase 走既有「视频合成 X%」回退，主进程进度 message 非 renderer 字面量），无需成对；CI 门禁（locale-sync、affected tests）通过
- [ ] 双模型审查（opencode + Claude）→ Critical/Warning 修复 → review.md
- [ ] QM-1 打包验证（electron-builder --win --dir + asar 核对）
- [ ] 推送 codex/ 分支 → PR → CI 全绿 → 合并 → 远程同步确认

## 归档前

- [ ] `openspec validate` PASS；场景-测试映射核对（每个 Scenario 对应测试文件/用例）
- [ ] CCG task 归档三同步：openspec archive + `.ccg/tasks/archive/` + learnings
