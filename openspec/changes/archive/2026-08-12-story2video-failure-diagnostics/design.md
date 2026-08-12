## Context

见 proposal.md（Why/What）。现状信号：`pipeline-engine.js`（`_finalizeRun`，附加字段挂载点）、`stage-executor.js`（统一 execute 入口）、`story2video-stages.js`（degraded/fallbackReason/有界重试）、`story2video-compose-engine.js`（`{code:-1}` + 分辨率降档 + BGM 机器码警告）、`user-facing-error.js`（renderer 文案与脱敏）、`logger.js`（滚动日志）。缺口：统一诊断码、根因映射、结构化遥测、环境快照、跨 run 聚合。

## Goals / Non-Goals

Goals：
- 纯函数、可单测的「分类 + 根因候选 + run 诊断摘要」模块，零新依赖。
- `_finalizeRun` 附加 `run.diagnostics`（additive），不改变任何既有对外行为。
- 环境快照 best-effort、永不抛错。

Non-Goals（后续任务）：
- renderer 展示（诊断报告 UI）、IPC 契约变更、自愈触发编排、跨 run 聚合统计与失败率趋势、learnings 自动生成。

## Decisions

### D1: taxonomy 为纯常量模块 + 纯函数 classifyFailure
分类器不依赖任何服务，输入 → 稳定结构（stage/failureType/severity/recoverability），未知一律 `unknown`。
- 备选 A：把分类逻辑内联进 `pipeline-engine` → 污染热路径、不可单测，否决。
- 备选 B：外部分类服务 → 过度设计，否决。

### D2: 根因映射为声明式规则表
`root-cause-map.js` 导出规则数组（errorCode/code/message pattern → 候选根因），纯函数 `lookupRootCauses(classification, error)` 遍历匹配，未命中返回低置信度 `unknown` 候选。
- 备选：基于历史样本的统计评分 → 样本不足、不可解释，否决。

### D3: 采集挂载点 = `_finalizeRun`（同步、仅加字段）
在 run 终结处调用 `buildRunDiagnostics(run, captureEnvSnapshot(deps))`；环境快照只做有界同步探测（os 内存/CPU/uptime + 磁盘余量 try/catch + 可选 ffmpeg 探测），任何异常 → null。
- 备选：run 启动时异步采集并缓存 → 增加生命周期复杂度与失败面，P0 否决。
- 磁盘余量：优先 `fs.statfsSync`（try/catch），平台不支持时返回 null；Windows 精确磁盘余量作为后续增强（本地化解析风险，不进 P0）。

### D4: 诊断输出字段白名单
diagnostics 只携带 `errorCode`、截断 `error`（沿用现有 ≤500 截断）、分类、根因候选、环境快照；**不携带** `errorParams` 原文、provider 响应体、路径明文（仅目录是否存在布尔/名称）。
- 依据：learnings「技术性提示文字直出用户界面复盘」确立的脱敏原则 + renderer `user-facing-error.js` 的 `looksTechnical` 过滤。

### D5: 零新依赖、零 IPC/renderer 变更（P0）
P0 只新增 `services/diagnostics/*` 与附加字段；UI 展示与 IPC 扩展留到后续任务，避免一次改动跨主进程 + preload + renderer 三层的风险。

## Risks / Trade-offs

- [Windows 磁盘余量为 null] → statfs 不可用时以内存/CPU/ffmpeg 快照兜底；文档标注 Windows 精确磁盘为后续增强。
- [附加字段影响既有测试] → 严格 additive：字段仅在 run 终结时附加，既有断言不动；回归跑 `pipeline-engine.test.js` 全量。
- [分类器误判] → fail-closed 到 unknown + 根因只给「候选 + 置信度」，文案语义为「可能原因」，不阻断展示。
- [环境探测阻塞] → 全部有界（spawnSync timeout ≤2s 或同步轻量探测），异常捕获为 null。

## Migration Plan

部署：随 `codex/video-diag-system` 分支 PR 合入，additive 字段无迁移。
回滚：删除 `run.diagnostics` 附加行与新模块，即可完整回退；无数据迁移成本。

## Open Questions

无阻塞项。跨 run 聚合的存储形态（文件 vs sqlite）留给后续任务按实际数据量决定。
