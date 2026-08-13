# 视频克隆：复刻层级程序自动决定并驱动行为（B 方案）

## 目标
把「复刻层级」从「固定 L1 的装饰字段」变成「程序自动评估 + 真正驱动 generate/compose + F4 按层级验收 + UI 展示」的真功能（PRD §0 L0-L2 / §29）。

## 设计决策（v1.16 切片）
1. **自动评估（新模块 src/replication-level.js）**：纯函数 `assessReplicationLevel(report)`，按报告证据打分定级：
   - structure：narrative.timeline ≥2 段
   - script：fullText 非空
   - style：风格标签 ≥2（palette≠unknown / transitions 非空 / person / tone）
   - meta：durationSec>0
   - 定级：结构+文案+风格全足 → L2；结构+文案足（风格弱）→ L1；否则 L0
   - 返回 { level, evidence, confidence }（confidence=证据维度数/4）
2. **plan 集成**：无显式 replicationLevel 时自动定级写入 `replication.level` + `replication.auto={determined,evidence,confidence}`；inspiration 清空风格/文案后重算（语义=只借结构→L0）。显式 replicationLevel（遗留/测试）仍优先。
3. **F4 按层级验收（similarity.js）**：`LEVEL_THRESHOLDS`：
   - L0 文案级：仅 script≥0.7 必须；结构/风格/时长不要求
   - L1：structure≥0.8 / script≥0.7 / style≥0.6 / duration≤10%
   - L2：structure≥0.85 / script≥0.7 / style≥0.7 / duration≤5%
   - 兼容：target P1→L1、P2→L2（无 level 时）；grade 仍按 score 输出（达成度）
4. **pipeline compose**：相似度用「请求显式 level > 报告 level > L1」的有效层级。
5. **generate 按层级**：L0 → 单封面图（kind=cover，文案优先 promptSeed）；L1/L2 → 逐镜头图（L2 promptSeed 追加 level 锚点）。
6. **compose 按层级**：L0 → 单图循环全时长 + 字幕 + 音频；L1/L2 → 逐镜头拼接（现状）。
7. **UI**：结果卡展示「自动目标层级 Lx → 达成 grade Ly（综合分）」；报告元信息行加目标层级。恢复下拉不做（自动决定）。
8. **测试**：replication-level 单测（L0/L1/L2/confidence）；plan 自动定级；similarity 分层阈值 + 兼容；generate L0 封面；compose L0 命令；pipeline 有效层级。桌面 composable 测试保持 7 绿。
