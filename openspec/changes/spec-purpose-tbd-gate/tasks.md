# Tasks: spec-purpose-tbd-gate

## 1. 判据先行（TDD）

- [x] 1.1 先写 `scripts/check-spec-purpose.test.js`：四类违规各一条（TBD / 缺段 / 空段 / 只有空白）、
      **两条空集出口各一条**（目录不存在、目录存在但零 spec.md）、规模下界、占位词语义档、
      `changes/` 增量目录不得入域、真实仓库形状锁、两条接线结构锁、`.gitignore` 放行锁
- [x] 1.2 实跑取 RED：`node --test scripts/check-spec-purpose.test.js` ⇒ `Cannot find module './check-spec-purpose.js'`
      / `MODULE_NOT_FOUND`、`tests 1 / pass 0 / fail 1`（实现不存在时测试必须自己红，不能静默跳过）

## 2. 实现

- [x] 2.1 `scripts/check-spec-purpose.js`：逐行扫描取 Purpose 正文（**不用带 `m` 的多行正则**，理由见文件头注释）、
      占位词按语义特征只看正文开头、两条空集出口抛错、`DEFAULT_MIN_SPECS=50` 规模下界、
      读不动的文件计入 `unreadable` 并作为违规（禁止 `catch{continue}`）
- [x] 2.2 导出可注入的 `check({root,minSpecs})` / `collect` / `evaluatePurpose` / `purposeBodyOf`，
      使测试能对临时夹具跑真判据（不是读源码断言"应该有"）
- [x] 2.3 失败文案给**正解方向**（补一句能从该文件逐字复核的 Purpose），并明确"不要靠放宽判据让它闭嘴"

## 3. 接线

- [x] 3.1 `.github/workflows/quality-gate.yml` 新增 **Gate 12d - Spec Purpose presence (changes job)**，
      紧跟 Gate 12c，`node --test` 与判据脚本同 step 点名
- [x] 3.2 `.gitignore` 补 `!scripts/check-spec-purpose.js`（`!scripts/*.test.js` 已有，测试按模式放行）
- [x] 3.3 三条结构锁钉住"位置前提"：住在 changes job / 排在 classify 之后 / 不得同时接进 static-gates

## 4. 反证（每条都要实跑，且收尾断言逐字节还原）

- [x] 4.1 M1 `evaluatePurpose` 恒判合规（门禁 no-op）⇒ 红 4 条，含 TBD 档 ⇒ PASS
- [x] 4.2 M2 正文提取退回带 `m` 的多行正则 ⇒ 红 2 条（含"真实仓库不得判 EMPTY"）⇒ PASS
- [x] 4.3 M3 "扫描域为空"改 `return ok:true` ⇒ 红 1 条（第二条空集出口锁）⇒ PASS
      —— **这条首跑是 `NOT_RED`**：当时只有"目录不存在"有锁，暴露了覆盖洞，补测试后同一变异立刻变红
- [x] 4.4 M4 `DEFAULT_MIN_SPECS` 改 0 ⇒ 红 1 条 ⇒ PASS
- [x] 4.5 M5 把整块 step 复制到 `classify` 之前 ⇒ 结构锁红 1 条 ⇒ PASS
- [x] 4.6 M6 删 `.gitignore` negation ⇒ `check-ignore` 锁红 1 条 ⇒ PASS
- [x] 4.7 M7 从 step 里摘掉 `node --test` 点名 ⇒ 结构锁红 ⇒ PASS
      —— 这条首跑是 `ANCHOR_NOT_FOUND`：needle 手拼 `'\n'` 而 workflow 是 CRLF；改为**从文件运行时取行**后成立
- [x] 4.8 全部变异 `restored_byte_identical=true`，且跑完 `git status --porcelain` 只剩本次四个真实改动文件

## 5. 交付

- [x] 5.1 `node scripts/check-spec-purpose.js` 在真实仓库：`扫描 151 份主规格，违规 0` rc=0
- [ ] 5.2 QM-6 双模型外部评审（混合 PR + 新增门禁），发现逐条处置并落盘原件
- [ ] 5.3 PR → CI 全绿 → 按 AGENTS.md 判据自动 squash 合并 → 同一次提交回填远程同步并删 `sync_*`
- [ ] 5.4 归档 `openspec archive spec-purpose-tbd-gate`（归档后本 change 自己会写 `TBD` 到新增规格 ——
      正是这条门禁的活体测试场景，须确认归档产出的主规格 Purpose 已填）
