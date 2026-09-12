# harden-locale-gate 审查记录（2026-09-12）

## 结论
PR #1744 已合并（7c023a6e），CI 全绿（一轮网络抖动重跑后通过）。

## 根因（PR #1736 后续体检发现）
1. Gate 7 退出码吞掉：PowerShell 多行 step 只取最后一条命令退出码，--cjk FAIL（18 处硬编码）被静默吞掉，job 仍 success——门禁对中间命令一直是装饰性的。CI 日志铁证：run 34688843405。
2. CJK 基线 file:line 行号漂移假阳性：文件上方插码即全量行号偏移产生 fresh 假阳性（脚本 2026-08-14 已记录的已知边界从未根治）。

## 修复
① Gate 7 每条命令后显式 if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }；② 基线一次性迁移 file||content 内容级存储（1686 条）；③ KnowledgeBasePage.vue 两处原始错误透传补 formatUserError；④ Collection.vue 剪贴板错误双前缀修复。

## 回归保护
check-locale-sync.test.js +2（基线格式断言 + 行号漂移注入实测：头部插行 PASS / 新增中文 FAIL）。

## 验证
- check-locale-sync.test 6 passed；workflow-contract 19 passed；--cjk/--keys/--py-cjk 全 PASS
- vitest 88 + 11 passed；合并后复验全绿；main 基线 1686 条全新格式
