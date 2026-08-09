# Design: 图片轮播参数治理（前端死字段移除 + 契约边界文档化）

## Context

s2vConfig（CreateView.vue:991-1012）含 3 个隐藏死字段：voicePitch(0)、creativeLevel(5)、splitBaseWordsPerSecond(3.3)。提交构造（:1637-1706）显式传 voice.pitch / optimize.creativeLevel / split.baseWordsPerSecond(语言表)。normalizer（story2video-text-config.js:293,327,349）以 firstDefined(input, params) + 默认值兜底。恢复快照（_applyS2VSnapshot :1534-1550）按当前默认键白名单应用。

## Goals / Non-Goals

**Goals:**
- 移除前端 3 个死字段，消除「假配置项」；提交改契约默认兜底，行为等价。
- 把隐藏工程默认值清单、UI-后端边界、watermark/subtitle 双源结构文档化为参数治理合同。

**Non-Goals:**
- 不改版本化 text-config 契约（默认值保留，字段可缺省）。
- 不做 B 类运营化（pipeline_configs 基础设施，P1 待办）。
- 不动 watermark/subtitle 代码结构（模板-提交协调，仅文档化）。

## Decisions

### D1: 字段移除（CreateView.vue）
- s2vConfig 默认值删除 `voicePitch`、`creativeLevel`、`splitBaseWordsPerSecond`；更新 :999-1001 注释。
- 提交构造：`voice` 段不再含 pitch；`optimize` 段不再含 creativeLevel；split 段保留 baseWordsPerSecond（语言表，不变）。
- 行为等价依据：normalizer pitch 缺省 → 0；creativeLevel 缺省 → 5；split.baseWordsPerSecond 由语言表填充（:1650 已用 getLanguageBaseWordsPerSecond）。

### D2: 测试
- CreateView.test.js：:629 断言改为「s2vConfig 不含 voicePitch」；提交断言（:969-1003 附近）移除 creativeLevel/voicePitch 期望，新增「提交对象不含该两键」。
- story2video-ue-contract.test.js：:25-27 升级为断言源码不含 `s2vConfig.voicePitch` / `s2vConfig.creativeLevel`（字段不存在，非仅 v-model 不暴露）。
- story2video-text-config.test.js：补「缺省 creativeLevel/pitch → 默认 5/0」断言（normalizer 兜底路径，现有 :476 creativeLevel 0 边界已覆盖部分）。

### D3: 文档
- PRD 7.1.19 参数治理合同：系统管理参数表（voicePitch 0 / creativeLevel 5 / concurrency 3 / splitBaseWordsPerSecond 语言表 / autoAdvance / splitEnforceSentenceBoundary 等，UI 不暴露不提交）；UI 边界（fps 24/30/60 产品子集、splitMaxSentenceLength 20-1000 默认 200、negativePrompt ≤500）；watermark（UI 文本 → 提交合成 watermarkConfig.text，样式对象为模板持有）、subtitle（subtitleSize/subtitleStyleName UI + subtitleStyle 模板对象，提交合成 subtitle.size/style/color）双源结构说明。
- CHANGELOG、learnings（参数治理：死字段清理模式 + normalizer 兜底验证方法）。

## Risks / Trade-offs

- 低风险：3 个字段移除均为「前端不再使用」的隐藏项；normalizer/契约默认兜底；恢复快照白名单天然兼容。
- 中风险点：任何隐藏字段若未来要开放 UI，需从契约默认改显式——PRD 注明「开放前须评估契约影响」。
- 不引入：无依赖变更、无 IPC 通道变化、无供应商契约变化。
