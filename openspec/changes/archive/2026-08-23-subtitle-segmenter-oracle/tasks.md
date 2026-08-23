# 实施任务

## 1. 规格与测试先行

- [x] 1.1 增加 segment span 单元回归：二字 CJK token、连续/单调/原文切片不变量、映射失败丢弃。
- [x] 1.2 增加字幕边界向量：三国志、灭亡、地形、蒙古、江南、杀了人、完成了任务、写了信，以及 了 后 clause starter/标点正例和功能词/结构助词负例。
- [x] 1.3 同步 Multi-Publish fixture 与 smart-sentence-splitter fixture。

## 2. 实现

- [x] 2.1 修正 TS/JS segmentit oracle 的过滤、映射与有界缓存，并让 TS 正确导入。
- [x] 2.2 修正 Python jieba oracle 的可达性、过滤、映射与 了 fallback 守卫；补充分词器运行时异常回退测试。
- [x] 2.3 将 segmentit 加入实际运行依赖并完成 worktree 解析检查。

## 3. 验证

- [x] 3.1 运行 TS、Electron JS、Python 定向向量与 parity 测试。
- [x] 3.2 运行 build、node --check、git diff --check 和 verify-worktree-deps.js。
- [x] 3.3 Electron 修改执行 QM-1 win-unpacked/ASAR require/8 秒启动验证。
- [x] 3.4 完成双模型审查；Claude/opencode 不可用时保留降级证据并执行本地独立审查。
