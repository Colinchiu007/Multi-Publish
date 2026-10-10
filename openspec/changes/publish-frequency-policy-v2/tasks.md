# Tasks: publish-frequency-policy-v2

> 顺序 A → B → C → D，每阶段先在**测试**里红、再实现到绿，然后才进入下一阶段。
> 详细规格（校验表 / 文案表 / 变异清单）见 `01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`。

## 0. 前置（已完成）

- [x] 0.1 上游调查报告落盘并合并（PR #3253 / `5e280da6`）
- [x] 0.2 隔离 worktree（`D:\Data\projects\mp-worktrees\mp-publish-frequency-policy-v2`，非 C 盘）+ 裸分支 `publish-frequency-policy-v2`
- [x] 0.3 跨家族对抗评审两轮 + 逐条回应（`rebuttal-v1.md` / `rebuttal-v2.md`，含 L1/L2/L3 证据分级）
- [x] 0.4 方案 v3 修订（并入全部采纳项，删除 proposer 擅自扩项）
- [ ] 0.5 复盘评审复跑至收敛（无 Critical / 无 High）
- [ ] 0.6 上报机制缺陷：`.adversarial` 不在共享根写保护放行名单 ⇒ 评审产物被隔离

## 1. 阶段 A — shared-utils（策略 / 守卫 / 队列）

- [ ] 1.1 `publish-frequency-policy.test.js` 先红：新数值表（20/10/3、平台档 2）、`tier` 字段、`accountDailyMax` 三档、未登记回落出声**恰好一次**
- [ ] 1.2 env 校验用例：`MP_PUBLISH_DAILY_MAX_{LONG,CLIP,SHORT}`、`MP_PUBLISH_ACCOUNT_DAILY_MAX`（全局覆盖）、`MP_PUBLISH_JITTER_RATIO`（`[0,1)`）、`MP_PUBLISH_RELEASE_GRACE_MS`；合法 / `0` / 非法 / 空白 四态各断言「值 + 是否出声」
- [ ] 1.3 `publish-frequency-policy.js` 实现至绿（含 `tier`、三档日配额、`jitterRatio` 默认值）
- [ ] 1.4 `publish-interval-guard.test.js` 先红：抖动区间 `[base, base×1.4)`、`ratio=0` 严格退化为旧值、`bucket='daily'`、`reason` 精确值
- [ ] 1.5 守卫用例：`release` 幂等 / **prev 缺失或错配 ⇒ no-op** / **窗口已被覆盖 ⇒ 不回滚** / 配额回补幂等且下限 0 / `rollback_count` 只增
- [ ] 1.6 守卫用例：跨日边界（`23:59:59 → 00:00:01` 两个 `day_key` 独立）；`dailyStore` 读回 `'3'` / `'3.0'` / `'abc'` 三态
- [ ] 1.7 `publish-interval-guard.js` 实现至绿
- [ ] 1.8 `task-queue-guard-integration.test.js` 先红：**提交前失败 ⇒ 窗口回滚 ⇒ 立即重发成功**；**已提交失败 ⇒ 窗口保留**（既有用例不放宽）
- [ ] 1.9 队列用例：同一错误类型在 `submittedAt` 为空/已置位两态下得到**相反**结果；`submittedAt` 为 null 但 `notSubmitted=true` 的**不一致** ⇒ 占窗口 + error
- [ ] 1.10 队列用例：**成功发布而 `submittedAt === null`** ⇒ `log.error` + 计数（不变量 I4 的探针）
- [ ] 1.11 队列用例：配额被拒 ⇒ `_quotaBlocked` 命中 ⇒ **连续 `_processNext()` 不产生紧循环**（断言重复判定次数上限）；定时器到次日 00:00:05 且已 `unref()`
- [ ] 1.12 队列用例：`publish:released` 事件字段精确；回滚后最小退避生效；每账号每日回滚上限生效
- [ ] 1.13 `task-queue.js` 实现至绿（`_quotaBlocked`、阶段判据、release 接线、放行路径）
- [ ] 1.14 结构锁：`task-queue.js` 必须消费 `recordPublish` 的返回值（防「回传 prev」被重构掉而静默退化）

## 2. 阶段 B — 日配额存储与装配

- [ ] 2.1 `store-schema.test.js` 先红：`publish_daily_count` 进入 `TABLE_NAMES` 等七处注册表
- [ ] 2.2 `store-schema.js` 七处同步登记（`TABLE_NAMES` / `OWNER_TABLE_SCHEMA_SQL` / `OWNER_INDEX_SQL` / `SCHEMA_SQL` / `OWNER_TABLE_COLUMNS` / `OWNER_TABLE_KEY_COLUMNS` / `OWNER_COLUMN_DEFAULTS`）
- [ ] 2.3 `store/publish-daily-store.js` 新 mixin：`getPublishDailyCount` / `incrPublishDailyCount` / `decrPublishDailyCount`（owner 解析复用 `_resolveOwnerSubject`；无 owner no-op）
- [ ] 2.4 store 用例：CRUD、owner 隔离（A 的计数不影响 B）、并发 upsert 累加、`decrDay` 下限 0、TEXT 亲和读回 `'3.0'` 归一
- [ ] 2.5 `container.setup.test.js` 装配锁 3 条（含「摘掉 `dailyStore` 注入即红」与 `bucket='daily'` 行为锁）
- [ ] 2.6 `container.setup.js` 注入 `dailyStore` + 设置页覆盖解析（任一字段非法 ⇒ 整体丢弃）

## 3. 阶段 C — 渲染层与 IPC

- [ ] 3.1 locale zh/en 成对新增/修改（文案表见 PRD §7）：日配额等待、未提交/已提交失败提示、`scheduleHintWithLimits` 去承诺化、设置页策略区块、紧急放行确认/上限/无窗口三态
- [ ] 3.2 `publish-progress-events` 投影白名单扩展（`reason` / `daily`）；**穷尽性审计**：新增字段必须同时改所有投影面（既有 4 处 + `emitPhaseNotify`）
- [ ] 3.3 `PublishProgressTaskRow` 用例：日配额文案、`released` 文案、归因标签**三态**（account / platform / daily）、字段缺席**不渲染**标签
- [ ] 3.4 设置页「发布频率策略」区块：当前档位、实际间隔区间 `[base, base×1.4)`、日配额、回滚失效计数、覆盖保存与失败回滚
- [ ] 3.5 紧急放行：二次确认 + 三种结果文案 + 每日上限 + ≥10 分钟冷却 + 追加式 JSONL 审计
- [ ] 3.6 `ipc-handlers/publish.test.js`：`publish:emergencyRelease` 三态 + 审计落盘 + 上限
- [ ] 3.7 `phase4-events.test.js`：新事件透传与投影白名单（含 `reason` / `daily`）

## 4. 阶段 D — 校准基础设施与小坑

- [ ] 4.1 `scripts/publish-frequency-calibrate.js`：口径定义（**以守卫的提交时间 `publish_timeline` 为准，不用 history 的终态时间**）+ 可复现取数 + 输出各平台 P10/中位/被拦比例
- [ ] 4.2 脚本自测（fixture 驱动，不依赖真实 DB）
- [ ] 4.3 `config/platforms.yaml` 加注释澄清 `tencent_video` 实际指微信视频号
- [ ] 4.4 `publish:wechat` 的 accountId 缺口：**本变更不做**，登记为另立变更项（附调用方审计证据）

## 5. 文档

- [ ] 5.1 `01-docs/PRD-PUBLISH-FREQUENCY-POLICY-V2-2026-10-10.md`：数据校验 / 流程 / 功能逻辑 / 交互逻辑 / 显示项 / 提示文字 / 迁移 / 验收（尽量详细）
- [ ] 5.2 更新 `01-docs/PRD-PUBLISH-FREQUENCY-CONTROL-2026-10-02.md` 的失效结论（数值与维度已被 v2 取代）
- [ ] 5.3 CHANGELOG 置顶
- [ ] 5.4 `.quality-gates.md` 记录 + `openspec/records/publish-frequency-policy-v2.md`

## 6. 变异反证（每条先跑基线证明绿，再变异证明**恰好那一条**红）

- [x] M1 摘掉 `notSubmitted` 回滚 → 「未提交失败窗口回滚」红
- [x] M2 把「已提交失败」也回滚 → 「已提交失败仍占窗口」红
- [x] M3 `release` 去掉 prev 一致性检查 → 「窗口已被覆盖不回滚」红
- [x] M4 抖动改双向 → 「抖动只增不减」红
- [x] M5 日配额判定移除 → 「日配额用尽被否决」红
- [x] M6 `decrDay` 去掉下限 0 → 「计数下限 0」红
- [x] M7 摘掉 `dailyStore` 注入 → 装配锁 2 红
- [x] M8 未登记平台 warn 改静默 → 「未登记出声一次」红
- [x] M9 平台档默认改回非 2 → 「平台档默认 2 分钟」红
- [x] M10 紧急放行去掉上限 → 「紧急放行上限」红
- [x] M11 `submittedAt` 判据恒真 → 阶段判据锁红
- [x] M12 摘掉成功路径自证（I4）→ 「成功而 submittedAt 为空报 error」红
- [x] M13 移除 `_quotaBlocked` 跳过 → 「不产生紧循环」红
- [x] M14 回滚后退避置 0 → 「最小退避」红

## 7. 门禁与交付

- [ ] 7.1 定向测试 + shared-utils 全量 + 桌面受影响面全量；eslint 0 error
- [ ] 7.2 QM-1 打包（`verify-worktree-deps` → electron-builder --dir → asar 清单 → require 链 → 启动 8s 捕获 stderr）
- [ ] 7.3 QM-4 视觉（进度面板/设置页有基线则跑；无基线以 DOM 行为锁承担并如实记录）
- [ ] 7.4 行尾对账（两口径 numstat）、品牌残留、文档同步、接线棘轮、债务熔断
- [ ] 7.5 QM-6 验证层双模型评审（`sh scripts/deep-review.sh`）+ findings 回写
- [ ] 7.6 PR → CI 全绿 → squash 自动合并 → 远程同步回填销账
- [ ] 7.7 记忆三路沉淀（内置 / `01-docs/learnings.md` / EverOS）+ 回读验证
