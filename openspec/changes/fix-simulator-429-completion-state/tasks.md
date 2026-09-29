# Tasks: fix-simulator-429-completion-state

## 1. 取证（已完成，先记录以免被当成事后补的 justification）

- [x] 1.1 四档饥饿探针实测「完成顺序是否被推迟打乱」：8/8 饥饿样本顺序不变（lag 最高 3908ms，
      同批 maxc 已 = sim+1），对照 3/3 无饥饿同样不变 ⇒ 顺序可当硬判定，前提为「各组时长统一」。
      探针文件跑完即删，未进仓。
- [x] 1.2 确认模拟器的第三处分歧（429 槽位占用时长 ≈0ms vs `duration`）在当前参数下不可见，
      已登记于 #2626 评论 §2，本 change 不越范围修。
- [x] 1.3 读全 `runParity` 与注入分支，确定「只改身份标签、不动堆/额度/墙钟」的四项清单（design §D2）。

## 2. 先写测试（RED）

- [x] 2.1 `ops-center/backend/tests/test_scheduler_simulator.py`：修正被钉成契约的断言
      （`states.count("rate_limited")` 3→4、`completed` 5→4）**实跑 RED=2 → GREEN**，并新增
      `test_injected_429_is_not_completed_but_keeps_accounting`：注入条目 `state == "rate_limited"`、
      `finished_at is None`，且 `max_concurrent_observed` / `total_duration_ms` / `rate_limited_count`
      / `cooldown_count` 四项与修正前登记值逐项相等（钉住"只改标签"这条边界）。
- [x] 2.2 `scripts/compare-scheduler-models.test.js`：为「顺序比较按逐元素而非长度」补真值表
      （长度同内容不同 ⇒ 不等；空序列相等；非数组 fail closed）。
- [x] 2.3 `apps/desktop/electron/tests/test_scheduler_parity.test.js`：把过渡断言（锁"分歧存在"）
      替换为「inject-429 两侧序列相等 + `checks.completion_order === true`」—— 本步在实现前写，
      实测 RED=2（python 侧 2 条）后转 GREEN。
- [x] 2.4 实跑并记录 RED 现场：`cd ops-center/backend && pytest tests/test_scheduler_simulator.py`
      与 `node scripts/compare-scheduler-models.test.js` 的失败条数。

## 3. 实现（GREEN）

- [x] 3.1 `ops-center/backend/services/scheduler_simulator.py` 注入分支：`state = "rate_limited"`、
      `finished_at = None`；`finish_heap` / `executing_now` / `used_5h` / `end_times` 四项**逐字不动**，
      并在代码注释里写明"为何不动"与指向 D3（占用时长分歧登记在 #2626，不得顺手合并修）。
- [x] 3.2 `scripts/compare-scheduler-models.js`：把 `completion_order` 并入 `checks`；
      打印行去掉「未计入 pass」，改为输出两侧序列本身。
- [x] 3.3 复跑 2.1–2.3 三处测试转 GREEN；`node scripts/compare-scheduler-models.js` 须 `PARITY OK`
      且不再出现分歧行。

## 4. 反证（每条必须实跑并记录变红条数）

- [x] 4.1 只把 `state` 改回 `completed`（留 `finished_at=None`）⇒ 必须红（证明两个字段各自承重）。
- [x] 4.2 完整回退注入分支 ⇒ `completion_order` 硬判定必须红。
- [x] 4.3 从 `checks` 摘掉 `completion_order` ⇒ node 真值表 + vitest 必须红。
- [x] 4.4 顺序比较退化为「只比长度」⇒ 新增真值表必须红。**实跑：红 1**（两条顺序断言同在一个 `it` 里，
      所以 1 才是对的；原写"≥2 红"是我按断言条数预估而非按 `it` 计数）。
- [x] 4.5 越范围把 `finish_heap` push 也摘掉 ⇒ D2 的四项指标锚定用例必须红（证明"只改标签"这条边界有人在守）。
- [x] 4.6 每条变异施加后断言字节还原一致（实跑：4.1→2 红、4.2→vitest 1 红、4.3→vitest 1 红、4.4→node 1 红、4.5→11 红、FIFO 退回 1..N→1 红；六个文件的还原校验全部 PASS）；harness 锚点命中数 ≠ 1 即 abort（锚点未命中不等于锁没守住）。

## 5. 文档与规格

- [x] 5.1 `docs/parity-concurrency-measurement-noise.md` 新增一节：四档饥饿实测表 +
      「顺序前提 = 时长统一」+ 失效条件，并把 #2632 那条过渡守卫的删除写进变更史。
- [x] 5.2 主 spec `openspec/specs/desktop/model-call-observability/spec.md` 与增量对齐
      （完成顺序进硬判定 + 前提/边界 + 新增 3 个 Scenario，删除 #2626 过渡 Scenario）。
- [x] 5.3 `openspec validate fix-simulator-429-completion-state --strict` 通过。
- [x] 5.4 CHANGELOG 收口（按 CRLF 纪律：`git show origin/main:CHANGELOG.md` 为底 + 只插我的节）。
- [ ] 5.5 `.quality-gates.md` 执行记录**与代码同 PR**（#2632 那次欠了一次，这次不欠）。

## 6. 门禁与交付

- [ ] 6.1 `node scripts/classify-docs-only.js` 必须判 `false`（混合 PR），走完整质量节拍。
- [x] 6.2 行尾对账：`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐文件一致。
- [ ] 6.3 `node scripts/check-no-brand-residue.js`、`bash scripts/check-docs-sync.sh --base=main --head=HEAD`、
      `node scripts/check-gate-record-debt.js`、`node scripts/check-max-lines.js`、
      `node scripts/check-unwired-tests.js`、`node scripts/check-step-failfast.js` 全过。
- [ ] 6.4 QM-1 打包：本 change **不触碰** `apps/desktop/electron/` 运行时代码
      （只改 `apps/desktop/electron/tests/*.test.js`），如实判 N/A 并给 `--name-only` 证据。
- [ ] 6.5 QM-6 双模型评审（后端=逻辑/规格合规，前端=集成风险），Critical 修完才提 PR。
- [ ] 6.6 ops-center 后端门禁 `cd ops-center/backend && pytest`（全量，不只单文件）；
      前端未改动，`npm run build` 判 N/A 并给证据。
- [ ] 6.7 提 PR、挂 squash auto-merge、合并后核对内容与 #2626 关闭状态。

## 7. 交付后必须留下的可核验事实（不得凭记忆填写）

- [x] 7.1 四档饥饿实测表已进 docs（数字逐条取自探针 stdout：lag 301/300、812/810、1905/1904、3908/3906，maxc 均为 sim+1，顺序 8/8 不变）（数字来自探针 stdout，不是复述）。
- [ ] 7.2 六条变异各自的变红条数写进 `.quality-gates.md` 与 PR 描述。
- [ ] 7.3 PR 里明确声明：D3/D4 两处已知分歧**未修**及判据（避免读者以为一并收了）。
