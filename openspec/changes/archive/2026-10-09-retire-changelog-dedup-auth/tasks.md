# Tasks：退役已消费的 CHANGELOG 去重授权

## 处置对账（2026-10-09，**以本表为准**；下方原始勾选是写案时的计划，未随实现回填）

| 原计划 | 处置 | 现场证据 |
|---|---|---|
| 1.1–1.3（抽 `evaluateRetirement` 纯函数 + 接在授权通路之前 + 输出 `retired:true`） | **以另一形态落地**，非本文件所述位置 | PR #3151（merge `a3565726`）在 `evaluateAuthorization` 内部加祖先判据；`check-changelog-growth.js:187-210` 现返回 `{granted:true, retired:true, retiredReason}`；形状与额度核对仍在 `collect` 层（同文件 340-372 行），**没有**新增独立纯函数 |
| 2.1–2.6（真实 blob 回放 + 四条变异反证） | **已被 5 条行为用例覆盖，但不是原计划的 6 条** | `scripts/check-changelog-growth-retire.test.js`：祖先成立⇒granted+retired / 非祖先⇒维持 fatal / 数字对不上⇒下游卡 / `authBaseText` 非 null⇒维持防白蹭 fatal / 同坐标⇒走原通路（非 retired）。原 2.2「base 已是单副本形状⇒不触发」在本方案下**不适用**（判据不看形状新旧，看坐标系），原 2.5「head 缺 base 的某标题⇒不放行」由默认判据 + `checkDedupShape` ① 覆盖 |
| 3.1 删除授权文件 | **本 PR 完成** | `git rm scripts/changelog-dedup-authorization.json`；删除前后测试对照：删前新锁红（31 pass / 1 fail）、删后 **37 pass / 0 fail** |
| 3.2 测试改为退役条款用例 | **本 PR 以另一形态完成**：不改既有用例，而是新增**两条生命周期锁** | `check-changelog-growth.test.js` 末尾新增「一次性去重授权不得作为常驻文件留在仓库里」+「退的是授权件不是通路：常量/生成器/校验函数三样都必须在」；既有 30 条断言一字未动（32→34 条，两文件合计 35→37）；变异反证两条均实测变红（放回文件⇒锁1红；改 `AUTH_PATH` 字面量⇒锁2红），还原后 `AFTER_RESTORE_GREEN` |
| 4.1 `dedup-changelog-history/tasks.md` 追加收尾节 | **本 PR 完成** | 见该文件新增「## 6. 收尾：授权件的生命周期结束」 |
| 4.2 本 change 归档 | **本 PR 完成**（以"决策对账"形态归档，delta 规格**从未进主规格**） | `git mv` 至 `openspec/changes/archive/2026-10-09-retire-changelog-dedup-auth/`；因为 3b 未实施，其 `specs/changelog-growth-retirement/spec.md` 不得被应用——归档时**不走** `openspec archive`（它会应用 delta 并写出仓库里并不存在的判据），只做目录搬迁 + 顶部决策节 |
| 5.1–5.4 验证与记录 | **本 PR 完成**（5.3 的 #3076 坐标复放改判为"不适用"，见下面遗留） | `openspec/records/retire-dedup-auth-file.md` |

### 因此仍然遗留

- 原 5.3「用 #3076 的真实坐标（base `f210f191`/head `e94f1c18`）复放门禁，确认放行」**不再复放**：#3076 已 MERGED，
  且按 #3151 落地的判据，它的放行凭据是"祖先成立 + 形状四条 + 额度数字全对"，而不是本 change 设想的 3b。
  拿一个已合并的旧坐标去复放一条已换形的判据，得到的绿不说明任何事。
- 3b 那套"按清理前后形状放行"的判据**未实现也不该实现**：它放宽的是门禁，而其要防的死锁已被
  坐标系祖先判据与 re-sync 双重解决。若将来真的出现"两侧都无授权文件且形状像清理前后"的场景，
  正确做法是那次清理自己带一份新授权文件（`changelog-dedup-regen.js` 生成），而不是给门禁加免检通道。


## 1. 判据实现

- [ ] 1.1 把退役判定抽成纯函数 `evaluateRetirement({ baseRawText, headRawText, authBaseText, authHeadText })`
      → `{ retired: boolean, reason: string, shape?: { baseTitles, headTitles, baseCopies } }`
      （`scripts/check-changelog-growth.js`，与 `evaluateAuthorization` 同级导出）
- [ ] 1.2 在默认判据红之后、授权通路之前接入（design 的判定流 3b）
- [ ] 1.3 通过时输出 `retired: true` + 形状计数

## 2. 测试（真实 blob 回放）

- [ ] 2.1 用例：base=`23822b73fecc` + head=`88669579b1dc`、均无授权文件 ⇒ 放行
- [ ] 2.2 用例：base 已是单副本形状 ⇒ 不触发（走默认判据）
- [ ] 2.3 用例：head 出现多副本 ⇒ 不放行
- [ ] 2.4 用例：base 含授权文件 ⇒ 不触发
- [ ] 2.5 用例：head 缺 base 的某标题 ⇒ 不放行
- [ ] 2.6 变异反证：①②③④ 逐条去掉，对应用例转红

## 3. 授权退役

- [ ] 3.1 删除 `scripts/changelog-dedup-authorization.json`
- [ ] 3.2 `check-changelog-growth.test.js` 中依赖该文件存在性的用例改为退役条款用例
      （既有 11 条默认判据断言一字不动）

## 4. openspec 收尾

- [ ] 4.1 `dedup-changelog-history/tasks.md` 追加收尾节：授权已消费、由本 change 退役
- [ ] 4.2 本 change 归档时同步标注 `dedup-changelog-history` 完成

## 5. 验证与记录

- [ ] 5.1 `node --test scripts/check-changelog-growth.test.js` 全绿（含新增用例）
- [ ] 5.2 变异反证记录（四条判据逐条去除断言转红）
- [ ] 5.3 用 PR #3076 的真实坐标（base `f210f191`/head `e94f1c18`）复放门禁，确认放行
- [ ] 5.4 执行记录 `openspec/records/` + CCG 双模型评审 + 行尾对账