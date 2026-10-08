---
sync_reason: 远程同步 PENDING——PR #3176 开启中；合并后在状态列改写 PASS + merge SHA，并同一次提交删除 gate-record-debt-ledger.json 的登记项（回填与销账必须同一次发生）
sync_backfill_owner: agent（PR #3176 自动合并后回填）
---

# 头条排期上限取证与收窄（horizon-probe，2026-10-08）

## 任务与结论

用户指令：**调查确定头条真实的排期上限**。能力注册表里的 `maxHorizonDays: 30`
是我方假设值（未经验证），12 分钟对照实验已推翻「30 天超上限」的推测，需要真机取证。

**结论：头条定时发布的真实上限是 7 天（且 UI 宣称最少提前 2 小时）。
`maxHorizonDays` 已 30 → 7 收窄，全部校验层自动跟随。**

## 取证过程（全程只读，未提交任何内容）

UI 路线受阻的根因链（11 轮探针，probe-horizon7~13.cjs）：

1. 「定时发布」是 footer 三个按钮之一（预览 | **定时发布** | 预览并发布），
   不是 switch/checkbox —— 点它弹「定时发布 Modal」；
2. 弹层必须先通过表单基础校验（标题 + 正文非空）才出现；此前每轮探针只满足一半
   （v9 有正文没标题、v12 有标题没正文），按钮点了无反应；
3. React 受控 textarea 须经 Playwright `fill()` 注入（evaluate + execCommand 均不触发）。

**决定性证据改走 bundle 静态扫描**（probe-horizon13.cjs，fetch 页面加载的 JS 资源并正则）：

| 证据 | 出处（版本哈希可追溯） | 内容 |
|------|----------------------|------|
| 弹窗文案 | `graphic/7979.f3fa7c18e0.js`（1510KB） | 「请选择当前时间后 **2小时 至 7天** 进行定时发布」 |
| Popover | 同上 | 「最长支持**7天**」（`"最长支持".concat(7,"天")`） |
| 校验代码 | `graphic/publish.b8c90341ac.js`（222KB） | `ve.clone().add(2,"h").subtract(1,"minute")` ~ `.add(7,"d")`，越界报「请重新设置定时发布时间」 |

**下界（最少提前量）的实证边界**：平台前端宣称 2 小时，但日志
`app-2026-10-07.log` `14:56:54Z`（本地 22:56）提交、排期 23:08 —— **提前 12 分钟被平台
受理（code=0）**。故服务端真实下界远小于 2 小时；本仓维持 `minLeadMinutes: 5`
（比平台 UI 更严、安全侧，实测 12 分钟可过），只收窄上界。

## 改动清单

1. **真源**：`packages/shared-utils/src/platform-schedule-capability.json` 头条
   `maxHorizonDays: 30 → 7`。主进程 `assertWithinPlatformWindow`（scheduler.create、
   batch-manager）与渲染端 `validateScheduleEntries` 的平台分支自动收紧，无需改代码。
2. **回归锁**：`platform-schedule-capability.test.js` 新增「头条最大排期跨度 = 7 天」
   （注释含 bundle 出处与「禁止凭记忆改回」纪律）。
3. **同步既有测试**：`platform-schedule-time.test.js`（fixture + 2 断言）、
   `platform-schedule-create.test.js`、`scheduler.test.js`（用例名/断言 30→7）。
4. **UI 文案对齐（消除 hint 与校验漂移）**：新增 `effectiveScheduleMaxDays(platformIds)`
   与 `scheduleHintTextFor(platformIds)`（usePublishFieldSurface.js，纯函数导出 + 方法）。
   规则：全局 30 与所选支持平台 maxHorizonDays 取最严者；未选/全不支持 → 30（不支持平台
   由提交前能力门禁另行阻断）。Publish.vue：单篇 hint computed 跟随 selectedPlatforms、
   批量条目 `fieldSurface.scheduleHintTextFor(a.platforms)`；移除已无消费方的
   `PUBLISH_CONTRACT_LIMITS` import。此前 hint 恒显 30 天 —— 用户按 30 排期会被 7 天
   校验拒绝，正是本仓明令禁止的「文案与校验漂移」。
5. **新测试**：`schedule-capability-hint.test.js` 增 5 例（未选→30 / 全不支持→30 /
   头条→7 / 混未知 id→7 / 文案含 7 不含 30）。
6. **文档**：PRD §6.3.15.3 校验表（头条 7 天 + 取证出处）+ 新增「hint 与校验同源」小节。

## 不做什么

- 不改 `minLeadMinutes`（5 分钟安全侧，实测 12 分钟平台可受理）；
- 不改全局 `DEFAULT_MAX_SCHEDULE_DAYS = 30`（渲染端通用上限，平台分支已取 min）；
- 不动 capability 其余 14 个平台的 unsupported 声明（未取证，fail-closed 维持）。

## 验证

- shared-utils 39 文件 743 passed（10 skipped 为既有设计）；
- desktop 分批全量 11021 passed（features 445 + composables/utils/stores 1356 + electron 9220，0 失败）；
- 行尾对账：`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（13 文件）；
- 品牌残留 PASS、locale 成对 PASS、eslint 0 error、`check-pr-exec-record` OK；
- 变异反证：JSON 改回 30 → 契约测试红；8 天夹具精确命中平台分支。

## 远程同步

| 远程同步 | PENDING |
|--------|---------|
| PR | #3176（horizon-probe → main） |
| 回填约定 | 合并后本行状态列改写 `PASS` + merge SHA，并同一次提交删除 `scripts/gate-record-debt-ledger.json` 的登记项（回填与销账必须同一次发生） |

<!-- frontmatter 登记字段（sync_reason / sync_backfill_owner / sync_status）由 ledger 行承载：scripts/gate-record-debt-ledger.json 键「本次执行记录：头条排期上限取证与收窄 30→7（schedule-horizon-cap，2026-10-08）」 -->

## 复核路径
