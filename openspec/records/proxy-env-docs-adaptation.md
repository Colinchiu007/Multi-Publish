---
record: proxy-env-docs-adaptation
task: 代理环境自适应口径落地——仓库侧代理依赖三层清点 + 纠正两处写死本机代理端口的配方 + 新增 docs/proxy-environment-adaptation.md
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填者把下行改成 PASS 并删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取证离线：git log origin/main --grep=(#NNNN)$ --format=%H|%cI）
---

## 本次执行记录：代理环境自适应口径落地（proxy-env-docs-adaptation，2026-10-05）【docs-only】

- 判定：`node scripts/classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=true**（终态 files=10，逐提交复跑：3 文件 → 6 文件 → 10 文件；本记录随之更新）
- 保留门禁：判定 ✅（docs-only=true，终态 files=10，见上行）| 行尾对账 ✅（`git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐项相等，见下表）| 品牌残留 ✅（首轮**红在本记录自己身上**：门禁说明里如实写出了名单中的品牌词，被 Gate 12 当场拦下 —— 正是 AGENTS.md 点过的"文档里如实写竞品名会打红，正解写『参考产品』"；改写后复跑 rc=0）| 文档同步 ✅（纯文档，无代码变更）| 远程同步 PENDING

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 纯文档变更，按 AGENTS.md 分层判定就地编辑共享根 `main`（`docs/`、根级 `*.md`、`openspec/` 均在写保护放行名单内），**不进 worktree**；但同样经 PR 落地——直推 `refs/heads/main` 会被 GH011 拒。共享根提交后 `git branch` 保住提交再 `git reset --keep origin/main`，共享根回到 main+clean |
| 清点彻底性（先证域再下结论） | PASS | 扫描域 = tracked 文件 `apps`/`packages`/`ops-center`/`config`/`scripts`，**实读 3251 个文件**；关键词一律 `git grep -a`（含 NUL 的历史文档会被当二进制静默跳过，"扫到 0"不可信）。运行时代码 0 处依赖本机代理；机器层 `git config --global --get http.proxy` 为空、7897 无监听；数据层两份 `accounts.json` 8 账号 0 条代理配置 |
| 纠正的旧配方 | PASS | ① `SKILL.md:524`「GitHub 网络不通时扫本机 7890-10809 端口」——路由器级透明代理下本机没有可扫端口，该配方会把**通的链路**主动接上代理弄断；改为三步（多轮直连复测 → 看 `over proxy` 指纹 → 才探测并只在单条命令加 `-c http.proxy`）。② `docs/dependency-advisory-response.md:20` 命令体里写死的 `HTTPS_PROXY=http://127.0.0.1:7897` 去掉，改为按需前缀 |
| 新增判据文档 | PASS | `docs/proxy-environment-adaptation.md`（6518B）：五节——运行时代码不依赖代理的三层证据表、按报错指纹选路（含 `gh --jq` 空结果与 `||` 被管道吃掉两条观察者坑）、fake-ip 的两个副作用（域名存在性探针失效 ⇒ 改 DoH + 正控；`OPS_ALLOW_PROXY_BENCHMARK_IPS` 仍需 true）、仓外工具链 `proxy-env.js`/`MP_FORCE_PROXY` 的自适应实现、适用范围（系统代理只覆盖 WinINET，git/curl/gh/node 忽略） |
| 未一并修改的代码及理由 | PASS | ① `ops-center` fake-IP 拒绝文案的归因拓宽（只点名 Clash/TUN，未含上游网关）——改的是**运行面错误信息**，须独立走代码 PR + 质量节拍 + pytest 回归（`test_model_presets_api.py` 断言该文案关键词），不混进 docs-only；② `scripts/lock-timing-audit.js:22` 注释里"走 7897 时 Actions 日志会失败"保留——它的**行为**（主动清空代理 env 直连）在新旧两种拓扑下都是正解，注释只是历史动因，改掉等于制造无意义 diff；③ `apps/desktop/tests/visual-testing/.env.example` 的注释示例保留（不构成依赖，文中 §5 已点名它不是推荐做法） |
| 行尾对账 | PASS | 本仓这几份工作树是 CRLF（`git ls-files --eol` 实测 `i/lf w/crlf`），编辑逐行沿用目标文件行尾、未做任何整体归一；`git diff --numstat origin/main..HEAD` 与 `--ignore-cr-at-eol --numstat` 两口径逐项相等 ⇒ 幽灵行为零 |
| 共享根写保护的放行边界 | PASS（实测撞上一次） | 在共享根编辑根级 `SKILL.md` 被 `[shared-root-guard]` **从 HEAD 恢复**，`git add` 遂无差异、第一笔提交静默漏掉该文件（回读 `git status` 才发现）。放行名单是 `docs/`、`01-docs/`、`scripts/`、`openspec/`、`.ccg/`、`.hermes/` 等，**不含根级 `SKILL.md`**。正解是去隔离工作树里改，而不是放宽守护的放行范围 |
| 后续登记随锁入仓 | PASS | QM-6 后端复核实测出结构锁的四条精度边界（拆句等价 / 别名与动态方法名 / 字面量与注释不识别（**注释里写旧写法会假红，最危险**）/ 扫描域只 4 个写死文件且无钉），已落在 `docs/settings-persistence-contract.md` 新增 §9，与锁本体同文件；三份 findings 由会话工作区入仓到 `.ccg/review/`（27839B / 22160B / 13237B，均经 JSON.parse 校验后落盘）——评审结论不得只指向会随工作树清理而消失的路径 |
| 远程同步 | PENDING | 待 PR 合并后由后续提交就地改写为 PASS + merge SHA，并删除本文件 frontmatter 的三个 sync_* 字段 |

