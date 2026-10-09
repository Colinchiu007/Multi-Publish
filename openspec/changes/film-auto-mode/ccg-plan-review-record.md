# CCG 决策层对抗评审记录 · film-auto-mode

> 评审对象：影视工程自动模式 + 三标签方案 ｜ 引擎：`scripts/plan-review.sh`（adversarial-review-loop）
> 判定器：`scripts/ccg-review-decider.js` → **DUAL**（proposer=opencode，critic=claude，跨家族）
> 基线 `main@f493e7ec6` ｜ 全部原始产物在 `.adversarial/ccg-plan-*/`（未入库）

## 一、四次运行与轨迹

| 运行 | 评审对象 | 规模声明 | 结果 |
|---|---|---|---|
| R1 | `01-docs/PRD-FILM-AUTO-MODE-2026-10-09.md`（19857 字符） | 未声明→按文档体量 296 行 | critic 8 条（**Critical 1**，min 分 5）→ **修订失败**：opencode 单次输入上限 7800 字符 |
| R2 | `openspec/changes/film-auto-mode/review-brief.md` v1（2031 字符） | 预计改动 1800 行 / 14 文件 → DUAL | 轮1：8 条（Critical 2，min 6）；开放修订成功（采纳 7/部分 1）；轮2：8 条（**Critical 3**，min 5）→ **分数回退，回滚**；裁决 `blocked` |
| R3 | 同文件 v2（3156 字符） | 同上 | 轮1：8 条（Critical 2，min 5）；修订成功（采纳 8）；轮2：8 条（Critical 2，min 5）→ 修订触长度墙（8216 > 7800）；未收敛 |
| R4 | 同文件 v3（2001 字符，聚焦成本/安全契约） | 同上 | 轮1：8 条（Critical 1，min 4）→ 采纳 8；轮2：8 条（Critical 2，min 6）→ 采纳 7/部分 1；轮3：3 条（**Critical 0**）→ 分数回退至 min 2，回滚到轮 2 最好版；**裁决 `needs_revision`＝无 Critical、可动手** |

## 二、裁决

```
决策层裁决: needs_revision
  跑满 3 轮：无 Critical，但有 0 条 High 级问题未解决——可以动手
  → 可动手：无 Critical，剩余为 High 级建议项，建议按最后一轮 critique 补强
```

**已按最后一轮 critique 补强**（对应 `design.md` 决策）：

| 批评 | 处置 |
|---|---|
| R2-i1/i2 额度计数器并发竞态与双计 | D25：门禁判定"镜头集合"而非调用额度；`providerCalls` 降级为观测计数器，派发前原子自增，崩溃窗口差值如实暴露 |
| R2-i3 载荷哈希缺分镜指纹 | D26：`payloadHash` 纳入每镜 `(shotId, promptHash, seconds, refPaths)` 序列 |
| R2-i4 planId 缺参考图/provider | D26：`planId` 参与位加入 `refsFingerprint` 与 `providerId` |
| R2-i5 / R3-i3 overwrite 与审计链 | D27：overwrite 只覆盖计划与项目文件，旧确认与台账归档为 `archive/<runSeq>/`，新段记 `supersededBy` |
| R2-i6 注入 probe 是否被旁路 | D29：源码取证 `production-driver.js:91-103,116-142` 证明跳过判定唯一入口是注入 probe；补回归用例 |
| R2-i7 providerCalls 真源归属 | D25/D30：计数器在 project.json（派发前写），台账为执行真源，二者差值由 `auto-status` 如实暴露 |
| R2-i8 无全局上限 / EXPIRED 标准未定义 | D28：自动模式**单飞**（`AUTO_TASK_BUSY`）+ EXPIRED 三条件明确定义 |
| R3-i1 只验指纹不验产物 | D30：续跑跳过的镜增加"大小 > 0" + 最多 3 镜 `ffprobe` 抽样 |
| R3-i2 in-flight 悬挂无收敛 | D30：`probe` 判定 + `production-driver.js:207-215` 既有归一语义，无需人工干预 |
| R1-i1 classic 路由可行性 | **D24 反驳+改设计**：`route-registry.js:13-14,26` 支持 redirect 且有 3 处先例；但 `useTabDocumentTitle.test.js:69` 锁定「非 redirect 路由数 ≥32」，改 redirect 会削弱棘轮 ⇒ **改为不重定向**（保留无标签直达页），零门禁放宽 |
| R1-i2/R2 计划归属越权 | D17/D26：planId 由服务端派生并内嵌归属 + 载荷哈希复核 |

## 三、环境限制（如实记录，不掩盖）

1. **`opencode` 单次输入上限 ≈7800 字符**（实测边界 `(8125, 8145]`）：方案超过该限时 proposer 侧**同步拒绝**（~120ms、exit 1、无错误输出）。故 R1/R3 的修订环节未能执行，R1 直接 `blocked`。
2. 应对：把评审对象**拆分/精简**（19857 → 2001 字符），把"给人看的"内容（历史轨迹、意见对应表）移出评审对象；R4 因此跑满 3 轮并达成 **Critical 0**。
3. **critic 侧（claude）不受长度限制**，四轮共 27 条 findings 全部有据可读。
4. 评审存在**修订漂移**：opencode 的修订稿曾自创本方案未含的概念（"每 24 镜一段""合并镜 k×s 缩放""额度计数器"），导致 R2/R3 的部分批评针对的是修订稿而非原设计——已在 D25/D8 明确"非设计"清单，并在 R4 简报中显式声明。

## 四、结论

- **决策层门禁通过**：无 Critical，可进入实现（本仓口径：`plan-review.sh` 裁决 `可动手`）。
- 19 条有效批评全部处置（采纳 17 / 有证据反驳并改设计 2）。
- 验证层复评（`deep-review.sh`）留待实现完成后执行（见 `tasks.md` 7.6）。
