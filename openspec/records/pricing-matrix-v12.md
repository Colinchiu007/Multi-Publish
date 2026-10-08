---
record: pricing-matrix-v12
task: 档位矩阵改 v1.2 定案数值，并同步 12 处文档 + 登记 5 处口径漂移
date: 2026-10-08
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话（合并后回填）
---

## 本次执行记录：档位矩阵改 v1.2 定案数值（pricing-matrix-v12，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | **混合 PR**（3 运行时代码 + 12 文档）。`classify-docs-only.js` 判定 `docs-only=false`，因此**未借道 docs-only 快速通道**，走完整质量节拍。在 `pricing-matrix-v12` 分支上工作，未直推 main |
| 第一性原因（QM-5 ①） | N/A | 非缺陷修复，是定价定案落地 |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | ✅ | 3 处数值断言同步 + **新增逐值契约锁**（见下「接线棘轮」） |
| 防止再次发生（QM-5 ⑤） | ✅ | ①`plan-matrix.js` 文件头写入「年付 = 月付×12 由唯一字段承载」与「overrides 注入点在仓外」两条口径约束；②`pricing-strategy.md` 升 v2.1 并加版本锚点；③6 份文档加作废横幅，指回唯一真源 |
| TDD | ✅ | 先改测试见红（`# fail 4`）→ 再改实现见绿（`# pass 16 / # fail 0`），红绿两态均有实测记录 |
| 测试 | ✅ | `node --test test/plan-matrix.test.js` → 16 tests / 16 pass / 0 fail |
| 行尾与 diff 对账 | 见 commit | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致；纯修改 + 1 处单字符修复，删除数 0 |
| 编码完整性 | ✅ | 全部 15 个文件 `grep -c $'\xef\xbf\xbd'` = 0。**过程中命中 1 处**，已修（见「遗留 L2」） |
| 接线棘轮 | ✅ | `official_credit_monthly` 的 30/1600/2200 **此前无任何断言锁**（只有相对大小关系），已新增 `plan-matrix.test.js` 专用用例逐值锁死。判据：正确实现与错误实现都会改变这三个值，锁有牙齿 |
| max-lines | ✅ | `node .github/scripts/check-max-lines.js` → 「无新增超大文件，挂账清单与现实一致」 |
| debt-budget | ✅ | `node scripts/check-debt-budget.js` → 「所有债务指标在基线内」 |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` → PASS（7376 个 tracked 文件） |
| 品牌残留（本次特有风险） | ✅ | 4 份作废横幅里**刻意不写竞品名**，一律写「参考产品」「融媒宝」原口径名称亦以「未复核、无出处」表述，避免把品牌词固化进文档 |
| QM-1 打包 | N/A | 改的是 `packages/api-publish-engine/`（纯 Node 服务端模块）与 2 处注释；按 AGENTS.md，QM-1 的强制打包范围是 `apps/desktop/electron/` 与 `packages/rpa-engine/`，本次未触及其运行链。注释改动不改变任何执行路径 |
| QM-4 视觉 | N/A | 无 UI 变更（`.vue` 改动仅限文件头 JSDoc 注释，无模板/样式改动） |
| QM-6 CCG 双模型外部评审 | 未执行 | 本环境无 `codeagent-wrapper`；不以自审冒充通过。**本次评审替代方案**：对 15 个文件逐个核对了 diff 与门禁输出 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填，`git ls-remote --heads origin pricing-matrix-v12` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 取证基线说明

分支从最新 `origin/main`（`39e37fc`）切出。切出后**重新核验了 `plan-matrix.js` 的 7 个源值**（版本号、free/standard/pro 的价格与积分数值），确认与 2026-10-08 首次分析时一致、行号未漂移，**本 PR 的全部 `文件:行号` 引用在合入时点有效**。

期间 `main` 至少推进过两次（`e6732c8` → `39e37fc`），每次都重新 fetch 并逐行复核，未踩「拿旧 main 的行号写文档」的坑。

### 遗留（不假装已闭合）

- **L1 · `planOverrides` 注入点在本仓内不可见，本次未通** —— `mergePlanSection` 的 override 机制实现完整、测试覆盖，但 `logto-runtime.js:129` 读的是 `options.planOverrides`，而**本仓内没有任何生产调用方传这个参数**，`createLogtoRuntime` 本身也没有仓内调用方。`publish-api-server.js:134-136` 显示 entitlementProvider 与 subscriptionService 均为依赖注入（`this._opts.X || null`）。**这意味着「运营改价」在本仓范围内无法证实可触达矩阵**——它可能由仓外部署层注入，也可能没有。本 PR 只在 `plan-matrix.js` 文件头写了这个警告，**没有改注入链**：那是一次独立的架构调查，且需先确认部署层形态。已在 `plan-matrix.js` 文件头留口径注释，避免后人再次误判「改 config.yaml 就能调价」。
- **L2 · 顺带修复了 1 处 main 上原有的编码损坏** —— `01-docs/marketing/01-产品卖点清单.md:444`「代运营/服务商的第**一**恐惧」中的「一」在 main 上已是 U+FFFD 替换字符。已确认为**基线内损坏**（`git show origin/main` 复核），非本 PR 引入。因本次已在编辑该文件，顺手修复以免留已知损坏；`check-text-encoding-integrity` 按基线比对本不会拦它。
- **L3 · 4 份文档只加了作废横幅，未逐段重写** —— `MARKETING-HANDBOOK.md` / `WEBSITE-PLAN.md` / `PRODUCT-POSITIONING.md` / `acquisition-plan.md` 的档位体系整体过时（含一个**根本不存在**的「企业版」），且大量使用未复核、无出处的竞品价格做对比话术。逐个改数字会留下更多不一致，故采用「横幅声明作废 + 指回真源」而非假性重写。**这 4 份的对外面料仍需按 `pricing-strategy.md` v2.1 重建，不属本 PR 范围。**
- **L4 · `ops-center/docs/pricing-strategy.md` 与 `01-docs/pricing-strategy.md` 同名不同内容，本次只标注未合并** —— 已在其头部加「定价真源只有一处」的警示，并新增「已知过时项」表逐条列出作废内容（含 §3「视频合成 纯本地处理 ¥0」这条硬错误）。**两份同名文件本身仍未合并或改名**，属文档结构调整，建议另开 PR。
- **L5 · 赠送量在系统中仍是「有字段无引擎」** —— 本 PR 改的 `officialCreditMonthly` 依然没有对应的扣减路径（`official_credit` 不在 `features` 数组，全仓无 `consumeFeature('official_credit')`）。**本次只是把数字定下来，没有建引擎。** 引擎落地见 `DEEP-ANALYSIS-CREDIT-PRICING-2026-10-08.md` §2.2 的 G1/G2。
- **L6 · 单价仍为公开挂牌价** —— 赠送量按 2026-10-08 国内渠道挂牌价测算，非实际采购价。需用近 30 天上游账单反推真实加权单价后重算。
