# CI 变更集取源（docs-only 短路与执行记录判据共用的一份真源）

建立于 2026-10-05，动因是 PR #2914 的一次「门禁自称在守、实际恒不生效」的实测复盘，
以及 QM-6 外部评审（codex + nemotron 两路）对本仓第一版修法的两次实质纠正。

## 1. 问题：`changes` job 量的从来不是「本 PR 改了哪些文件」

`quality-gate.yml` 的 `changes` job 产出 `docs-only` 输出，下游所有重型 job 靠它短路。
判据是 `scripts/classify-docs-only.js`，它拿 `merge-base(base, head)..head` 的 `--name-status`。
**取哪一对 base/head，决定了这个门禁到底在测什么。**

原先 CI 传 `--base=<github.event.pull_request.base.sha>` 且**不传 `--head`**（脚本默认 `HEAD`）。
PR 事件下 `actions/checkout@v4` 检出的是 `refs/pull/N/merge` —— 一个把 PR head 合进**当前** main tip
的合成合并提交。于是有两种独立的失效形态：

| 形态 | 取法 | 为什么错 | 现场 |
|------|------|----------|------|
| A | 冻结 base + 默认 HEAD（合并提交） | `base.sha` 停在 PR 打开那一刻；此后 main 前进的提交都在 `merge-base(base, 合并提交)..合并提交` 里 | #2914：本地按分支顶判 `docs-only=true files=10`，CI 判 `false` 且清单多出 46 个别人的文件 |
| B | 冻结 base + `event.head.sha` | 分支一旦做过 re-sync（把新 main 合进自己 —— 本仓推 PR 前的**常规动作**），那些 main 提交就在 head 的历史里、却不在冻结 base 一侧 | 本机夹具复现：`docs-only=false files=2`，多出来的是别人的 `apps/desktop/electron/main.js` |

形态 B 是第一版修法（把 `--head` 绑到 `pull_request.head.sha`）没覆盖的那一半，由后端评审实测逼出。

## 2. 正解：优先取「检出物自己的双亲」

`HEAD^1` = 当前 base tip，`HEAD^2` = PR head。`merge-base(^1, ^2)..^2` 天然只含本 PR 的提交，
且随检出物一起过期，不依赖任何冻结的事件快照。

实现落在 **`scripts/ci-pr-changeset.js`**（唯一真源），输出 `source= / base= / head=` 三行，
并在 `GITHUB_OUTPUT` 存在时追加 `pr-base` / `pr-head` 两个 step 产出：

| 支路 | 触发条件 | `source` 取值 |
|------|----------|----------------|
| 合并提交双亲 | `git rev-list --parents -n 1 HEAD` 给出 ≥2 个亲 | `merge-ref-parents` |
| 事件 payload 兜底 | 检出是单亲（squash 提交 / 直接检出分支顶） | `event-payload` |
| 非 PR 事件 | `--evt-name` 存在且不是 `pull_request` | `non-pr`（产出空对，调用方走全量档） |

三条纪律：

1. **每次打印走了哪条支路**（`[classify] source=… base=… head=…`）。否则下一次没人知道它测的是哪个集合。
2. **取不到值一律 fail-closed**（`rc=1`）。空串会被下游脚本读成 `HEAD`，那正是形态 A 的原形。
   `Gate 2c2` 同样补了「base 有值而 head 没值 ⇒ 乐红」的守卫 —— 那种组合下误算的方向是
   **假通过**（把别人新增的 `openspec/records/*.md` 算成本 PR 携带的记录）。
3. **两处消费，一处取源**。`Gate 2c2` 只读 `steps.classify.outputs.pr-base / pr-head`，
   不自己再算一遍；同一份 merge-base 口径写两遍必然漂移（本仓 `login-state` 三抄事故的同族）。

## 3. 为什么决策不能留在 bash 里

第一轮的取源判断写在 workflow 的 `run:` 里，配套的是三条「读 workflow 正文」的结构锁。
实测把 `if git rev-parse -q --verify HEAD^2 …` 改成 `if false`（支路整条死码化）后，
四条结构锁 **29/25/31/26 全绿**。文本锁锁得住形状，锁不住「这条支路还会不会被走」。

所以判据搬进 `ci-pr-changeset.js`，由 `scripts/ci-pr-changeset.test.js` 用真 git 夹具逐形态跑：
双亲正控（形态 A / B 各一条）、事件取法负控（A、B 方向不同，不合成一条）、单亲落 payload、
非 PR 空对、fail-closed 抛错、`rev-list` 故障上抛、双亲字段形状异常、CLI KEY=VAL 与 GITHUB_OUTPUT。
夹具自带「`HEAD` 恰好两个亲」的自检 —— 单亲夹具会静默把双亲支路测成 payload 支路。

`decide()` 里另有一条评审纠正：**不得用 `try/catch` 包住 git 调用再返回 `null`**。
那会把「仓库损坏 / git 不可用 / 权限受限」一并读成「这个提交没有第二亲」，从而静默落回
已知会误算的 payload 支路。现在只做一次确定性 plumbing 调用，git 自身故障原样上抛。

## 4. 变异反证（本轮全部实测变红）

| 编号 | 变异 | 抓住它的锁 |
|------|------|------------|
| N1 | 摘掉 classify 的 `--head` | 结构锁（形态 A 原形） |
| N2 | `Gate 2c2` 的 `--head` 写死 `HEAD` | 结构锁 |
| N3 | 空值守卫只判 `HEAD_SHA` | 顺序/守卫锁 |
| N4 | 摘掉取源脚本的自测接线 | 结构锁 + `check-unwired-tests` 双 detector |
| N5 | 取源退回 bash 内联（不再调脚本） | 结构锁 |
| N6 | 双亲支路死码化（上一轮溜过文本锁的那条） | **行为测试** |
| N7 | 摘掉 `decide()` 的 fail-closed 抛错 | **行为测试**（2 条） |
| N8 | 把 git 故障重新吞成 `null` | **行为测试**（评审 nemotron 第 1 条） |

驱动收尾断言两个被改文件与备份**逐字节相同**，且基线全绿后才收口。

## 5. 遗留（不假装已闭合）

- `check-pr-exec-record.js` 自身的 `args.head || 'HEAD'` 仍会把显式传入的**空串**读成 `HEAD`。
  调用方已用守卫堵住，但脚本级拒绝（`--head=""` ⇒ 取证失败）更稳，归入 #2745 后续项单独一次改动。
- 本文件描述的取源只在 `pull_request` 事件下有意义；main push 走全量档是设计，不是漏判。
- 前端评审通道（`codeagent-wrapper --backend claude`）本轮三次全败（`rc=0` 且无 `agent_message`、
  无产物），第二路改用 `opencode run --model opencode/nemotron-3-ultra-free` 并收窄任务书，
  独立性来自实测的两个不同产物文件，不是同一模型跑两遍。
