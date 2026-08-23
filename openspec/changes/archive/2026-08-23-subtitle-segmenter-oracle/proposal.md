# Story2Video 字幕词边界与完成体宾语保护
## Why

Story2Video 的字幕块在无标点长度切分和平衡切分时，当前字符规则会把未登录词或二字词拆开，例如 三国|志、看地|形、灭|亡；同时 了 被当作块尾好切点时，会优先产生 杀了|人、完成了|任务 这类动词完成体与宾语之间的边界。该引擎主要服务 Story2Video 的场景字幕块与字幕时间轴/配音对齐，不重新定义通用文章分句。

## What Changes

- 在 TS 权威实现和 Electron JS mirror 中，用 segmentit 生成受限的连续 CJK 词跨度；在 Python sidecar 中用 jieba 生成同语义跨度。
- 只保护至少两个连续 CJK 汉字 token；token 无法严格映射回原文时丢弃，不用逐字符伪跨度；缓存有界且返回不可变结果。
- 将词边界 oracle 接入所有长度切分候选检查，保留现有显式短语和引号合同。
- 将 了 后守卫放到 semantic_lead、good_lead 和最终 fallback 之前，禁止普通汉字宾语及结构助词后的优先切分；保留标点与少量 clause starter 的真实边界。
- 同步三端回归测试与共享向量；不宣称 segmentit 与 jieba 对任意未收录文本逐字等价。

## Scope

包含字幕块长度切分、词边界候选保护、三端 parity/golden vectors、segmentit 运行时依赖闭包和 Electron 打包可加载性。场景级语义分句、通用文章分句、分词词典质量和字幕文案内容不在本 change 范围内。

## Acceptance

- 三国志、灭亡、地形、蒙古、江南、包税人等稳定词不在词内产生块边界。
- 杀了人、完成了任务、写了信不在了后普通汉字处产生优先块边界；真实标点/条款引导边界仍可用。
- TS、Electron JS、Python 通过共享 vectors，JS/TS parity 不漂移。
- segmentit 是实际运行依赖，TS build、Electron ASAR require 链和相关测试可加载。
