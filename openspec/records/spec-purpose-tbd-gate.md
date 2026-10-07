---
record: spec-purpose-tbd-gate
task: 主规格 Purpose 去 TBD 的检测机制（Gate 12d）——判据 + 接线 + 反证 + 位置结构锁
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填把本行改成 PASS 并整段删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（或本会话的收尾轮）
---

## 本次执行记录：Gate 12d 主规格 Purpose 检测机制（spec-purpose-tbd-gate，2026-10-07）

> 分支：`spec-purpose-tbd-gate`；worktree：`D:/Data/projects/mp-worktrees/mp-spec-purpose-tbd-gate`（由 `scripts/start-mp-task.ps1` 创建，按产物复核：`worktree list` 含该路径、`rev-parse --abbrev-ref HEAD`=`spec-purpose-tbd-gate`、head 落在当时 `origin/main`、`verify-worktree-deps.js` OK 11 项）
> 范围：🔧 `scripts/` 判据 + 🔌 `.github/workflows/quality-gate.yml` 接线 + 🗄️ `CHANGELOG.md` + 📝 OpenSpec change ⇒ **混合 PR，不走 docs-only 快速通道**
> OpenSpec：`openspec/changes/spec-purpose-tbd-gate/`（`openspec validate --strict` 通过），capability `openspec-integration` 新增 1 条 Requirement

### 动因：这是上一轮自己写下的遗留，不是新需求

PR #3084 把 151 份主规格里 43 份的 `TBD - created by archiving change …` 填平，并在其执行记录里留了一行
「缺的是检测机制，不是这一次的填写」。本轮兑现它。清点证据（当场跑）：
`git grep -l Purpose -- scripts .github` ⇒ **0 命中** —— 门禁面上这条判据从来不存在，所以"填平"之后必然重新积累。

### 门禁判据（终态七条；初版四条 + QM-6 之后三条）

1. **全量**扫描 `openspec/specs/**/spec.md`（不按改动集）；违规 ⇒ rc=1 并逐条点名文件 + 原因码
   `TBD` / `MISSING_SECTION` / `EMPTY` / `UNREADABLE`。
2. 占位词按**语义特征**且只看正文开头（`^TBD\b`、`^TODO\b`、`^待补充`…）—— 不写"文件里出现 TBD 即红"，
   那会把"Purpose 里正在说 TBD 这件事"判成缺陷。**并配负控**：`待办…` / `占用…` 必须放过。
3. **两条空集出口各自抛错** + 规模下界（`DEFAULT_MIN_SPECS=50`，实测当前 151 份）。
   下界只管"扫描域退化"，**不管**积累 —— 积累由逐份违规判据守（B5 否证后写明）。
4. 域排除按**完整前缀**锚定：`openspec/changes/…`（提案增量，TBD 属正常生命周期）与 `openspec/specs/archive/`；
   谓词 `isSpecFile` 与装配 `collect` 各有一条锁（F5：恒过夹具的教训）。
5. **逐段判**：一份文件里每个 `## Purpose` 都查，违规点名"第 N 段"（B1）。
6. 标题层级收 `##` 与 `###`，**不收** `##Purpose`（CommonMark 下那不是标题，B2 半否证）；前导 BOM 先剥（B3）。
7. CLI 契约：畸形 `--limit` / `--min-specs` ⇒ rc=2 出声（不得静默按缺省跑，F6）；`--root` 等号式与空格式等价（F8）；
   `--help` 存在并写明退出码口径（F7/F11）。

### 反证 · 首轮 7 格（当时的套件是 15 条；终态 15 格见后面那张表）

驱动：从 pristine 还原 → 基线必须 `14/14 → 15/15` 全绿 → 注入变异（断言锚点命中恰好 1 次且字节真的变了）→
指定用例必须变红 → 逐字节还原并与备份 `===`。每条记录 `restored_byte_identical=true`；全部跑完 `git status --porcelain`
只剩本次真实改动文件（无变异残留）。下表红条数是**首轮实跑值**；套件扩到 23 条后同一批变异的红条数变为
M1=9 / M2=6 / M5=2 / M7=2，终态数字以「反证（终态 15 格，驱动 v3）」那张表为准。

| 变异 | 拆掉的是什么 | 结果 |
|------|-------------|------|
| M1 `evaluatePurpose` 恒判合规 | 整条判据（no-op） | 红 4 条（含 TBD 档）⇒ PASS |
| M2 正文提取退回带 `m` 的多行正则 | 逐行扫描器 | 红 2 条（含"真实仓库不得判 EMPTY"）⇒ PASS |
| M3 "扫描域为空"改 `return ok:true` | 第二条空集出口 | **首跑 NOT_RED** ⇒ 见下 |
| M4 `DEFAULT_MIN_SPECS` 改 0 | 规模下界 | 红 1 条 ⇒ PASS |
| M5 把整块 step 复制到 `classify` 之前 | 接线位置前提 | 红 1 条 ⇒ PASS |
| M6 删 `.gitignore` 的 `!scripts/check-spec-purpose.js` | 脚本入库前提 | 红 1 条 ⇒ PASS |
| M7 从 step 里摘掉 `node --test` 点名 | "测试被 CI 跑过" | **首跑 ANCHOR_NOT_FOUND** ⇒ 见下 |

两条驱动自身的坑（都是探针问题，不是代码安全）：

- **M3 首跑 `NOT_RED`**：当时只有"目录不存在"这一条空集出口有测试，于是把 `check()` 里
  `扫描域为空 ⇒ 抛` 改成 `return ok:true` 的变异照样全绿。补一条"目录存在但零 spec.md"的锁后，
  同一变异立刻变红。**口径：一条判据有多个退化出口时，每个出口都要有自己的锁**，否则它就是装饰。
- **M7 首跑 `ANCHOR_NOT_FOUND`**：needle 手拼成 `'…test.js\n'`，而 workflow 文件是 CRLF ⇒ 命中 0 次。
  改为**从文件运行时取行**（`split('\n')` 后按 trim 比对）后成立。与 M3 那条同一教训：锚点必须抄自实现/文件，不能凭记忆。

### 本轮抓住的一个自身缺陷（若上线即成噪声）

第一版判据用带 `m` 的多行正则取正文，`$` 在多行模式下匹配**空行行尾**，而 `## Purpose` 与正文之间按惯例就有空行
⇒ **15 份已写好 Purpose 的规格被判 EMPTY**（`openspec/specs/creator-monitor/spec.md`、`i18n-content-sync`、
`session-worktree-isolation`、8 份 `story2video-*` 等）。发现路径是"先在真实仓库跑一次判据"而不是跑测试 ——
测试夹具全是"标题行后紧跟内容"的形状，对这一档**结构性免疫**。
修法是实现换成逐行扫描（代码围栏内的 `#` 不当标题），并补一条**真实文件形状**的回归锁。
后果评估：若按第一版上线，Gate 12d 第一天就红 15 条噪声，被教给下一个人的动作是"绕开门禁"，比没有门禁更糟。

### 门禁表

| 门禁 | 状态 | 证据（当场实跑） |
|------|------|------------------|
| 变更类型与隔离 | PASS | `start-mp-task.ps1 -TaskName spec-purpose-tbd-gate` 按产物复核（见开头引文）；共享根保持 main，仅 2 个别的会话的 untracked 文件未动 |
| TDD 红→绿 | PASS | RED：`Cannot find module './check-spec-purpose.js'` / `MODULE_NOT_FOUND` / `tests 1 pass 0 fail 1`；GREEN：初版 `15 / 15 / 0`，QM-6 后终态 `23 / 23 / 0` |
| 判据在真实仓库 | PASS | `node scripts/check-spec-purpose.js` → `扫描 151 份主规格，违规 0` + `OK` |
| 测试接线 | PASS | 新测试与判据同 step 点名在 `changes` job 的 Gate 12d；`check-unwired-tests.js` 检查域 65→**66** 且报「全部已接线」 |
| CI 结构 | PASS | 四条结构锁（提取器自证 / changes job 内 / classify 之后 / 不得同时进 static-gates）；`check-step-failfast.js` 6 个多测试步骤仍全 fail-fast |
| OpenSpec | PASS | `openspec validate spec-purpose-tbd-gate --strict` → `Change 'spec-purpose-tbd-gate' is valid` |
| 行尾对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 同口径（详见提交）|
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`；改动是 CI 门禁 + 文档 |
| QM-4 视觉 | N/A | 未触任何 `.vue` / 样式 / 布局 |
| QM-6 双模型评审 | PASS | 见下节「QM-6 发现处置」：23 条，逐条修 / 否证，两条反例已落文档 |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`、`git ls-remote --heads origin spec-purpose-tbd-gate` 返回 0 行；改 PASS 的同一次提交内删除本段三个 `sync_*` 字段 |

### QM-6 发现处置（23 条：后端 11 含 2 CRITICAL，工程 12 含 3 MAJOR）

通道：CC Switch `:15721` 实测 DOWN（`Get-NetTCPConnection -LocalPort 15721 -State Listen` 无输出）⇒ 按既有替代通道
`opencode run`，两轴分别 `opencode/nemotron-3-ultra-free`（后端）与 `opencode/ling-3.1-flash-free`（工程）。
**评审对象钉 `68c4010d9`**（= 首提交 + 合并 `origin/main bc1e75210` 后的 head）；原件落盘
`.tmp/qm6/out-backend.txt`（19,528 B）/ `.tmp/qm6/out-frontend.txt`（11,013 B 剥 ANSI 后）。
判成败只看产物里的 JSON 正文，不看 rc（该通道有 rc=0 + 空 stdout 的先例）。

| 编号 | 轴 / severity | 发现 | 处置 | 依据 |
|------|--------------|------|------|------|
| B1 | 后 / CRITICAL | 只查第一个 `## Purpose`，第二段 TBD 静默放过 | **修**：`purposeBodiesOf` 收全部段 + 逐段判，违规点名「第 N 段」 | 自查边界探针 `d_double => OK(null)` 先于评审命中同一洞；M8 反证红 1 |
| B2 | 后 / CRITICAL | `##Purpose`、`### Purpose` 不被识别 | **半修半否证**：`###` 收（M14 反证）；`##Purpose` **不收** —— CommonMark 要求 `#` 序列后跟空格/制表符或行尾，那不是标题，报缺段是正确判定。现状量测 151 份逐字都是 `## Purpose`（`NO_HEAD=0 / MULTI_HEAD=0`） | `D:/tmp/sp-measure-heads.js` |
| B3 | 后 / MAJOR | 前导 BOM 未剥 | **修** + 两条成对用例。**M9 首跑 `NOT_RED`**：样本 `BOM+H1+## Purpose` 时 BOM 只污染 H1，判据不看 H1 ⇒ 变异 no-op。改为 BOM 压在标题行上才打出真路径；并钉住「BOM 在 H1 前不受影响」防止夸大。现状 151 份 BOM=0 ⇒ **预防性加固** | 反证驱动 v3 M9 |
| B4 | 后 / MAJOR | 「`split(/\r?\n/)` 把 `\r` 留在行里，CRLF 双处理脆弱」 | **否证**：`/\r?\n/` 把 `\r` 当分隔符**消费掉**；实测 CRLF / 混合行尾三档 `contains_CR=false`；再量测 151 份 spec.md 的孤立 CR = **0** | `D:/tmp/sp-crlf-probe.js` + 字节级扫描 |
| B5 | 后 / MAJOR | 规模下界给"假信心"：可「加 100 份 TBD、删 100 份好的」而通过 | **否证**：违规是**逐份**判的，与总数无关 —— 加 100 份 TBD 当场红 100 条。下界只管"扫描域退化"，已把职责边界写进常量旁注释（不改名、不动 M4 锚点） | 读 `check()` 的 bad 聚合路径 |
| B6 | 后 / MAJOR | 结构锁用 `indexOf` 取首次命中，注释里的同名串能把位置判到注释上 | **修**：按 step 语义标题定位 → 命令必须落在**该 step 正文** → 注释行剥离；另加「提取器自证」用例证明"注释不算接线"这件事本身可红 | M10 反证红 1 |
| B7 | 后 / MAJOR | step 定位正则写死 6 空格缩进；建议改 `js-yaml` | **接受脆弱性、拒绝处方**：`changes` job 的 steps 实测只有 `actions/checkout` + 门禁命令，**没有 Install deps**（`has_install_step=false`），`require('js-yaml')` 会在 CI 当场 `MODULE_NOT_FOUND`；仓内三把 js-yaml workflow 锁全跑在有依赖的 static-gates（`quality-gate.yml:424`）。改为缩进无关的轻量 step 扫描。工程轴独立给出同一结论 ⇒ 两轴互证 | `yaml.load` 枚举 changes job |
| B8 | 后 / MINOR | 中文占位词无词边界（`^待定` 命中「待定项」） | **不改**：现状量测 0 命中；加限定词会把「待补充」单独成行放过，是用误杀换漏判。理由写进 `PLACEHOLDER_RES` 注释（AGENTS.md 要求枚举黑名单要么给泛化规则、要么给理由，本处是**有理由的例外**） | 违规 0 即该证据 |
| B9 | 后 / MINOR | 排除用路径段名，`openspec/specs/changes/spec.md` 会被静默排除 | **修**：按完整前缀锚定 + 谓词层直接断言（`isSpecFile` 双向）+ 夹具层「名为 changes 的能力留 TBD 必须红」。现状 `ls openspec/specs` 无同名目录 ⇒ 收紧不改变今日结果 | M13 反证红 1 |
| B10 | 后 / INFO | 探针故障与违规共用 rc=1 | **不改**，与 B11/F11 合并处理：`parseArgs` 已把 **rc=2 占为用法错误**，拆不动；把口径写进 `--help` 与文件头 | 见 F11 |
| B11 | 后 / INFO | proposal 写「14 条」而实为 15 | **修**：现统一为 **23 条**，四处（proposal / tasks / CHANGELOG / 记录）同 PR 对齐 | `grep -n 14 proposal.md` |
| F1 | 工 / MAJOR | 占位词表缺负控，阳性样本全取自枚举集本身 | **修**：`待办…` / `占用…` 必须放过；且把「以 `占位` 起头的合法名词短语**会被误杀**」钉成断言（写代价，不假装不会发生）+ M15 证明负控不是放宽判据换来的 | 新用例首跑**当场命中**了这个洞 |
| F2 | 工 / MAJOR | proposal「14 条」 | 同 B11 | — |
| F3 | 工 / MAJOR | 「两条接线结构锁」vs「三条」口径分裂 | **修**：终态为四条锁，四处文档统一 | `grep -n 结构锁` |
| F4 | 工 / MINOR | `check()` 对同一文件调两次 `purposeBodyOf` | **修**：`violationsOf` 一次提取同时产出原因与明细 | — |
| F5 | 工 / MINOR | 「changes 目录不得入域」是恒过夹具：walk 起点根本到不了那里，删掉排除分支照样绿 | **修**：拆成谓词层（直接调 `isSpecFile`，正反双向）与装配层（`check` 的 `total`）两层，各锁各的 | 本轮自查再次确认：这是「装饰性断言」的测试层形态 |
| F6 | 工 / MINOR | `--limit=abc` → `NaN` → `slice(0,NaN)=[]`，违规明细**整页静默消失**而 rc 仍 1 | **修**：`--limit` / `--min-specs` 必须是有限非负整数，否则 rc=2 出声；`check()` 侧同样拒绝坏值而非静默回落。并加正向对照证明 `--limit` 真在截断（否则"NaN 让它失效"只是推测） | M12 反证红 1 |
| F7 | 工 / MINOR | 无 `--help`，而三个同族判据都有 | **修**：`--help` 出用法并 rc=0 | — |
| F8 | 工 / MINOR | `--root` 只认等号式，最近的同族 `check-doc-abs-paths.js` 因实测事故两式都收 | **修**：等号式与空格式等价，并断言两式**产出同一结果**（否则"支持了"只是表情） | — |
| F9 | 工 / MINOR | 三个锚点散在用例里；且指出 YAML 解析不会更安全 | **修**：锚点集中登记到 `ANCHOR` 一处；标题不写死门禁编号（改编号不该让锁变红） | 与 B7 互证 |
| F10 | 工 / MINOR | `assert.ok(Array.isArray(emptied))` 是恒真断言 | **修**：改为 `deepEqual(emptied.map(f), [])`，让它有独占红出口 | — |
| F11 | 工 / MINOR | 退出码语义与同族不一致（同族用法错=2、违规=1） | **修（文档化）**：把「0 / 1（违规或判据故障，文案带 `FAIL(closed)`）/ 2（用法错误）」写进 `--help` 与文件头，保持现状不拆 —— 与 B10 同一处 | — |
| F12 | 工 / INFO | 正面确认：collect / check / evaluatePurpose / isSpecFile 分层清楚，加第二条判据只需改一处 | 采纳为分层约束写进注释 | — |

**评审没提出、被新增 CLI 用例抓到的那条更贵**：`process.exit(main())` 而 `main(argv)` 无缺省 ⇒
`parseArgs(undefined)` 按零参数运行 ⇒ **所有命令行选项静默失效**（`--help` 也照常扫全仓并 rc=0）。
前 7 格反证对此全部失明（它们都不经 CLI）。⇒ 口径：**给一个脚本加"参数化行为"时，反证必须有一条从进程入口打进去**，
只测导出的函数等于没测 CLI 层（与既有「反证没红的第四种成因：被测代码不在这次执行的调用链上」同源）。

### 反证（终态 15 格，驱动 v3）

| 变异 | 拆掉的是什么 | 结果 |
|------|-------------|------|
| M1 `evaluatePurpose` 恒判合规 | 整条判据（no-op） | 红 9 ⇒ PASS |
| M2 正文提取退回带 `m` 的多行正则 | 逐行扫描器 | 红 6 ⇒ PASS |
| M3 "扫描域为空"改 `return ok:true` | 第二条空集出口 | 首跑 NOT_RED ⇒ 补锁后红 1 |
| M4 `DEFAULT_MIN_SPECS` 改 0 | 规模下界 | 红 1 ⇒ PASS |
| M5 整块 step 搬到 `classify` 之前 | 接线位置前提 | 红 2 ⇒ PASS |
| M6 删 `.gitignore` negation | 脚本入库前提 | 红 1 ⇒ PASS |
| M7 摘掉 step 里 `node --test` 点名 | "测试被 CI 跑过" | 首跑 ANCHOR_NOT_FOUND ⇒ 改运行时取行后红 2 |
| M8 `purposeBodiesOf` 只返回第一段 | B1 修的洞 | 红 1 ⇒ PASS |
| M9 不剥前导 BOM | B3 修的洞 | **首跑 NOT_RED**（样本没打到路径）⇒ 红 1 |
| M10 接线锁不再剥注释 | B6 修的洞 | 红 1 ⇒ PASS |
| M11 入口不转发 argv | 整个 CLI 层 | 红 2 ⇒ PASS |
| M12 畸形数值静默按缺省 | F6 修的洞 | 红 1 ⇒ PASS |
| M13 排除退回路径段名 | B9 修的洞 | 红 1 ⇒ PASS |
| M14 标题层级退回只认 `##` | B2 修的半边 | 红 1 ⇒ PASS |
| M15 占位词表清空 | 证明负控不是放宽判据 | 红 14 ⇒ PASS |

驱动四步不变：pristine 还原 → 基线必须全绿 → 注入（锚点命中恰好 1 次 + 断言字节真的变了 + 断言写后确实变了）→
指定用例必须变红 → 逐字节还原并与备份 `===`。终态 `VERDICT=ALL_PASS`，15 格 `restored_byte_identical: true`，
跑完 `git status --porcelain` 只剩 2 个 M 档（判据 + 测试），无变异残留。

### 遗留（不假装已闭合）

- 判据只管 **Purpose 段的有无/占位**，不管内容质量：一句"定义 X 的行为契约"式 Purpose 也判过。
  质量审计需要另一条判据（例如要求 Purpose 至少引用一条 Requirement 标题），本轮不做。
- **占位词表的已知边界**（QM-6 B8/F1 后如实写）：① 未登记词（`TBA`、`稍后补`、`XXX`）放过，已由用例钉住"不得声称能拦"；
  ② 以 `占位` 二字起头的**合法**名词短语（如「占位符替换契约」）会被误杀 —— 现状 151 份里 0 命中，代价被钉成断言；
  真撞上时的正解是改写那句 Purpose，**不是**给词表加限定词（那会把真占位放过）。
- `## Purpose` 只认 `##` / `###` 且 `#` 后必须有空白：`##Purpose` 判缺段是**有意的**（CommonMark 下那不是标题）。
- BOM 处理属**预防性加固**：现状量测 151 份 BOM=0、孤立 CR=0，不得被读成"救下了存量"。
- `openspec archive` 自身仍会先写 TBD 再靠门禁拦 —— 更彻底的做法是在归档命令里强制补写，
  但那属上游 openspec CLI 行为，本仓不 fork 它；当前顺序（先归档、CI 立刻红）已能把账留在台面上。
- 归档本 change 后，它会给自己新增的主规格写 TBD —— 这正是本门禁的活体测试场景，
  归档时必须确认产出的 `openspec/specs/openspec-integration/spec.md` Purpose 已填（tasks 5.4 已记）。
- 流程面的一条方法论遗留（本轮最贵的一课）：**给脚本加参数化行为时，反证必须有一条从进程入口打进去**。
  `process.exit(main())` 丢 argv 那个缺陷，前 7 格反证全部失明 —— 它们只调导出函数，从不经过 CLI。
