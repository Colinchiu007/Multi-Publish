# 视频合成拼接阶段耗时分析报告：转场重编码与 87%「假卡死」（2026-08-15）

> **版本**: v1.0（2026-08-15）
> **状态**: 分析完成 + 引擎侧修复已实施（本地未提交）；渲染层展示优化待产品确认
> **基线**: 本地分支 `codex/fix-s2v-translation-parsing`（主工作区）
> **现象来源**: 用户反馈「视频合成在 87% 卡了非常久」——前一个已完成任务的日志显示 concat 阶段长时间停留在 87%
> **实证来源**: `apps/desktop/electron/services/story2video-compose-engine.js` 代码实测 + 单元测试（105 通过）+ 双模型审查（Claude）
> **相关文档**: `01-docs/PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md`（进度反馈颗粒度统一方案）

---

## 一、背景与问题

视频创作流水线（story2video-compose）的「视频合成」阶段在**长列表拼接（>8 段，走分块合成）**时，进度长时间停留在 87%，用户感知为「卡死/异常」。

实际上拼接进程一直在工作——卡住的是**进度反馈**，不是流水线本身：

- 拼接阶段只发射两个进度点：开始 87 → 结束 89（`story2video-compose-engine.js:893` 与 narration 起始 89）。
- 超长列表的分块合成（`_concatSegmentsChunked`）可能持续数分钟（多轮全片重编码），期间无任何中间进度事件 → UI 钉死在 87%。

## 二、合成拼接阶段现状链路（代码实测）

### 2.1 compose 进度相位权重

| phase | percent | 说明 |
|---|---|---|
| preflight / validated | - | 准备与校验 |
| segments | 3 → 75 | 逐片段编码（3 + 72·k/N） |
| **concat** | **87 → 89** | 拼接所有片段（本报告焦点） |
| narration | 89 | 合并旁白音频 |
| bgm / webm / verify / done | 92 / 95 / 98 / 100 | 混音、转码、校验、完成 |

### 2.2 拼接三路径（`_concatSegments`，:1517）

| 条件 | 路径 | 编码方式 |
|---|---|---|
| ≤8 段 + 转场 | 单条 `_xfadeMerge`（:1544） | 全片重编码（libx264） |
| >8 段 + 转场 | `_concatSegmentsChunked` 递归分块（:1603） | **每层全片重编码** |
| 无转场 | `_plainConcat`（:1580） | concat demuxer + `-c copy` 流拷贝 |

- 块大小 `MAX_XFADE_INPUTS = 8`（:72）；中间文件名 `merge_l{level}_chunk_{n}.mp4`，按层递归合并。
- xfade 超时预算按「输出时长 ×3 + 2 分钟」估算（`computeMergeEncodeTimeoutMs`，:296），注释明确假设「最低 1.5x 实时编码速度 + 大幅余量」——编码是拼接阶段的主要耗时。

## 三、根因分析（QM-5）

### 3.1 第一性原因

分块递归合成是为了规避「单条 ffmpeg 命令输入路数过多」（>8 段）引入的。但它的成本结构是：

1. **转场路径 = 解码 → filter_complex 逐帧混合 → libx264 软件重编码**（`_xfadeMerge`，:1544）；每层递归都会把当前全部内容重编码一遍。
2. 分块递归把重编码次数放大：27 段 → l0 4 块 + l1 1 块 = **5 次 xfadeMerge，全片约重编码 2 遍**；100 段 → 13 + 2 + 1 = 16 次，**全片约重编码 3 遍**。
3. 进度契约只给了 concat 阶段 87→89 两个点（`normalizeComposeProgressUpdate` 取整后至多 3 档整数 percent），块级没有任何中间进度 → 长列表拼接期 UI 长时间不动，形成「假卡死」。

### 3.2 转场对速度的影响（量化结论）

| 路径 | 是否重编码 | 速度量级 | 说明 |
|---|---|---|---|
| xfade（含 chunked 每层） | 是（libx264 软件） | 0.5~2x 实时（1080p 典型） | 每层覆盖全片，N 层 ≈ N 遍全片编码 |
| `-c copy` 无损拼接 | 否（流拷贝） | 秒级（磁盘 I/O bound） | concat demuxer 不解码不重编码 |

**结论：转场是拼接阶段耗时的主要来源。** 同一段视频，「带转场」与「不带转场」在拼接阶段可差一个数量级以上（分钟级 vs 秒级）。

### 3.3 逃逸分析（为什么没拦住）

- **单元测试**：`_concatSegments 分块合成` 组只断言块数、输入数、输出存在（原测试），**未断言「拼接期间进度是否可见推进」**。
- **进度契约测试**：`compose_progress 契约` 组全部 mock 掉 `_concatSegments`，**未覆盖 >8 段真实分块递归路径**。
- **E2E / 视觉层**：无「长时间拼接」场景断言，肉眼无法在测试中察觉 87% 钉死。
- **代码审查盲区**：此前无审查点要求「长耗时路径必须提供中间进度」。

### 3.4 系统性漏洞定位

1. 进度契约测试缺少「>8 段真实分块路径」覆盖（已补，见 §4）。
2. 渲染层 concat 分支只展示取整 percent、丢弃按块 message（`CreateView.vue:4020`、`StageProgress.vue:136-141`）——按块信号最细的粒度在 message 字段里，但前端不用（见 §6 选项 1）。

## 四、已实施修复（2026-08-15）

### 4.1 引擎侧：分块级进度上报

`apps/desktop/electron/services/story2video-compose-engine.js`：

- `_concatSegmentsChunked`（:1603）：**每完成一块**即触发 `onChunkCreated` 回调 + 日志 `merge_l{level}_chunk_{n} created`；递归全程共享 `{ total, done }` 进度状态，`done` 跨层级单调累加。
- 新增并导出 `countChunkedMergeChunks`（:533）：预计算全流程总块数（各级块数之和，末级仅复制不新增块），作为进度统一分母；并加了与递归分块循环的**同步耦合注释**（审查 Warning #2 的处理）。
- `compose()`（:913）：`onChunkCreated` 按块发射 `phase:'concat'`，`percent = 87 + 2·done/total`（87→89 单调推进），message 携带「分块 k/N」。
- `_concatSegments`（:1517）透传 `onChunkCreated`。

### 4.2 回归测试（`story2video-compose-engine.test.js`，新增 4 个用例）

1. 块回调字段（level/chunkIndex/done/total/path）：27 段 → `[0,0,0,0,1]` 层级、done `[1..5]`、total 恒 5。
2. 块日志：`merge_l0_chunk_000 created` / `merge_l1_chunk_000 created` 均存在。
3. `countChunkedMergeChunks` 计数：27→5、9→3、8→1、100→16、1→1、0→0。
4. **10 段真实递归拼接**：concat 进度序列 `[87, 88, 88, 89]` 单调且在 [87,89] 区间内，块日志 3 条齐全。
5. **分块合成错误路径（W2 回归）**：`_xfadeMerge` 第 3 块抛错 → compose 正常 `rejects`、失败块不上报 `onChunkCreated`（`created` 冻结在 2 块）、输出文件不产生。

验证：`vitest run services/story2video-compose-engine.test.js` → **106/106 通过（含 W2 错误路径回归）**。

### 4.3 双模型审查（CCG 门禁）

- **第三轮复审（2026-08-15 重试成功）**：Claude **Approved，无 Critical**；6 项审查点全通过（进度越界/单调性、count 与递归一致性、错误路径状态、递归共享 state、测试覆盖、契约影响）。
  - W1（大列表 message 前端不渲染，~40 段时仍可能长时间停 88%）→ 记录为 §5 选项 1，前端改动待产品确认。
  - W2（缺错误路径回归测试）→ **已修复**：新增「分块合成错误路径」用例，全量 106/106 通过。
  - 复审环境说明：Claude API 依赖本地 CC Switch 代理（127.0.0.1:15721），此前两轮尝试因代理未运行报 `ConnectionRefused` 失败；启动 CC Switch 后复审成功。antigravity 仍地域不可用（Eligibility check failed），按降级规则记录。

- antigravity：地域不可用（Eligibility check failed），按降级规则跳过。
- Claude：**Approved with minor changes**，无 Critical；实测 `countChunkedMergeChunks` 与真实递归在 n=0..300 全部一致、percent 单调且不越界。
- Warning #2（计数与递归漂移风险）已通过耦合注释处理；Warning #1 见 §6 选项 1。

## 五、剩余优化选项（按性价比排序，需产品权衡）

### 选项 1（推荐先做）：渲染层展示按块 message

- 改动：`CreateView.vue:4020` / `StageProgress.vue:136-141` 的 concat 分支优先显示 `p.message`（引擎已发出「正在拼接视频片段（分块 k/N）」）。
- 收益：超长列表的 87% 钉死**彻底消失**（进度随每块刷新），无产品语义变化。
- 成本：纯前端小改 + 一次人工验证；不改任何引擎契约。

### 选项 2：块间去转场 + 最终层 `-c copy` 无损拼接

- 改动：块内保留 xfade，块间合并层改用 `_plainConcat`（concat demuxer + `-c copy`）。
- 收益：**省掉几乎全部拼接重编码**（分钟级 → 秒级），是真正的提速，不只是进度观感。
- 代价：块交界处为硬切（约每 8 段一个切点；27 段 3 个切点）——**需要产品确认「块间硬切」可接受**；引擎契约测试需同步。

### 选项 3：硬件编码（NVENC / QSV）

- 收益：保留全部转场，重编码提速 3~10x。
- 代价：画质略降（尤其低码率）、打包需带对应编码器/驱动、平台兼容性复杂度上升。

### 选项 4（不推荐优先）：进度权重加宽（如 80→89）

- 收益与选项 1 重叠，却要触碰跨阶段 percent 契约、前端断言与既有 87/89 边界测试，成本高收益低。

## 六、验证与证据边界

- **已证明**：引擎侧分块进度事件正确（单测 105 通过）；转场 vs 无转场的速度差异有代码路径依据（重编码 vs `-c copy`）。
- **未证明**：真实长列表的 before/after 耗时基准（取决于 CPU/分辨率/码率，需在真实列表上 AB 复测）；渲染层展示（选项 1 未实施，需前端改动后人工验证）；真实 ffmpeg 端到端合成时长。
- **工作区状态**：改动迁移至隔离 worktree `D:/Data/projects/mp-worktrees/mp-s2v-concat-progress-v3`（分支 `codex/s2v-concat-progress-v3`，基于最新 origin/main e2893256）；主工作区被并发会话占用（已切至 `codex/fix-s2v-v3`），原改动经 `stash@{0}` 保护并恢复。

## 七、相关文档

- `01-docs/PLAN-VIDEO-PIPELINE-PROGRESS-FEEDBACK-2026-08-13.md` — 流水线「进行中信息反馈」颗粒度统一方案（本报告是其 compose 拼接粒度的专项落地分析）
- `01-docs/PRD.md` 7.1.9 — 视频创作进度反馈需求
- `01-docs/STORY2VIDEO-UE-OPTIMIZATION-PROPOSAL.md` — Story2Video 体验优化提案
