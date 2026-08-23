## Context

当前 Electron 归一化层只用去标点后的字符长度计算在线字幕覆盖率，覆盖率足够时直接采纳 scenes[].subtitles[].text。因此 8002 返回“江”“南”两个相邻块时，客户端不会检查词边界。离线 JS/TS 镜像虽然已经有 no_cut_bigrams 检查，但检查只取切点两侧两个字符，规则也没有覆盖本次样例短语。

## Goals / Non-Goals

**Goals:**

- 让本地 JS、TS 以及 sidecar 使用共享规则保护任意长度短语。
- 在在线字幕被采纳前验证字符顺序连续性和短语边界。
- 对坏场景整体回退本地字幕块，保留现有来源枚举和场景文本。

**Non-Goals:**

- 不引入新的中文分词依赖。
- 不重新设计 8002 的场景级分句策略或字幕时间戳算法。
- 不改变已经合格的在线字幕块内容。

## Decisions

### 1. 使用短语规则而非引入分词库

继续使用 subtitle_rules.json 作为规则单源；no_cut_bigrams 保留现有字段名以兼容配置，但实现按任意长度短语解释。边界检查通过判断切点是否落在任一短语匹配范围内，覆盖“包税人”两个内部切点。

若受保护短语长度本身就大于 max_chars_per_block，三端 SHALL 保留完整短语块，允许块长超限；保护短语完整性优先于长度上限。

备选方案是引入中文分词库。该方案会扩大 Electron 生产依赖、改变三端 parity 边界，且本次问题已有明确短语规则机制，故不采用。

### 2. 在线结果按场景整体回退

在线字幕先做去空白/标点后的顺序连续覆盖检查，再检查每个字幕块边界。任一检查失败则整场景调用现有本地 splitTextToSubtitles()。整体回退比只合并坏边界块更容易保证不丢字、来源可追踪和时间轴一致。

### 3. 保持来源枚举兼容

合格在线结果继续使用 smart-sentence-splitter；客户端修复结果使用已有 local-typescript，通过 fallbackReason 区分“在线字幕质量门失败”和传统服务不可用回退，不新增来源枚举值。

## Risks / Trade-offs

- [Risk] 现有服务可能存在标点归属差异 -> [Mitigation] 顺序校验与覆盖率使用相同的去空白/标点规范化，不要求块尾标点归属一致。
- [Risk] 规则表更新后 sidecar 与 Multi-Publish 漂移 -> [Mitigation] 同步更新两仓库规则，并运行三端向量/定点测试。
- [Risk] 质量门使个别在线结果降级，增加本地计算 -> [Mitigation] 仅在内容不连续或边界命中保护短语时回退，正常在线路径零额外本地重切。

## Migration Plan

先更新规则和三端实现，再发布客户端。旧持久化项目读取时继续识别 smart-sentence-splitter、local-typescript 和 local-typescript-fallback，无需数据迁移。出现异常时可回滚客户端代码与规则到上一版本。
