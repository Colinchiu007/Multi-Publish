# Tasks: spec-purpose-tbd-gate

## 1. 判据先行（TDD）

- [x] 1.1 先写 `scripts/check-spec-purpose.test.js`：四类违规各一条（TBD / 缺段 / 空段 / 只有空白）、
      **两条空集出口各一条**（目录不存在、目录存在但零 spec.md）、规模下界、占位词语义档、
      `changes/` 增量目录不得入域、真实仓库形状锁、接线结构锁、`.gitignore` 放行锁
      —— **终态 23 条**：初版 15 条，QM-6 之后 +8（逐段判 / 标题层级 / BOM / 谓词层域锁 / 占位词负控 /
      CLI 两条 / 提取器自证），见第 6 节
- [x] 1.2 实跑取 RED：`node --test scripts/check-spec-purpose.test.js` ⇒ `Cannot find module './check-spec-purpose.js'`
      / `MODULE_NOT_FOUND`、`tests 1 / pass 0 / fail 1`（实现不存在时测试必须自己红，不能静默跳过）

## 2. 实现

- [x] 2.1 `scripts/check-spec-purpose.js`：逐行扫描取 Purpose 正文（**不用带 `m` 的多行正则**，理由见文件头注释）、
      占位词按语义特征只看正文开头、两条空集出口抛错、`DEFAULT_MIN_SPECS=50` 规模下界、
      读不动的文件计入 `unreadable` 并作为违规（禁止 `catch{continue}`）
- [x] 2.2 导出可注入的 `check({root,minSpecs})` / `collect` / `evaluatePurpose` / `purposeBodiesOf` /
      `violationsOf` / `isSpecFile`，使测试能对临时夹具跑真判据（不是读源码断言"应该有"）
      —— 初版导出的是 `purposeBodyOf`（单数、只取第一段），QM-6 B1 后改为复数 + 违规清单
- [x] 2.3 失败文案给**正解方向**（补一句能从该文件逐字复核的 Purpose），并明确"不要靠放宽判据让它闭嘴"

## 3. 接线

- [x] 3.1 `.github/workflows/quality-gate.yml` 新增 **Gate 12d - Spec Purpose presence (changes job)**，
      紧跟 Gate 12c，`node --test` 与判据脚本同 step 点名
- [x] 3.2 `.gitignore` 补 `!scripts/check-spec-purpose.js`（`!scripts/*.test.js` 已有，测试按模式放行）
- [x] 3.3 三条结构锁钉住"位置前提"：住在 changes job / 排在 classify 之后 / 不得同时接进 static-gates
      —— QM-6 B6/B7/F9 后改为：step 由**语义标题**定位、命令必须在**该 step 正文**内、注释行不参与判定，
      并另加一条「提取器自证」锁防提取器退化成恒真；锚点集中登记在 `ANCHOR` 一处

## 4. 反证（每条都要实跑，且收尾断言逐字节还原）

- [x] 4.1 M1 `evaluatePurpose` 恒判合规（门禁 no-op）⇒ 红 9 条，含 TBD 档 ⇒ PASS
- [x] 4.2 M2 正文提取退回带 `m` 的多行正则 ⇒ 红 6 条（含"真实仓库不得判 EMPTY"）⇒ PASS
- [x] 4.3 M3 "扫描域为空"改 `return ok:true` ⇒ 红 1 条（第二条空集出口锁）⇒ PASS
      —— **这条首跑是 `NOT_RED`**：当时只有"目录不存在"有锁，暴露了覆盖洞，补测试后同一变异立刻变红
- [x] 4.4 M4 `DEFAULT_MIN_SPECS` 改 0 ⇒ 红 1 条 ⇒ PASS
- [x] 4.5 M5 把整块 step 复制到 `classify` 之前 ⇒ 结构锁红 2 条 ⇒ PASS
- [x] 4.6 M6 删 `.gitignore` negation ⇒ `check-ignore` 锁红 1 条 ⇒ PASS
- [x] 4.7 M7 从 step 里摘掉 `node --test` 点名 ⇒ 结构锁红 2 条 ⇒ PASS
      —— 这条首跑是 `ANCHOR_NOT_FOUND`：needle 手拼 `'\n'` 而 workflow 是 CRLF；改为**从文件运行时取行**后成立
- [x] 4.8 全部变异 `restored_byte_identical=true`，且跑完 `git status --porcelain` 只剩本次真实改动文件
      （初版跑时为 2 个 M 档文件；QM-6 之后终态为 2 个 M 档 + 已提交的 8 档，共 10 档在 diff 里）

## 6. QM-6 之后的补充反证（8 格，与 4.1–4.7 同驱动同纪律）

- [x] 6.1 M8 `purposeBodiesOf` 只返回第一段（B1 的洞）⇒ 「第二个 Purpose 段」用例红 ⇒ PASS
- [x] 6.2 M9 不剥前导 BOM ⇒ 「前导 BOM」用例红 ⇒ PASS
      —— **这条首跑是 `NOT_RED`**：当时的样本是 `BOM + H1 + ## Purpose`，BOM 只污染 H1，
      而判据不看 H1 ⇒ 变异与不变异行为相同。改成「BOM 直接压在 `## Purpose` 标题行上」才打出真路径，
      并另钉一条"BOM 在 H1 前时本来就不受影响"，防止把这条修描述成"救下 151 份"
- [x] 6.3 M10 接线锁不再剥注释（B6）⇒ 「提取器自证」红 ⇒ PASS
- [x] 6.4 M11 CLI 入口不转发 argv（F6/F7/F8 的总开关）⇒ 两条 CLI 用例红 ⇒ PASS
      —— 这是本轮最贵的一格：`main(argv)` 无形参缺省而入口写 `process.exit(main())`，
      `parseArgs(undefined)` ⇒ 按"零参数"跑 ⇒ **所有命令行选项静默失效**
      （`--help` 也照常扫全仓并 rc=0）。前 7 格反证一格都打不到它，是新增的 CLI 用例把它打红的
- [x] 6.5 M12 畸形数值静默按缺省跑（F6 成因）⇒ 「畸形数值一律 rc=2」红 ⇒ PASS
- [x] 6.6 M13 排除口径退回路径段名（B9）⇒ 「能力目录恰好命名为」红 ⇒ PASS
- [x] 6.7 M14 标题层级退回只认 `##`（B2）⇒ 「Purpose 标题层级」红 ⇒ PASS
- [x] 6.8 M15 占位词表清空 ⇒ 阳性样本失去保护 ⇒ 红 14 条 ⇒ PASS（证明负控不是靠放宽判据换来的）
- [x] 6.9 终态：`VERDICT=ALL_PASS`，15 格全 `restored_byte_identical: true`，跑完 `git status` 只剩 2 个 M 档

## 5. 交付

- [x] 5.1 `node scripts/check-spec-purpose.js` 在真实仓库：`扫描 151 份主规格，违规 0` rc=0
- [x] 5.2 QM-6 双模型外部评审（混合 PR + 新增门禁）：23 条发现（后端 11 含 2 CRITICAL / 工程 12 含 3 MAJOR），
      逐条处置见 `openspec/records/spec-purpose-tbd-gate.md` 的「QM-6 发现处置」节；
      原件落盘 `.tmp/qm6/out-backend.txt`（19,528 B）与 `.tmp/qm6/out-frontend.txt`，评审对象钉 `68c4010d9`
- [x] 5.3 PR → CI 全绿 → 按 AGENTS.md 判据自动 squash 合并 → 同一次提交回填远程同步并删 `sync_*`
      —— PR #3099 → merge `28f9d5143`；attempt 1 的唯一红格经定性为环境型（`python simulator failed:`
      空输出 = `status=null` 两型之一），`rerun --failed` 后 attempt 2 全绿；回填与销账发生在同一次提交
      （本文件 5.3 勾选 + 记录远程同步行改 PASS + frontmatter 三个 `sync_*` 字段删除）
- [ ] 5.4 归档 `openspec archive spec-purpose-tbd-gate`（归档后本 change 自己会写 `TBD` 到新增规格 ——
      正是这条门禁的活体测试场景，须确认归档产出的主规格 Purpose 已填）
