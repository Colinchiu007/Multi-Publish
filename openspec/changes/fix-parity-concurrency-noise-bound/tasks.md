## 1. 先把判据变成可红的锁（TDD：测试先于实现）

- [x] 1.1 在 `apps/desktop/electron/tests/test_scheduler_parity.test.js` 新增**判据合同**用例：以纯数据喂判定函数（不跑真实时钟），断言 `real == sim` 通过、`real == sim + 1 且 ≤ maxConcurrent` 通过、`real == sim + 1 且 > maxConcurrent` 判红、`real < sim` 判红
- [x] 1.2 增加「`maxConcurrent=1` 时 +1 豁免必须失效」的显式用例（这条是 D1 的关键后果，不能只靠推导）
- [x] 1.3 先跑 1.1/1.2 确认**实现前为红**，并记录变红的用例名（红色样本才构成 Bug 探针，绿色只是防回归）
  → 实测：**6 failed | 2 passed**，红因 `TypeError: concurrencyCheck is not a function`（6 条合同用例全红）。
    同时那 2 条绿是既有的六组对拍与防漂移锁，说明基线本身没坏。

## 2. 实现判定口径

- [x] 2.1 在 `scripts/compare-scheduler-models.js` 抽出单点判定函数（并发判据与耗时判据分开），`checks.max_concurrent_observed` 改用新判据
  → `concurrencyCheck({simulated, real, maxConcurrent})`；上限一律经 `effectiveMaxConcurrent` 调被测侧的
    `clampConcurrency` 解析，**不在对拍侧抄第二份 clamp 公式**。
- [x] 2.2 判定结果里记录 `noiseBypass`（哪一组、 sim/real/上限三元值），由测试每次打印，使「豁免被命中」在现场可见
- [x] 2.3 把常量注释改写为实测口径：阈值两档数据（40ms 不翻 / 600ms 必翻 / 相邻起始间隔 500ms）、`started=0 finished=600` 的时间线证据、24 次空载全为 1 的样本量；删掉「大概是抖动」式的含糊表述
- [x] 2.4 确认 `KNOWN_DIFF_CASES` 与 `slow-call-concurrency` 的既有防漂移断言**不被削弱**（该用例仍单独要求差值恰为 1）
  → 全文件跑：9/9 通过，`slow-call-concurrency` 差值断言原样保留且仍绿。

## 3. 机制回归锁（把「为什么可以 +1」变成可执行证据）

- [x] 3.1 新增同进程可控饥饿用例：一档阻塞 ≤ 起始间隔的 1/10，断言真实侧并发**等于**模型值；二档阻塞 ≥ 起始间隔的 1.2 倍，断言并发 = 模型值 + 1 且 ≤ 上限
  → **实现时偏离原计划并已纠正**：低档**不能**断言"必须等于模型值"。CI 自身就可能饿到 500ms
    （#2606 正是如此），把相等写进低档等于新造一个假红源。低档改为只要求"不越上限、不超 +1"，
    而"阈值以下不该重叠"这一条改由**纯数据真值表**（1.1）+ 高档必现 +1 的组合承担。
    替代 4.4 的防护见 4.4′。
- [x] 3.2 每次运行打印「本档走的支路 + 实测阻塞时长 + 实测并发」，避免收紧/放宽后没人知道它在测什么
  → 现场行：`[parity-noise] gap=500ms sim=1 cap=2 low(41ms)=1 high(600ms)=2`
- [x] 3.3 断言只用「方向 + 是否越上限」，不得断言具体总耗时（慢机器上耗时会漂，会让锁变成假红源）

## 4. 反证（每条必须实跑并记录变红用例）

> ⚠️ 下列数字是**判据真值表迁移到 `scripts/compare-scheduler-models.test.js` 之后**重跑的结果。
> 迁移前在 vitest 文件里那一轮不再沿用 —— 锁换了文件就等于换了执行路径，"上次红过"不是本次证据。
> 迁移理由：真值表是纯数据判定，该跑在 `node --test` + Gate 2b（每次 PR 都执行）；而
> `test_scheduler_parity.test.js` 所在的 `electron-tests` 串行单测步骤带
> `if: github.event_name != 'pull_request'`，**PR 上整步被跳过**，判据合同写在那里等于
> "回归只能在合进 main 后才发现"。同文件的 `durationTolerance` 口径测试已在该处，属既有先例。

- [x] 4.1 变异：并发判据退回严格相等 ⇒ 1.1 的 +1 通过用例必须红 → `tests=29 pass=27 fail=2`
- [x] 4.2 变异：去掉 `≤ maxConcurrent` 夹持 ⇒ 「越上限」用例必须红 → 红 2（cap=1 那条同时红）
- [x] 4.3 变异：允许双向偏差（`|real − sim| ≤ 1`）⇒ 「真实侧低于模拟器」用例必须红 → 红 1
- [x] 4.4′ **替代原 4.4**：变异「把噪声放宽到 +2」⇒ 「多 2 及以上判红」必须红 → 红 1
- [x] 4.5 变异：把 `inject-429` 移出 must-pass ⇒ 必须红
  → 原计划指望六组用例变红，实测**它不会红**（循环少跑一组照样绿，属"缺席被当成通过"）。
    补存在性前置（`CASES.map(name)` 逐项 `toEqual` + `KNOWN_DIFF_CASES` 不得含 `inject-429`）
    后才红。这是本轮反证真正抓到的一个新缺陷（补锁前它抓不住）。
- [x] 4.7 变异：把上限判断挪到**豁免授予之后** ⇒ 必须红 → 红 2
  → 过程留痕：这条**第一次设计错了** —— 我只把上限挪到 `real === simulated` 之后，那仍在
    授予之前，于是它"没变红"。那不是"换序无害"，是探针没打到要害。改挪到授予之后才红。
- [x] 4.8 变异：摘掉因果证据门（回到无条件 +1 豁免）⇒ 必须红 → 红 2（Critical 的锁）
- [x] 4.9 变异：证据探测器退回"只扫 completed"（我第一版的真实错法）⇒ 必须红 → 红 1
- [x] 4.10 变异：证据阈值丢掉"跨间隔"只留 2× 配置时长 ⇒ 必须红 → 红 1（vitest 低档断言）
  → 过程留痕：这条**第一次报"没变红"**，原因是我用错了 runner（该断言在 vitest 侧，
    我跑了 node 侧）。换对 runner 立刻红（低档 41ms 在 `bound=40` 下被判成证据）。
    与 4.7 同族：**反证报 NO-RED 时，先排除"探针没打到目标"，再谈锁是否有效。**
- [x] 4.6 全部还原后按 sha256 与基线逐文件比对，确认无残留 → `基线 == 还原后`；
  `git status` 仅剩本 PR 的改动文件 + change 目录。
  → 另记一条探针教训：M5 首次锚点用了 `'\n'`，而本仓工作树是 **CRLF** ⇒ 命中 0 次。
    按口径它只能报「探针失配」，不得写成"锁没抓住"；改为行级正则后才有证据。

## 4A. QM-6 双模型外部评审（backend=codex / frontend=claude，均已执行）

- [x] 4A.1 **Critical（后端）：+1 豁免无因果证据** ⇒ 节奏型回归（提前放行）会得到同样的
  `real=sim+1 且 ≤ 上限`并被放过。已修：判据要求 `deferralEvidence.observed`，阈值
  `max(相邻起始间隔, 2× 配置时长)`；并补 4.8/4.9/4.10 三条变异守住。
- [x] 4A.2 **Warning（后端）：探测器第一版只扫 completed** —— 与它重叠的恰是被 429 拒掉、
  永不 completed 的那条。**这条是被我自己新加的机制锁当场否证的**，不是事后复盘发现的。
- [x] 4A.3 **Warning（后端）：规格「对拍一致」THEN 仍要求相等**，与 Requirement 允许 +1 自相
  矛盾 ⇒ 已改为「等于 **或**（不越上限 ∧ 有推迟证据 ∧ 留痕）」；`四组输入` 同步改六组。
- [x] 4A.4 **Warning（后端）：规格要求"完成顺序"一致但实现从未比对** ⇒ 真的加上比对后当场
  抓到模型分歧，另立 **#2626**（模拟器把被 429 拒掉的请求记成 completed，其单测
  `test_scheduler_simulator.py:147-148` 已把错标签钉成契约）。本 PR 只计算+打印+锁住"分歧存在"，
  **不计入 pass**，避免把另一处产品缺陷混进这条判据 PR。
- [x] 4A.5 **Warning（后端）：CI 路径（vitest）不打印 maxc/noiseBypass** ⇒ 静默命中豁免没人看得见。
  已把三元值 + 证据 + 顺序分歧写进 `[parity]` 每行留痕。
- [x] 4A.6 **Warning（后端）：高档精确断言依赖 cap=2 才安全** ⇒ 注释写明"复制到更高 cap 用例
  会 flake，须改用 noiseBypass"，并把断言条件化于实测帧延迟与证据。
- [x] 4A.7 **Info（后端）：真值表函数缺无效域校验**（`simulated=-1` 也能"通过"）⇒ 改为
  非负整数 + 上限≥1 一律 fail closed，含 `concurrencyCheck()` 无参调用不抛异常。
- [x] 4A.8 **Warning（前端）：同一份实验数据三处复制**（注释/docs/design）⇒ 代码注释只留推论 +
  指向 docs，实验表由 docs 单点持有。
- [x] 4A.9 **Warning（前端）：`main()` 按 name 回查 CASES 求上限**（改名即空指针）⇒ 结果对象
  直接带 `maxConcurrent`。
- [x] 4A.10 **Warning（前端）：spec Scenario 与测试口径不一致**（spec 写"必须相等"、测试主动
  放弃该断言）⇒ 与 4A.3 合并处理，并把低档改为条件化于实测延迟。
- [x] 4A.11 **Info（前端）：`pythonMetrics` 导出未标注子进程副作用** ⇒ 加 JSDoc + `@throws`；
  **Info（前端）：`MAX_CONCURRENCY_NOISE` 无外部消费者** ⇒ 不导出。
  注：其「把真值表拆成独立文件」的建议已被更靠前的决定超越 —— 真值表迁到
  `scripts/compare-scheduler-models.test.js`（Gate 2b，每次 PR 都跑），理由是
  `electron-tests` 在 PR 上被 `if:` 整步跳过。

## 5. 门禁与本地验证

- [x] 5.1 迁移后两侧都跑：**node 侧 `scripts/compare-scheduler-models.test.js` 19/19 通过**；
  vitest 侧全量跑 `test_scheduler_parity.test.js`（六组 + 防漂移 + 两档饥饿机制锁）通过（非 `-t` 过滤）
- [x] 5.2 跑 `node scripts/check-debt-budget.js` 与 `.github/scripts/check-max-lines.js`（通过；
  迁移后 `compare-scheduler-models.js` 234 行、其 node 测试文件与 vitest 文件均 < 500 行，未挂账）
- [x] 5.3 **N/A**：本 change 未新增测试文件（真值表并入既有、已接进 Gate 2b 的
  `scripts/compare-scheduler-models.test.js`），故无接线动作可做；`check-unwired-tests` 仍通过
- [x] 5.4 行尾对账：`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（未改行尾）

## 6. 规格与文档收口

- [ ] 6.1 实现合入后把 delta 同步进 `openspec/specs/desktop/model-call-observability/spec.md`（sync 后核对：MODIFIED 已带入、其余 Requirement 与原有 Scenario 未被吞）
- [ ] 6.2 度量口径结论落一条**新建** `docs/` 文件（不碰 CHANGELOG.md / 01-docs/learnings.md 这三份置顶文档：它们是字节存储且极易连撞多轮，每撞一次作废整条 CI）
- [ ] 6.3 在 #2606 上回填根因与判据变更：单样本事实（近 100 次 Electron CI 仅 1 红）、阈值实验数据、为何不是 governor 缺陷（2 ≤ 上限、产品侧自检本来就断 `≤ maxConcurrent`）、以及「未把用例移出判定」的说明
- [ ] 6.4 QM-6 双模型外部评审（本改动触及状态机/判据，属中风险）：按 `~/.claude/.ccg/config.toml` 的 `[routing]` 取模型名跑后端 + 前端两路，Critical 修完才合；**未执行就如实登记，不得谎称跑过**

## 7. 交付

- [ ] 7.1 worktree 内提交（PowerShell 原生 `D:\` 路径做 git 写），push 前自跑 `check-max-lines`（pre-commit 不拦它）
- [ ] 7.2 开 PR 并挂 SQUASH auto-merge，**回读**确认 autoMergeRequest 存在
- [ ] 7.3 合并后核对 main 上判据内容（取并集后的判定函数 + 两档实验用例都在），再按 R1–R7 用 `scripts/safe-worktree-remove.ps1` 清理，分支删除前先做内容包含证明
- [ ] 7.4 处置后的取证口径要摆正：本用例复发率 ≈1/18 main push（见 design.md 的分母推导），**主证据是 3.1 那条能主动制造跨阈值重叠的机制回归锁**，不是「后面几次 main push 没红」。CI 观察只作旁证，且必须回看 `[parity]` 逐组留痕里 `noiseBypass` 命中时的 sim/real/上限三元值是否合理（若出现 `real > maxConcurrent` 说明真有新问题，不得当噪声放过）
- [ ] 7.5 在 #2606 上把「为什么不是 governor 缺陷」与「为什么不移出判定」写清，并附本次的阈值实验数据；同时把该单的关闭原因如实标注为「判据口径修正」，不要让读者以为调度 bug 被修掉了
