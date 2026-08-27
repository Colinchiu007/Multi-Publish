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

## 规划期待办（实现前需在分支上细化，不阻塞立项）

- [ ] 确认下游是否消费片段内水印（历史恢复/缩略图/中途产物展示）→ 决定片段是否保留静态占位
- [ ] 核对 `countChunkedMergeChunks`/`_concatSegmentsChunked` 进度分母同步规则与后处理命令的进度并入
- [ ] 核对后处理编码耗时对 maxDurationSeconds/超时预算的影响（必要时回退输出级 filter 方案）

## 实现（进入分支后按 TDD 顺序执行）

- [ ] 测试先行：compose-engine 用例新增/更新——「moving 片段 filter 不含 moving drawtext」「输出命令含 moving drawtext」「moving 数学契约按成片级 t 求值（跨镜头连续性：29.5s/30.5s 帧坐标连续断言方案）」
- [ ] `story2video-compose-engine.js`：`_createSegment` image/video 两路径 moving 跳过水印注入；最终阶段独立 ffmpeg 命令叠加 moving drawtext（复用 `buildWatermarkFilter`）；配置沿 compose 参数链传递
- [ ] 进度：后处理命令并入分块总数分母，progress 全量测试通过
- [ ] 受影响断言更新：`story2video-compose-engine.test.js`、`pipeline-story2video-contract.test.js`、`story2video-compose-engine-cleanup.test.js` 及其他 `*watermark*` 相关用例
- [ ] 真实 ffmpeg 冒烟：2 片段成片（切点 30s）抽帧断言无跳变；单镜头 t=0 居中回归
- [ ] 文档：PRD 3.1.38 多镜头说明改「跨镜头连续漂移」；product-manual 同步；CHANGELOG 条目；learnings 补充（如适用）
- [ ] locale 成对（如新增提示文案）；CI 门禁（locale-sync、affected tests）通过
- [ ] 双模型审查（opencode + Claude）→ Critical/Warning 修复 → review.md
- [ ] QM-1 打包验证（electron-builder --win --dir + asar 核对）
- [ ] 推送 codex/ 分支 → PR → CI 全绿 → 合并 → 远程同步确认

## 归档前

- [ ] `openspec validate` PASS；场景-测试映射核对（每个 Scenario 对应测试文件/用例）
- [ ] CCG task 归档三同步：openspec archive + `.ccg/tasks/archive/` + learnings
