# 增强需求

Story2Video 字幕引擎主要负责场景字幕块、时间轴和配音对齐。长度切分时需要使用受限的本地分词边界 oracle，避免未登录词和二字词被硬切；同时需要在动词完成体“了”与普通宾语之间禁止优先切分。实现覆盖 TypeScript 权威版、Electron JavaScript mirror 和 Python sidecar，最终行为以共享向量锁定，不承诺 segmentit 与 jieba 对任意新文本逐字等价。

验收：三国志、灭亡、地形、蒙古、江南、包税人等词不在词内产生边界；杀了人、完成了任务、写了信不在了后普通汉字处产生边界；标点和真实条款引导边界仍可用；三端定向向量通过；segmentit 可从实际运行依赖和 Electron ASAR 加载。

