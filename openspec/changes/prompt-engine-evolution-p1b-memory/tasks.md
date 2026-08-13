# Tasks — prompt-engine-evolution-p1b-memory

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [ ] 基线差异审计：fingerprint.js（PR #752）+ P0 采集器已合入 main；本 change 只承载记忆库/治理/IPC 真实待办
- [ ] OpenSpec change 创建：proposal → design → specs → tasks 并 validate 通过

## 实现（codex/prompt-engine-evolution-p1b-memory 分支）

### 任务 1：prompt-memory.js 记忆库 V0（TDD）
- [ ] `prompt-memory.js`：library.json 索引 + templates/<id>@<version>.json；load/list/listActive/get/saveLearnt/activate/deprecate/disable/refreshFingerprints；learnt fragment 四类参数白名单；dictVersion stale；版本升版；写盘原子性（临时文件+rename）；损坏库 fail-close 重建
- [ ] 测试目标：`prompt-memory.test.js` —— 四类参数拒绝 / dictVersion stale / 升版不覆盖 / 原子写 / 损坏重建 / listActive 仅 active

### 任务 2：governance.js 治理层（TDD）
- [ ] `governance.js`：门禁 6 规则（structure/compliance/length/noSecrets/dedup/evaluatorVersion）；状态机合法/非法边；滑窗回滚（N 期阈值 + 峰值下滑 + 冷却防抖 + 可注入时钟）；配额（视频零、图片 dailyBudget 超限降级）
- [ ] 测试目标：`governance.test.js` —— 6 规则逐条 / 状态机边表 / 回滚+冷却幂等 / 配额降级不阻断

### 任务 3：IPC + preload + 接线
- [ ] `ipc-handlers/generation-feedback.js`：`prompt-library:list` 升级真实列表；新增 `get/save/activate`；`core/error-codes.js` 新增 EC.TEMPLATE_* 常量
- [ ] `preload/system.js`：promptLibraryGet/Save/Activate + `npm run build:preload` 同步 bundle（键数断言同步更新）
- [ ] `core/container.setup.js`：feature flag `evolution.memory.enabled` + promptMemory/governance 单例（注入 statsProvider）
- [ ] 测试目标：generation-feedback.test.js 新增 list/get/save/activate 契约（code+data+message、EC、save 缺 eventId、activate 不存在）；preload bundle 键数

### 任务 4：集成 + 兼容 + 文档门禁
- [ ] 集成测试：memory.listActive → fingerprint.findSimilarTemplates 全链路（active 命中 / deprecated 不命中）
- [ ] 兼容测试：空库 `prompt-library:list` 返回 `{code:0, data:[]}` 与 P0 结构一致；fingerprint.js 零改动
- [ ] CHANGELOG、`.quality-gates.md` 自检记录、tasks.md 全部勾选

## 收尾

- [ ] 双模型审查（Codex + Claude；Antigravity 地区不可用按降级路径）变更 diff，CRITICAL 修复后重审
- [ ] 提交/推送/PR/合并（codex/ 分支 → main）；OpenSpec archive + CCG task 归档三同步
