# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `1091b4e48873f954b797d178526fba6025a756e6`
- 采集模式: `diff`
- 变更规模: 1583 行

## 变更内容

```diff
diff --git a/.adversarial/ccg-deep-c689da94/adjudication.json b/.adversarial/ccg-deep-c689da94/adjudication.json
new file mode 100644
index 00000000..77f72499
--- /dev/null
+++ b/.adversarial/ccg-deep-c689da94/adjudication.json
@@ -0,0 +1,48 @@
+{
+  "schemaVersion": 1,
+  "adjudicatedBy": "self-play",
+  "confidenceWeight": 0.6,
+  "reason": "stall/maxRounds 后自扮演裁决（引擎第三档出口）",
+  "highRiskNote": "高危域争议项不允许自扮演豁免，必须外部复核",
+  "requiresExternalReview": [],
+  "critiqueFingerprint": "860e346c67ef63bd",
+  "instructions": [
+    "对 items 里每一条争议，依次生成：",
+    "  1) 最强指控 —— 论证这条确实是真问题（含具体失败场景）",
+    "  2) 最强辩护 —— 论证这不是问题 / 已被别处覆盖",
+    "  3) 裁决 —— 哪一边论证更强，verdict 取 upheld（指控成立）/ dismissed（指控不成立）",
+    "裁决理由必须可验证，不得只写「看起来没问题」。"
+  ],
+  "items": [
+    {
+      "id": "i1",
+      "severity": "Critical",
+      "finding": "report_backends 的 CMD 分支不设 _rb_rc 也不计 _rb_ok：两后端都只有 .cmd 时打印『没有任何评审后端可用』却返回 0，--check-deps 跟着 exit 0 并打印『体检通过：后端可用』，与自身文案及 fail-closed 意图相反。测试②只断言输出、不查 rc，拦不住。",
+      "highRiskDomains": [],
+      "prosecution": null,
+      "defense": null,
+      "verdict": null,
+      "rationale": null
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "finding": "for _rb_d in $(candidate_dirs) 未加引号，含空格的候选目录被按词拆分。文档自己举的真实路径 D:\\Program Files\\npm-global 就含空格，该候选在 shell 里被拆成两段而漏检后端。",
+      "highRiskDomains": [],
+      "prosecution": null,
+      "defense": null,
+      "verdict": null,
+      "rationale": null
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "finding": "主流程 report_backends || true 之后无条件打印『依赖体检通过，开始深度审查…』并继续跑；后端全 MISS 时上一行刚打印『深度审查根本起不来』，两句自相矛盾，且仍会带着坏环境往下执行到 wrapper 才失败。",
+      "highRiskDomains": [],
+      "prosecution": null,
+      "defense": null,
+      "verdict": null,
+      "rationale": null
+    }
+  ]
+}
diff --git a/.adversarial/ccg-deep-c689da94/critique-v1.md b/.adversarial/ccg-deep-c689da94/critique-v1.md
new file mode 100644
index 00000000..027ae306
--- /dev/null
+++ b/.adversarial/ccg-deep-c689da94/critique-v1.md
@@ -0,0 +1,60 @@
+{
+  "schemaVersion": 1,
+  "issues": [
+    {
+      "id": "i1",
+      "severity": "Critical",
+      "dimension": "correctness",
+      "finding": "report_backends 的 CMD 分支不设 _rb_rc 也不计 _rb_ok：两后端都只有 .cmd 时打印『没有任何评审后端可用』却返回 0，--check-deps 跟着 exit 0 并打印『体检通过：后端可用』，与自身文案及 fail-closed 意图相反。测试②只断言输出、不查 rc，拦不住。",
+      "suggestion": "CMD 分支同样 _rb_rc=2；给测试②补 rc≠0 断言，覆盖两后端均仅 .cmd 的用例。"
+    },
+    {
+      "id": "i2",
+      "severity": "Warning",
+      "dimension": "correctness",
+      "finding": "for _rb_d in $(candidate_dirs) 未加引号，含空格的候选目录被按词拆分。文档自己举的真实路径 D:\\Program Files\\npm-global 就含空格，该候选在 shell 里被拆成两段而漏检后端。",
+      "suggestion": "改用 while IFS= read -r 按行消费 candidate_dirs 输出，或令其以换行分隔并由 read 逐行读取。"
+    },
+    {
+      "id": "i3",
+      "severity": "Warning",
+      "dimension": "maintainability",
+      "finding": "主流程 report_backends || true 之后无条件打印『依赖体检通过，开始深度审查…』并继续跑；后端全 MISS 时上一行刚打印『深度审查根本起不来』，两句自相矛盾，且仍会带着坏环境往下执行到 wrapper 才失败。",
+      "suggestion": "主流程根据 _rb_ok 分支文案：无可用后端时打印阻断说明并提前 exit 2，或至少不再打印『体检通过』。"
+    },
+    {
+      "id": "i4",
+      "severity": "Info",
+      "dimension": "maintainability",
+      "finding": "文档称『修复前 5/5 全红，修复后 7/7 全绿』，但测试共 7 例，且用法锁、dirname 锁、结构锁在旧实现下同样必红，前后数字无法对应。",
+      "suggestion": "按实际断言逐条标注修复前红/绿状态，或改为『修复前 6/7 全红』等可核对口径。"
+    },
+    {
+      "id": "i5",
+      "severity": "Info",
+      "dimension": "maintainability",
+      "finding": "注释称候选目录清单『不依赖 PATH 本身』，但 npm prefix -g 依赖 command -v npm，posix_dir 依赖 cygpath/sed/cut/tr；PATH 坏到本方案针对的场景时这些分支会静默不生效。",
+      "suggestion": "要么用纯参数展开实现盘符归一，要么在注释中明确该候选在 PATH 全坏时不可用。"
+    },
+    {
+      "id": "i6",
+      "severity": "Info",
+      "dimension": "maintainability",
+      "finding": "测试注释编号混乱：出现 ⑥b、两个并列 ⑦、缺 ⑤，与文档『7 例』的指代不易对上，后续增删测试易引错编号。",
+      "suggestion": "按 ①…⑦ 顺序重新编号，并让注释里的编号与 test() 顺序一一对应。"
+    },
+    {
+      "id": "i7",
+      "severity": "Info",
+      "dimension": "maintainability",
+      "finding": "⑦ 结构锁用正则精确匹配 _self_dir=\"${_self_dir%/*}\" 的具体实现串，属于脆弱的字符串级锁；合法重构（换写法但保留不依赖 dirname）会误报红。",
+      "suggestion": "改断言为『ROOT 计算不含 dirname 且含参数展开』的行为级匹配，宽容实现细节。"
+    }
+  ],
+  "dimensionScores": {
+    "correctness": 5,
+    "security": 9,
+    "performance": 9,
+    "maintainability": 6
+  }
+}
\ No newline at end of file
diff --git a/.adversarial/ccg-deep-c689da94/family-snapshot.json b/.adversarial/ccg-deep-c689da94/family-snapshot.json
new file mode 100644
index 00000000..531b38e7
--- /dev/null
+++ b/.adversarial/ccg-deep-c689da94/family-snapshot.json
@@ -0,0 +1,29 @@
+{
+  "schemaVersion": 1,
+  "snapshotCreatedAt": "2026-10-06T18:06:20.047Z",
+  "resolvedFamily": {
+    "proposer": "opencode",
+    "critic": "claude"
+  },
+  "familyMap": {
+    "claude": [
+      "anthropic"
+    ],
+    "codex": [
+      "openai"
+    ],
+    "gemini": [
+      "google"
+    ],
+    "grok": [
+      "xai"
+    ],
+    "kimi": [
+      "moonshot"
+    ],
+    "opencode": [
+      "deepseek",
+      "hy3"
+    ]
+  }
+}
diff --git a/.adversarial/ccg-deep-c689da94/proposal-v1.md b/.adversarial/ccg-deep-c689da94/proposal-v1.md
new file mode 100644
index 00000000..68d3e09e
--- /dev/null
+++ b/.adversarial/ccg-deep-c689da94/proposal-v1.md
@@ -0,0 +1,625 @@
+# 变更提案（自动生成，待对抗评审）
+
+- base: `origin/main`
+- head: `c689da94027137f18ff34e61bc9421049754830f`
+- 采集模式: `diff`
+- 变更规模: 612 行
+
+## 变更内容
+
+```diff
+diff --git a/.github/workflows/quality-gate.yml b/.github/workflows/quality-gate.yml
+index f7497ad6..5e264a49 100644
+--- a/.github/workflows/quality-gate.yml
++++ b/.github/workflows/quality-gate.yml
+@@ -217,6 +217,10 @@ jobs:
+           # openspec-sync-check.test.js 自带「镜像与真源逐字节一致」锁，但历史上从未被任何
+           # workflow 收集（CI 只显式挂 scripts 下 5 个测试文件，无通配），锁等于没在跑；在此收编。
+           node --test scripts/openspec-sync-check.test.js
++          # CCG 深度双模型审查（QM-6）的后端依赖体检锁：后端 CLI 不在 PATH 时引擎会
++          # **静默降级成单后端**（评审照跑、结论照出，只少一路跨家族交叉验证），
++          # 旧实现只有一句被动 ⚠ 告警。判据与假 HOME 复现方式见该测试头注释。
++          node --test scripts/deep-review-deps.test.js
+           # 质量节拍 vendored 契约镜像（.quality-rhythm/）与 openspec 真源的漂移锁
+           node --test scripts/quality-rhythm-spec-mirror.test.js
+           # Windows PowerShell 5.1 读**无 BOM** 的 .ps1 时按 ANSI 码页解码，中文注释/字符串可让
+diff --git a/docs/ccg-review-backend-path-2026-10-07.md b/docs/ccg-review-backend-path-2026-10-07.md
+new file mode 100644
+index 00000000..827d8fa9
+--- /dev/null
++++ b/docs/ccg-review-backend-path-2026-10-07.md
+@@ -0,0 +1,187 @@
++# CCG 深度双模型审查（QM-6）后端解析缺陷复盘
++
++- 日期：2026-10-07
++- 分支：`ccg-review-claude-path`（worktree `D:/Data/projects/mp-worktrees/mp-ccg-review-claude-path`）
++- 影响面：`scripts/deep-review.sh`（QM-6 本地入口）与其上游 `adversarial-review-loop` 引擎
++- 症状：双模型外部审查时 `claude` 报「不在 PATH」，引擎**静默降级成单后端**
++
++---
++
++## 一、根因
++
++### 1.1 表面现象
++
++跑 CCG 双模型外部审查（QM-6）时，`claude` 不在 PATH。`codeagent-wrapper` 用**裸名** spawn
++后端，于是评审后端缺席。
++
++### 1.2 第一性原因：进程 PATH 里的 C: 盘条目被剥掉了盘符
++
++实测（本机 2026-10-07）进程 `$env:PATH` 中存在两种形态并存的情况：
++
++| 注册表（HKCU + HKLM）里的形态 | 进程 `$env:PATH` 里的形态 |
++|---|---|
++| `C:\Users\<user>\.local\bin` | `\Users\<user>\.local\bin` |
++| `D:\Program Files\npm-global` | `\Program Files\npm-global` |
++
++**Windows 会把「无盘符的 PATH 条目」按当前工作目录所在盘符解析。** 实测：
++
++```
++cwd = D:\Data\projects\mulpub   （仓库所在盘）
++  where claude    -> 找不到
++  where opencode  -> D:\Program Files\npm-global\opencode
++  where codex     -> D:\Program Files\npm-global\codex
++
++cwd = C:\
++  where claude    -> C:\Users\<user>\.local\bin\claude.exe
++  where opencode  -> 找不到
++  where codex     -> 找不到
++```
++
++两组条目**没有任何一条同时对两个盘符有效**。仓库 cwd 在 D: → 恰好 `claude` 挂、
++`opencode`/`codex` 好用。这与 `.quality-gates.md` 里那次
++「通道偏差声明：primary 前端 claude 静默空转（rc=2、completed without agent_message
++output、无产物）⇒ 降级 opencode 免费模型」的现象完全吻合。
++
++`claude.exe` 本体健康（`2.1.278 (Claude Code)`），注册表里的 PATH 也是对的——坏的只是
++**会话进程继承下来的那份**。git 钩子与非登录 shell 又不重读注册表，于是稳定复现。
++
++### 1.3 第二性原因：入口脚本把「告警」当成了「处理」
++
++`scripts/deep-review.sh` 由 `d98f54db`（PR #2955，2026-10-06 01:09:40）**一次引入**，
++下面两行从出生就在，不是从可用态退化来的：
++
++```sh
++command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
++command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
++```
++
++这两句**发现了问题，但不改变任何行为**：不补 PATH、不改退出码、不阻断。评审照跑、
++结论照出，只是少了一路跨家族交叉验证。旁边对 `codeagent-wrapper` 的处理恰恰相反
++（找不到就 `exit 2`）——同一个「依赖体检」段落里两种哲学并存。
++
++---
++
++## 二、逃逸分析（逐层）
++
++| 层 | 为什么没拦住 |
++|---|---|
++| 单元测试 | `deep-review.sh` **从来没有任何测试**。它不在任何 `node --test` 列表里，CI 也没有结构锁保护。本 PR 补 7 例。 |
++| 集成测试 | 深度审查**明确不进 CI**（脚本头注释：单次 >15 分钟，挂 required check 会把仓库锁死）。于是 PR 层也没有它的回归保护，只能靠人工把关。 |
++| 端到端 | 有 QM-6 人工环节，产物是 `.quality-gates.md` 记录 + `.ccg/qm6-*.json`。但**人眼看的是评审结论，不是「几路后端参与了」**。 |
++| 代码审查 | `d98f54db` 的评审重点在「wrapper 缺失要 exit 2」；两条 `|| say` 看起来是合理的降级提示。关键是**评审者当时的环境里 claude 是可解析的**——环境恰好是好的，缺陷就不可见。 |
++| 流程 | `.quality-gates.md` 允许把降级「如实登记」后继续。降级因此从异常变成**可接受常态**，掩盖了它其实是环境缺陷而非审查本身的问题。 |
++
++---
++
++## 三、系统性漏洞定位
++
++1. **告警不改行为**（结构性根因）。凡是「发现了但照跑」的检查，实质上把缺陷转化为
++   沉默。本仓的 fail-closed 原则在别处执行得很严，唯独这里开了口子。
++2. **依赖继承的 PATH 而非绝对路径**。凡是把「环境可解析性」当输入的脚本都在赌会话
++   环境。值得注意的是 `deep-review.sh` 自己的第 1 步**已经**为 `node` 写过同类兜底
++   （`fnm env` 兜底，注释写明「git 钩子不继承登录 shell 的 PATH，node 常常在这里丢失」）——
++   这个问题在本仓已被认知过一次，但只修了 `node` 一个工具，没推广到评审后端。
++3. **缺诊断入口**。真降级时没有一条命令能问「为什么少了一路」，只能靠读引擎日志反推。
++4. **降级被流程合法化**（掩盖层）。见上表最后一行的流程层。
++
++---
++
++## 四、修复与回归保护
++
++### 4.1 机器层（本机环境态，不在版本控制内）
++
++在**全盘符限定**的 PATH 目录里放一个指向真身的符号链接，使其与 cwd 所在盘符无关：
++
++- 位置：`C:\hermes-home\bin\claude.exe` → `C:\Users\<user>\.local\bin\claude.exe`
++  （`C:\hermes-home` 是 junction，真实路径 `C:\Users\<user>\bin`）
++- 为什么用符号链接而不是 `.cmd` shim：实测 wrapper 走 `CreateProcess`
++  （`UseShellExecute=false`），**不解析 `.cmd`**，放 `.cmd` 上去只会把失败推迟到引擎深处。
++  符号链接还不会像硬链接那样在 Claude Code 自更新后滞留在旧版本。
++- 实测收益：`where claude` 在 D: 与 C: 两个盘符下均命中；
++  `codeagent-wrapper --backend claude` 端到端 `exit=0`、stdout 返回正常内容。
++
++### 4.2 仓库层（本次 PR，持久化）
++
++`scripts/deep-review.sh` 不再信任继承的 PATH：
++
++1. 新增 `posix_dir` / `candidate_dirs` / `resolve_backend` / `report_backends`。
++   候选目录：`$HOME/.local/bin`、`$HOME/bin`、`$APPDATA/npm`、`npm prefix -g`
++   （经 `cygpath -u` 或 sed 归一）、`$CCG_BACKEND_BIN_DIRS`（显式追加）。
++2. 命中即把目录 `prepend` 进 PATH 并 **`export`**（wrapper 是子进程，看不到未导出的
++   shell 变量——这是「补了等于没补」的常见坑）。
++3. 状态四取一并如实分开报出：
++   - `PATH` 裸名已可解析
++   - `ABS` 原本不可解析，已按绝对路径补入
++   - `CMD` 只找到 `.cmd`/`.bat` → **明确判为不可用**并说明 CreateProcess 限制
++   - `MISS` 彻底找不到 → 给出可操作修法
++4. 新增 `--check-deps`：**纯依赖体检入口**，刻意放在定位 node / 驱动 / 判定记录**之前**，
++   即「环境坏掉时的第一手诊断」自己不能依赖那些可能已坏的东西。
++   为此把 `ROOT` 的计算从 `dirname -- "$0"` 改成参数展开——`dirname` 原本是全脚本第一个
++   外部依赖，实测它会先于体检逻辑把 `--check-deps` 打死
++   （`dirname: command not found`）。
++5. 退出码分三档：两个后端都在 = 0；有缺失 = 2。**单后端不算通过**——那正是本条坑
++   造成的形态，把它判 0 会让体检语义与它要检的缺陷相反。主流程仍保持非致命（与旧语义
++   一致），要 fail-closed 请显式用 `--check-deps`。
++
++### 4.3 回归保护测试
++
++`scripts/deep-review-deps.test.js`，7 例，用**假 HOME + 最小 PATH**（`/usr/bin:/bin`）
++精确复现「后端不在 PATH 却已安装」这一条件——修复前 5/5 全红，修复后 7/7 全绿：
++
++1. 后端不在 PATH 但装在 `$HOME/.local/bin` → 必须判为可用并报出补入的绝对路径
++2. 只存在 `.cmd` → 必须告警 CreateProcess 限制，不得判为可用
++3. 后端确实不存在 → `--check-deps` 必须非零退出并给出可操作提示
++4. 降级为单后端 → 必须非零退出并点名「跨家族交叉验证会缺失」
++5. `--check-deps` 必须出现在用法说明里（诊断入口保持可发现）
++6. `ROOT` 计算不得再依赖 `dirname`
++7. 防回潮结构锁：不得写回 `command -v claude … || say` 的被动告警形态，
++   且必须存在 `prepend + export PATH` 的真实恢复动作
++
++已接线进 `.github/workflows/quality-gate.yml` 的 Gate 2b
++（`check-unwired-tests` 实跑：检查域内 59 份测试全部接线或按欠账登记，rc=0）。
++
++### 4.4 真实环境取证
++
++```
++# 真实环境（PATH 正常）
++$ sh scripts/deep-review.sh --check-deps
++  ✓ codeagent-wrapper  /c/Users/<user>/.claude/bin/codeagent-wrapper.exe
++  · claude  [PATH] 裸名已可解析（无需干预）（评审后端（主力））
++  · opencode  [PATH] 裸名已可解析（无需干预）（出方案后端 / 跨家族校验）
++体检通过：后端可用。                                    rc=0
++
++# 故意打成坏 PATH（模拟无机器层符号链接时的真实形态）
++$ PATH=/usr/bin:/bin sh scripts/deep-review.sh --check-deps
++  · claude  [ABS] 已从绝对路径补入 PATH: /c/Users/<user>/.local/bin/claude
++  · opencode  [MISS] 找不到（PATH 与候选目录均未命中）
++      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），…
++体检不通过：见上方逐条修法。                            rc=2
++```
++
++第二段是本次修复的核心证据：坏 PATH 下 `claude` 仍被**绝对路径分支救回**，
++`opencode` 诚实报缺失并给修法，退出码自解释。
++
++---
++
++## 五、预防措施
++
++1. **已落地**：告警改行为（`--check-deps` 三档退出码）+ 绝对路径解析 + 独立诊断入口 +
++   防回潮结构锁。
++2. **本仓既有认知的推广**：第 1 步为 `node` 写过 PATH 兜底，本次把同一思路推广到评审
++   后端。后续若有脚本把「某个 CLI 能否解析」当输入，应默认继承同一套候选目录解析，
++   不要新写 `command -v` 一次性告警。
++3. **流程层待办（不在本 PR 范围）**：
++   - `.quality-gates.md` 允许 QM-6 降级「如实登记」，建议补一条：**降级登记时必须附
++     `--check-deps` 输出**，否则「登记」会退化成「免责」。
++   - QM-6 记录应显式写明**实际参与了几路后端**，而不只是结论。
++4. **未在本 PR 修**：其他脚本对继承 PATH 的依赖（本次只审了 `deep-review.sh` 一条路径）。
++
++## 六、附：一条无害观察
++
++wrapper 诊断头打印的命令行里 `--setting-sources` 后面是**空值**：
++
++```
++Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
++```
++
++实测该形态调用正常（`exit=0`、stdout 正常），故判定为无害，未按缺陷处理，仅留痕。
+diff --git a/scripts/deep-review-deps.test.js b/scripts/deep-review-deps.test.js
+new file mode 100644
+index 00000000..dd87a7ef
+--- /dev/null
++++ b/scripts/deep-review-deps.test.js
+@@ -0,0 +1,172 @@
++"use strict"
++
++// CCG 深度双模型审查（QM-6）后端依赖体检的回归保护。
++//
++// 背景（本机 2026-10-07 实测根因）：
++//   codeagent-wrapper 用**裸名** spawn 后端（stderr 诊断头原文：
++//   `Command: claude -p --dangerously-skip-permissions ...`），所以后端 CLI
++//   能否解析完全取决于 PATH。本机进程 PATH 里 C: 盘条目被剥掉了盘符
++//   （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
++//   而 Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
++//     cwd 在 D: → claude 不可解析（仓库正好在 D:）
++//     cwd 在 C: → opencode / codex 反而不可解析
++//   没有任何一条条目能同时对两个盘符有效。
++//
++// 为什么这值得一个锁：症状不是报错退出，而是引擎**静默降级成单后端**——
++// 评审照跑、结论照出，只是少了一路跨家族交叉验证。.quality-gates.md 里
++// 那次「通道偏差声明：primary 前端 claude 静默空转 ⇒ 降级 opencode 免费模型」
++// 就是这个坑的产物。旧实现对此只有一句 `⚠ 找不到 claude` 的被动告警，
++// 照跑不误，属典型的「有告警但告警不改变行为」。
++//
++// 本锁用「假 HOME + 最小 PATH」精确复现该条件：PATH 里没有后端，
++// 但后端确实装在 $HOME/.local/bin —— 修复前必红，修复后必须绿。
++
++const assert = require("node:assert/strict")
++const fs = require("node:fs")
++const os = require("node:os")
++const path = require("node:path")
++const { test } = require("node:test")
++const { spawnSync } = require("node:child_process")
++
++const ROOT = path.join(__dirname, "..")
++const SCRIPT = path.join(ROOT, "scripts", "deep-review.sh")
++
++// 本机跑脚本需要 Git for Windows Bash（裸 bash 可能解析到 WSL，且本机 PATH 无 bash）。
++// 与 start-mp-task.ps1 / branch-naming-contract.test.js 同一探测链：
++// MP_GIT_BASH 覆盖 → git 派生 → 硬编码候选。CI（ubuntu）上系统 bash 在 PATH。
++function resolveGitBash() {
++  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
++  const candidates = []
++  try {
++    const { execFileSync } = require("node:child_process")
++    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
++    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
++  } catch {}
++  candidates.push(
++    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
++    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
++    "D:\\Program Files\\Git\\usr\\bin\\bash.exe",
++  )
++  for (const c of candidates) {
++    if (fs.existsSync(c)) {
++      const gitRoot = c.replace(/[\\/]usr[\\/]bin[\\/]bash\.exe$|[\\/]bin[\\/]bash\.exe$/, "")
++      if (gitRoot && fs.existsSync(path.join(gitRoot, "usr", "bin", "dirname.exe"))) return c
++    }
++  }
++  return "bash"
++}
++
++// 故意「贫瘠」的 PATH：只留 POSIX 基础工具目录，**不含任何后端安装目录**。
++// 这正是本机 cwd 在 D: 时的真实形态（.local\bin 那条被剥了盘符，落在 D: 上不存在）。
++const BARE_PATH = "/usr/bin:/bin"
++
++let seq = 0
++function makeFakeHome(backends) {
++  const home = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-deps-${process.pid}-${seq++}-`))
++  // wrapper 默认在 $HOME/.claude/bin —— 同样按假 HOME 造桩，否则体检会先在 wrapper 上退出。
++  fs.mkdirSync(path.join(home, ".claude", "bin"), { recursive: true })
++  fs.writeFileSync(path.join(home, ".claude", "bin", "codeagent-wrapper.exe"), "stub")
++  for (const [name, file] of Object.entries(backends || {})) {
++    const dir = path.join(home, ".local", "bin")
++    fs.mkdirSync(dir, { recursive: true })
++    fs.writeFileSync(path.join(dir, file), `#!/bin/sh\nexit 0\n`)
++    assert.ok(name, "backends 的键是后端名")
++  }
++  return home
++}
++
++function runCheckDeps(home, extraEnv) {
++  const res = spawnSync(resolveGitBash(), [SCRIPT, "--check-deps"], {
++    encoding: "utf8",
++    timeout: 60000,
++    env: {
++      PATH: BARE_PATH,
++      HOME: home,
++      USERPROFILE: home,
++      // 显式清空：不能被调用者的环境污染（父进程 PATH 里可能有真 claude）。
++      CCG_BACKEND_BIN_DIRS: "",
++      ...(extraEnv || {}),
++    },
++  })
++  return { rc: res.status, out: `${res.stdout || ""}${res.stderr || ""}` }
++}
++
++// ① 核心回归锁：后端不在 PATH，但装在 $HOME/.local/bin —— 修复前必红。
++test("后端不在 PATH 但装在 $HOME/.local/bin 时，必须按绝对路径恢复为可用", () => {
++  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
++  const { rc, out } = runCheckDeps(home)
++  assert.match(out, /claude/, "体检输出必须点名 claude")
++  assert.match(out, /opencode/, "体检输出必须点名 opencode")
++  // 关键：不能再是「找不到」。旧实现在这里只会 say 一句 ⚠ 然后照跑。
++  assert.doesNotMatch(out, /claude[^\n]*找不到/, "claude 已装在 $HOME/.local/bin，不得判为找不到")
++  assert.match(out, /\.local[\\/]bin/, "必须报出补入 PATH 的绝对路径，便于事后核对")
++  assert.match(out, /已从绝对路径补入 PATH/, "必须明确区分「靠 PATH 命中」与「靠绝对路径补入」")
++  assert.equal(rc, 0, "两个后端都可用时体检应通过退出")
++})
++
++// ② 把本机实测到的硬事实钉住：.cmd/.bat 是 CreateProcess 起不来的。
++// 若这里判成「可用」，引擎会拿一个起不来的后端去跑，失败信息还落在很后面。
++test("只存在 .cmd 时必须告警，不得判为可用（wrapper 走 CreateProcess，起不了 .cmd）", () => {
++  const home = makeFakeHome({ claude: "claude.cmd" })
++  const { out } = runCheckDeps(home)
++  assert.match(out, /CreateProcess/, "必须点明这是 CreateProcess 的限制，否则无人知道下一步做什么")
++  assert.match(out, /\.cmd/, "必须点名实际命中的文件")
++})
++
++// ③ fail-closed：真的没有后端时不能静默降级，诊断命令要能自己失败。
++test("后端确实不存在时，--check-deps 必须非零退出并给出可操作提示", () => {
++  const home = makeFakeHome({})
++  const { rc, out } = runCheckDeps(home)
++  assert.notEqual(rc, 0, "一个后端都不可用时不得返回 0")
++  assert.match(out, /claude/, "必须点名缺失的后端")
++  assert.match(out, /找不到|不可用/, "必须说清是「找不到」而不是含糊的「失败」")
++  assert.match(out, /npm|安装|装/, "必须给出下一步可操作动作，不能只报错")
++})
++
++// ④ 结构锁：诊断入口必须留在用法说明里，否则真出事时没人知道有这条命令。
++test("--check-deps 必须在用法说明中出现（诊断入口要保持可发现）", () => {
++  const src = fs.readFileSync(SCRIPT, "utf8")
++  assert.match(src, /--check-deps/, "用法块未提及 --check-deps")
++  const usageAt = src.indexOf("--check-deps")
++  const helpAt = src.indexOf("--help")
++  assert.ok(usageAt >= 0 && helpAt >= 0, "用法块与 --help 分支都应存在")
++  assert.ok(usageAt < helpAt, "--check-deps 应出现在 --help 之前的用法说明里")
++})
++
++// ⑥b 退出码分三档：单后端就是本条坑造成的降级形态，不能判 0。
++// 否则体检自己的语义与它要检的缺陷相反。
++test("只剩单后端时 --check-deps 必须返回非零并点名降级（不能判通过）", () => {
++  const home = makeFakeHome({ claude: "claude" }) // 故意不给 opencode
++  const { rc, out } = runCheckDeps(home)
++  assert.notEqual(rc, 0, "只剩一个后端时不得返回 0")
++  assert.match(out, /只剩单后端|跨家族/, "必须明说已降级、且缺的是跨家族交叉验证")
++  assert.doesNotMatch(out, /体检通过：后端可用/, "降级态不得出现「体检通过」字样")
++})
++
++// ⑦ 诊断入口自身不得有前置外部依赖。
++// 实测踩到：ROOT 用 dirname -- "$0" 计算，而那是全脚本第一个外部依赖；
++// 本机 PATH 会丢工具目录，于是 `--check-deps` 先被 `dirname: command not found`
++// 打死——一个「查别人坏没坏」的命令自己先坏了。
++test("--check-deps 路径上不得依赖 dirname（诊断入口自身必须无前置外部依赖）", () => {
++  const src = fs.readFileSync(SCRIPT, "utf8")
++  assert.doesNotMatch(
++    src,
++    /ROOT="\$\(cd "\$\(dirname/,
++    "ROOT 计算不得再用 dirname；否则 --check-deps 会被 dirname 缺失打死",
++  )
++  assert.match(src, /_self_dir="\$\{_self_dir%\/\*\}"/, "应改用参数展开剥掉最后一段路径")
++})
++
++// ⑦ 防回潮：不得再写回「只 say 一句被动告警然后照跑」的旧形态。
++test("不得回潮成被动告警：后端体检必须在补 PATH 之后再判定", () => {
++  const src = fs.readFileSync(SCRIPT, "utf8")
++  // 旧实现原句：command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude …"
++  assert.doesNotMatch(
++    src,
++    /command -v claude[^\n]*\|\|\s*say/,
++    "claude 的可用性判定不得退化为「不在 PATH 就 say 一句然后继续跑」",
++  )
++  // 真正的恢复动作必须存在：把探测到的目录 prepend 进 PATH 并导出。
++  assert.match(src, /PATH="\$[A-Za-z_]+:\$PATH"/, "必须存在把目录 prepend 进 PATH 的恢复动作")
++  assert.match(src, /export PATH/, "恢复后的 PATH 必须导出，否则子进程（wrapper）看不到")
++})
+diff --git a/scripts/deep-review.sh b/scripts/deep-review.sh
+index 746e970b..c0fd4a89 100644
+--- a/scripts/deep-review.sh
++++ b/scripts/deep-review.sh
+@@ -9,31 +9,203 @@
+ # 会把仓库锁死。它是本地跑、结果落盘进 PR 的人工把关环节。
+ #
+ # 用法：
+-#   sh scripts/deep-review.sh            # 读 HEAD 的判定记录，按 mode 决定跑不跑
+-#   sh scripts/deep-review.sh --force    # 忽略 mode=skip，强制跑
+-#   sh scripts/deep-review.sh --dry-run  # 只打印将要做什么
++#   sh scripts/deep-review.sh              # 读 HEAD 的判定记录，按 mode 决定跑不跑
++#   sh scripts/deep-review.sh --force      # 忽略 mode=skip，强制跑
++#   sh scripts/deep-review.sh --dry-run    # 只打印将要做什么
++#   sh scripts/deep-review.sh --check-deps # 只体检评审后端依赖（不需要 node / git 记录）
+ #
+ # 退出码：0 无阻断 / 1 有阻断 / 2 环境或配置问题
+ 
+ set -u
+ 
+-ROOT="$(cd "$(dirname -- "$0")/.." && pwd)"
++# 刻意不依赖 dirname：这行在任何别的检查之前跑，是全脚本第一个外部依赖。
++# 用 dirname 的话，--check-deps 这个「环境坏掉时的第一手诊断」会先被
++# `dirname: command not found` 打死——而本机 PATH 恰恰是会丢工具目录的那种
++# （见下面「后端解析」注释）。参数展开版对相对/绝对 $0 语义完全一致。
++_self_dir="$0"
++case "$_self_dir" in
++  */*) _self_dir="${_self_dir%/*}" ;;
++  *)   _self_dir="." ;;
++esac
++ROOT="$(cd "$_self_dir/.." && pwd)"
+ cd "$ROOT" || exit 2
+ 
+ FORCE=0
+ DRY=0
++CHECK_DEPS=0
+ for a in "$@"; do
+   case "$a" in
+     --force) FORCE=1 ;;
+     --dry-run) DRY=1 ;;
++    --check-deps) CHECK_DEPS=1 ;;
+     --help|-h)
+-      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
++      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
+       exit 0 ;;
+   esac
+ done
+ 
+ say() { printf '%s\n' "$1"; }
+ 
++# ==========================================================================
++#  后端解析：为什么不能只靠继承来的 PATH
++# ==========================================================================
++# codeagent-wrapper 用**裸名** spawn 后端（实测 stderr 诊断头原文：
++#   Command: claude -p --dangerously-skip-permissions --output-format stream-json ...
++#），所以后端能不能起来只取决于 PATH。
++#
++# 而本机进程 PATH 不可信：里面 C: 盘的条目被剥掉了盘符
++# （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
++# Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
++#   cwd 在 D: → claude 不可解析（仓库正好在 D:）
++#   cwd 在 C: → opencode / codex 反而不可解析
++# 没有任何一条条目能同时对两个盘符有效。git 钩子与非登录 shell 又不重读
++# 注册表，于是这条坑稳定复现，且症状不是报错退出，而是引擎**静默降级成
++# 单后端**——评审照跑、结论照出，只是少了一路跨家族交叉验证。
++# （.quality-gates.md 那次「通道偏差声明：primary 前端 claude 静默空转
++#   ⇒ 降级 opencode 免费模型」就是本条坑的产物。）
++#
++# 所以：命中即把目录 prepend 进 PATH 并**导出**（wrapper 是子进程，
++# 看不到未导出的 shell 变量），并把「靠 PATH 命中」与「靠绝对路径补入」
++# 如实分开报出来。
++
++# Windows 风格路径 → POSIX 风格。
++# `npm prefix -g` 在 Windows 上返回反斜杠路径，直接拼进 sh 的 PATH 会失效。
++posix_dir() {
++  _pd="$1"
++  [ -n "$_pd" ] || return 1
++  if command -v cygpath >/dev/null 2>&1; then
++    _po="$(cygpath -u "$_pd" 2>/dev/null)" || _po=""
++    [ -n "$_po" ] && { printf '%s' "$_po"; return 0; }
++  fi
++  case "$_pd" in
++    [A-Za-z]:*)
++      _pv="$(printf '%s' "$_pd" | cut -c1 | tr 'A-Z' 'a-z')"
++      printf '%s' "$_pd" | sed -e 's|\\|/|g' -e "s|^${_pv}:|/${_pv}|"
++      ;;
++    *) printf '%s' "$_pd" ;;
++  esac
++}
++
++# 候选目录清单（不依赖 PATH 本身，故 PATH 坏掉时仍可用）。
++#   $HOME/.local/bin  Claude Code 原生安装位置
++#   $HOME/bin          常见手工安装位置
++#   $APPDATA/npm       Windows npm 默认全局 bin
++#   npm prefix -g      自定义 npm 全局前缀（opencode / codex 通常装在这）
++#   $CCG_BACKEND_BIN_DIRS  显式追加（冒号或分号分隔），给非常规安装与测试用
++candidate_dirs() {
++  [ -n "$HOME" ] && printf '%s\n' "$HOME/.local/bin" "$HOME/bin"
++  [ -n "$APPDATA" ] && printf '%s\n' "$APPDATA/npm"
++  if command -v npm >/dev/null 2>&1; then
++    _pp="$(npm prefix -g 2>/dev/null)" || _pp=""
++    if [ -n "$_pp" ]; then
++      _pq="$(posix_dir "$_pp" 2>/dev/null)" || _pq=""
++      [ -n "$_pq" ] && printf '%s\n' "$_pq"
++    fi
++  fi
++  if [ -n "${CCG_BACKEND_BIN_DIRS:-}" ]; then
++    printf '%s' "$CCG_BACKEND_BIN_DIRS" | tr ':;' '\n\n'
++  fi
++  return 0
++}
++
++# 探一个后端。输出 "<状态>|<说明>"，状态四取一：
++#   PATH  已在 PATH，裸名可解析
++#   ABS   原本不可解析，已按绝对路径补进 PATH（真身可直接 spawn）
++#   CMD   只找到 .cmd/.bat —— CreateProcess 起不来，只能算半个可用
++#   MISS  彻底找不到
++resolve_backend() {
++  _rb_tool="$1"
++  if command -v "$_rb_tool" >/dev/null 2>&1; then
++    printf 'PATH|裸名已可解析（无需干预）'
++    return 0
++  fi
++  for _rb_d in $(candidate_dirs); do
++    [ -n "$_rb_d" ] || continue
++    [ -d "$_rb_d" ] || continue
++    for _rb_f in "$_rb_d/$_rb_tool" "$_rb_d/$_rb_tool.exe" "$_rb_d/$_rb_tool.com" \
++                  "$_rb_d/$_rb_tool.cmd" "$_rb_d/$_rb_tool.bat"; do
++      [ -f "$_rb_f" ] || continue
++      PATH="$_rb_d:$PATH"
++      export PATH
++      case "$_rb_f" in
++        *.cmd|*.bat)
++          # 实测：wrapper 走 CreateProcess（UseShellExecute=false），它不解析
++          # .cmd/.bat；放个 .cmd 上去只会把失败推迟到引擎深处、错误信息还更难读。
++          printf 'CMD|只找到 %s —— CreateProcess 起不了 .cmd/.bat，wrapper 仍会失败' "$_rb_f"
++          return 0 ;;
++        *)
++          printf 'ABS|已从绝对路径补入 PATH: %s' "$_rb_f"
++          return 0 ;;
++      esac
++    done
++  done
++  printf 'MISS|找不到（PATH 与候选目录均未命中）'
++  return 1
++}
++
++# 逐个后端体检并打印。
++# 退出码刻意分三档而不是「有一个能跑就算过」——单后端正是本条坑造成的降级形态，
++# 把它做成 0 会让体检失去意义：
++#   0  两个后端都在（双模型齐备）
++#   2  有后端缺失（能跑，但已降级；两个都缺时另加硬提示）
++report_backends() {
++  _rb_rc=0
++  _rb_ok=0
++  for _rb_b in claude opencode; do
++    case "$_rb_b" in
++      claude)   _rb_why="评审后端（主力）" ;;
++      opencode) _rb_why="出方案后端 / 跨家族校验" ;;
++    esac
++    _rb_st="$(resolve_backend "$_rb_b")"
++    _rb_code="${_rb_st%%|*}"
++    _rb_msg="${_rb_st#*|}"
++    say "  · $_rb_b  [$_rb_code] $_rb_msg（$_rb_why）"
++    case "$_rb_code" in
++      PATH|ABS) _rb_ok=1 ;;
++      CMD)
++        say "      ↳ 修法：让真身以 .exe/.com 形式出现在某个全盘符限定的 PATH 目录下"
++        say "        （符号链接 / 硬链接都可以；.cmd 不作数，原因见上）" ;;
++      MISS)
++        _rb_rc=2
++        say "      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），"
++        say "        或把它所在目录写进系统 PATH 后重开终端；"
++        say "        也可用 CCG_BACKEND_BIN_DIRS 显式指一个目录" ;;
++    esac
++  done
++  if [ "$_rb_ok" -eq 0 ]; then
++    say ""
++    say "  ✗ 没有任何评审后端可用 —— 深度审查根本起不来。"
++  else
++    say ""
++    say "  ⚠ 只剩单后端可用 —— 评审能跑，但跨家族交叉验证会缺失（这正是本条坑的形态）。"
++  fi
++  return "$_rb_rc"
++}
++
++# ---------- 0a. 纯依赖体检（--check-deps）----------
++# 刻意放在定位 node / 驱动 / 判定记录**之前**：这是「为什么我的评审降级了」
++# 的第一手诊断入口，真出事时 node 可能本身就是坏的，届时仍要能问。
++if [ "$CHECK_DEPS" -eq 1 ]; then
++  say "═══ CCG 深度审查 · 依赖体检 ═══"
++  _CD_WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
++  if [ -f "$_CD_WRAPPER" ] || [ -x "$_CD_WRAPPER" ]; then
++    say "  ✓ codeagent-wrapper  $_CD_WRAPPER"
++    _CD_RC=0
++  else
++    say "  ✗ codeagent-wrapper 找不到: $_CD_WRAPPER"
++    say "    修法：npx ccg-workflow（生成 wrapper）"
++    _CD_RC=2
++  fi
++  report_backends || _CD_RC=2
++  say ""
++  if [ "$_CD_RC" -eq 0 ]; then
++    say "体检通过：后端可用。"
++  else
++    say "体检不通过：见上方逐条修法。"
++  fi
++  exit "$_CD_RC"
++fi
++
+ # ---------- 1. 定位 node ----------
+ if ! command -v node >/dev/null 2>&1; then
+   if [ -d "$HOME/.fnm" ]; then
+@@ -100,8 +272,9 @@ WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
+   say "  生成：npx ccg-workflow"
+   exit 2
+ }
+-command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
+-command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
++# 后端体检**并补 PATH**（旧实现只 say 一句被动告警然后照跑 ⇒ 静默降级）。
++# 这里保持非致命，与旧语义一致：真要 fail-closed 请用 --check-deps。
++report_backends || true
+ say ""
+ say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
+ say ""
+
+```
+
+> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。
\ No newline at end of file
diff --git a/.github/workflows/quality-gate.yml b/.github/workflows/quality-gate.yml
index f7497ad6..5e264a49 100644
--- a/.github/workflows/quality-gate.yml
+++ b/.github/workflows/quality-gate.yml
@@ -217,6 +217,10 @@ jobs:
           # openspec-sync-check.test.js 自带「镜像与真源逐字节一致」锁，但历史上从未被任何
           # workflow 收集（CI 只显式挂 scripts 下 5 个测试文件，无通配），锁等于没在跑；在此收编。
           node --test scripts/openspec-sync-check.test.js
+          # CCG 深度双模型审查（QM-6）的后端依赖体检锁：后端 CLI 不在 PATH 时引擎会
+          # **静默降级成单后端**（评审照跑、结论照出，只少一路跨家族交叉验证），
+          # 旧实现只有一句被动 ⚠ 告警。判据与假 HOME 复现方式见该测试头注释。
+          node --test scripts/deep-review-deps.test.js
           # 质量节拍 vendored 契约镜像（.quality-rhythm/）与 openspec 真源的漂移锁
           node --test scripts/quality-rhythm-spec-mirror.test.js
           # Windows PowerShell 5.1 读**无 BOM** 的 .ps1 时按 ANSI 码页解码，中文注释/字符串可让
diff --git a/docs/ccg-review-backend-path-2026-10-07.md b/docs/ccg-review-backend-path-2026-10-07.md
new file mode 100644
index 00000000..b03f5f95
--- /dev/null
+++ b/docs/ccg-review-backend-path-2026-10-07.md
@@ -0,0 +1,244 @@
+# CCG 深度双模型审查（QM-6）后端解析缺陷复盘
+
+- 日期：2026-10-07
+- 分支：`ccg-review-claude-path`（worktree `D:/Data/projects/mp-worktrees/mp-ccg-review-claude-path`）
+- 影响面：`scripts/deep-review.sh`（QM-6 本地入口）与其上游 `adversarial-review-loop` 引擎
+- 症状：双模型外部审查时 `claude` 报「不在 PATH」，引擎**静默降级成单后端**
+
+---
+
+## 一、根因
+
+### 1.1 表面现象
+
+跑 CCG 双模型外部审查（QM-6）时，`claude` 不在 PATH。`codeagent-wrapper` 用**裸名** spawn
+后端，于是评审后端缺席。
+
+### 1.2 第一性原因：进程 PATH 里的 C: 盘条目被剥掉了盘符
+
+实测（本机 2026-10-07）进程 `$env:PATH` 中存在两种形态并存的情况：
+
+| 注册表（HKCU + HKLM）里的形态 | 进程 `$env:PATH` 里的形态 |
+|---|---|
+| `C:\Users\<user>\.local\bin` | `\Users\<user>\.local\bin` |
+| `D:\Program Files\npm-global` | `\Program Files\npm-global` |
+
+**Windows 会把「无盘符的 PATH 条目」按当前工作目录所在盘符解析。** 实测：
+
+```
+cwd = D:\Data\projects\mulpub   （仓库所在盘）
+  where claude    -> 找不到
+  where opencode  -> D:\Program Files\npm-global\opencode
+  where codex     -> D:\Program Files\npm-global\codex
+
+cwd = C:\
+  where claude    -> C:\Users\<user>\.local\bin\claude.exe
+  where opencode  -> 找不到
+  where codex     -> 找不到
+```
+
+两组条目**没有任何一条同时对两个盘符有效**。仓库 cwd 在 D: → 恰好 `claude` 挂、
+`opencode`/`codex` 好用。这与 `.quality-gates.md` 里那次
+「通道偏差声明：primary 前端 claude 静默空转（rc=2、completed without agent_message
+output、无产物）⇒ 降级 opencode 免费模型」的现象完全吻合。
+
+`claude.exe` 本体健康（`2.1.278 (Claude Code)`），注册表里的 PATH 也是对的——坏的只是
+**会话进程继承下来的那份**。git 钩子与非登录 shell 又不重读注册表，于是稳定复现。
+
+### 1.3 第二性原因：入口脚本把「告警」当成了「处理」
+
+`scripts/deep-review.sh` 由 `d98f54db`（PR #2955，2026-10-06 01:09:40）**一次引入**，
+下面两行从出生就在，不是从可用态退化来的：
+
+```sh
+command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
+command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
+```
+
+这两句**发现了问题，但不改变任何行为**：不补 PATH、不改退出码、不阻断。评审照跑、
+结论照出，只是少了一路跨家族交叉验证。旁边对 `codeagent-wrapper` 的处理恰恰相反
+（找不到就 `exit 2`）——同一个「依赖体检」段落里两种哲学并存。
+
+---
+
+## 二、逃逸分析（逐层）
+
+| 层 | 为什么没拦住 |
+|---|---|
+| 单元测试 | `deep-review.sh` **从来没有任何测试**。它不在任何 `node --test` 列表里，CI 也没有结构锁保护。本 PR 补 7 例。 |
+| 集成测试 | 深度审查**明确不进 CI**（脚本头注释：单次 >15 分钟，挂 required check 会把仓库锁死）。于是 PR 层也没有它的回归保护，只能靠人工把关。 |
+| 端到端 | 有 QM-6 人工环节，产物是 `.quality-gates.md` 记录 + `.ccg/qm6-*.json`。但**人眼看的是评审结论，不是「几路后端参与了」**。 |
+| 代码审查 | `d98f54db` 的评审重点在「wrapper 缺失要 exit 2」；两条 `|| say` 看起来是合理的降级提示。关键是**评审者当时的环境里 claude 是可解析的**——环境恰好是好的，缺陷就不可见。 |
+| 流程 | `.quality-gates.md` 允许把降级「如实登记」后继续。降级因此从异常变成**可接受常态**，掩盖了它其实是环境缺陷而非审查本身的问题。 |
+
+---
+
+## 三、系统性漏洞定位
+
+1. **告警不改行为**（结构性根因）。凡是「发现了但照跑」的检查，实质上把缺陷转化为
+   沉默。本仓的 fail-closed 原则在别处执行得很严，唯独这里开了口子。
+2. **依赖继承的 PATH 而非绝对路径**。凡是把「环境可解析性」当输入的脚本都在赌会话
+   环境。值得注意的是 `deep-review.sh` 自己的第 1 步**已经**为 `node` 写过同类兜底
+   （`fnm env` 兜底，注释写明「git 钩子不继承登录 shell 的 PATH，node 常常在这里丢失」）——
+   这个问题在本仓已被认知过一次，但只修了 `node` 一个工具，没推广到评审后端。
+3. **缺诊断入口**。真降级时没有一条命令能问「为什么少了一路」，只能靠读引擎日志反推。
+4. **降级被流程合法化**（掩盖层）。见上表最后一行的流程层。
+
+---
+
+## 四、修复与回归保护
+
+### 4.1 机器层（本机环境态，不在版本控制内）
+
+在**全盘符限定**的 PATH 目录里放一个指向真身的符号链接，使其与 cwd 所在盘符无关：
+
+- 位置：`C:\hermes-home\bin\claude.exe` → `C:\Users\<user>\.local\bin\claude.exe`
+  （`C:\hermes-home` 是 junction，真实路径 `C:\Users\<user>\bin`）
+- 为什么用符号链接而不是 `.cmd` shim：实测 wrapper 走 `CreateProcess`
+  （`UseShellExecute=false`），**不解析 `.cmd`**，放 `.cmd` 上去只会把失败推迟到引擎深处。
+  符号链接还不会像硬链接那样在 Claude Code 自更新后滞留在旧版本。
+- 实测收益：`where claude` 在 D: 与 C: 两个盘符下均命中；
+  `codeagent-wrapper --backend claude` 端到端 `exit=0`、stdout 返回正常内容。
+
+### 4.2 仓库层（本次 PR，持久化）
+
+`scripts/deep-review.sh` 不再信任继承的 PATH：
+
+1. 新增 `posix_dir` / `candidate_dirs` / `resolve_backend` / `report_backends`。
+   候选目录：`$HOME/.local/bin`、`$HOME/bin`、`$APPDATA/npm`、`npm prefix -g`
+   （经 `cygpath -u` 或 sed 归一）、`$CCG_BACKEND_BIN_DIRS`（显式追加）。
+2. 命中即把目录 `prepend` 进 PATH 并 **`export`**（wrapper 是子进程，看不到未导出的
+   shell 变量——这是「补了等于没补」的常见坑）。
+3. 状态四取一并如实分开报出：
+   - `PATH` 裸名已可解析
+   - `ABS` 原本不可解析，已按绝对路径补入
+   - `CMD` 只找到 `.cmd`/`.bat` → **明确判为不可用**并说明 CreateProcess 限制
+   - `MISS` 彻底找不到 → 给出可操作修法
+4. 新增 `--check-deps`：**纯依赖体检入口**，刻意放在定位 node / 驱动 / 判定记录**之前**，
+   即「环境坏掉时的第一手诊断」自己不能依赖那些可能已坏的东西。
+   为此把 `ROOT` 的计算从 `dirname -- "$0"` 改成参数展开——`dirname` 原本是全脚本第一个
+   外部依赖，实测它会先于体检逻辑把 `--check-deps` 打死
+   （`dirname: command not found`）。
+5. 退出码分三档：两个后端都在 = 0；有缺失 = 2。**单后端不算通过**——那正是本条坑
+   造成的形态，把它判 0 会让体检语义与它要检的缺陷相反。主流程仍保持非致命（与旧语义
+   一致），要 fail-closed 请显式用 `--check-deps`。
+
+### 4.3 回归保护测试
+
+`scripts/deep-review-deps.test.js`，8 例，用**假 HOME + 最小 PATH**（`/usr/bin:/bin`）
+精确复现「后端不在 PATH 却已安装」这一条件。
+
+红绿口径要分清两个阶段（QM-6 评审 i4 指出原文档数字对不上）：
+
+- **首版 5 例**在修复前实测 **5/5 全红**（当时脚本只有这 5 条断言）。
+- 随后为 QM-6 评审补到 8 例；**修复后 8/8 全绿**。
+  编号 ①–⑧ 连续，每条注释与 `test()` 顺序一一对应。
+
+其中 3 例是 QM-6 评审直接催生的：② 的 `rc ≠ 0` 断言（i1）、④ 的含空格/含冒号
+候选目录（i2 + 下面第四节记的额外缺陷）、⑦ 从字符串级锁改成行为级（i7）。
+
+已接线进 `.github/workflows/quality-gate.yml` 的 Gate 2b
+（`check-unwired-tests` 实跑：检查域内 59 份测试全部接线或按欠账登记，rc=0）。
+
+### 4.4 真实环境取证
+
+```
+# 真实环境（PATH 正常）
+$ sh scripts/deep-review.sh --check-deps
+  ✓ codeagent-wrapper  /c/Users/<user>/.claude/bin/codeagent-wrapper.exe
+  · claude  [PATH] 裸名已可解析（无需干预）（评审后端（主力））
+  · opencode  [PATH] 裸名已可解析（无需干预）（出方案后端 / 跨家族校验）
+体检通过：后端可用。                                    rc=0
+
+# 故意打成坏 PATH（模拟无机器层符号链接时的真实形态）
+$ PATH=/usr/bin:/bin sh scripts/deep-review.sh --check-deps
+  · claude  [ABS] 已从绝对路径补入 PATH: /c/Users/<user>/.local/bin/claude
+  · opencode  [MISS] 找不到（PATH 与候选目录均未命中）
+      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），…
+体检不通过：见上方逐条修法。                            rc=2
+```
+
+第二段是本次修复的核心证据：坏 PATH 下 `claude` 仍被**绝对路径分支救回**，
+`opencode` 诚实报缺失并给修法，退出码自解释。
+
+---
+
+## 五、QM-6 拿自己的修复审自己（第二轮）
+
+修复推上去后，用**刚修好的通道**对本次改动跑了一遍 QM-6 深度双模型审查
+（commit `c689da94`，基线 `origin/main`，引擎自报
+`跨家族校验: proposer=opencode critic=claude 通过`）——这本身就是原问题已修复的
+最强证据：改动前这里是 claude 静默空转。
+
+`critic=claude` 给出 7 条（1 Critical + 2 Warning + 4 Info，最低分 correctness 5），
+引擎走自扮演裁决出口（`self_play`，置信权重 0.6，低于真跨家族的 1）。逐条处置：
+
+| id | 严重度 | 问题 | 处置 |
+|---|---|---|---|
+| i1 | Critical | `CMD` 分支既不置 `_rb_rc` 也不计数 → 两个后端只有 `.cmd` 时会打印「深度审查根本起不来」却 exit 0 并打印「体检通过」，自相矛盾 | 已修：`CMD` 置 `_rb_rc=2`；② 补 `rc ≠ 0` 断言 |
+| i2 | Warning | `for d in $(candidate_dirs)` 未加引号，含空格候选被按 IFS 拆词。本机 `npm prefix -g` 实测返回 `D:\Program Files\npm-global` ⇒ **「救 opencode/codex」那条分支在本机完全失效** | 已修：改 `while IFS= read -r` + here-doc（不用管道，管道会开子 shell，`export PATH` 与 `return` 都会丢） |
+| i3 | Warning | 主流程 `report_backends \|\| true` 之后无条件打印「依赖体检通过」 | 已修：按计数分支；**一个后端都没有时提前 `exit 2`** |
+| i4 | Info | 文档「修复前 5/5 全红」与 7 例对不上 | 已修：分两阶段写清（首版 5 例 5/5 红；最终 8 例 8/8 绿） |
+| i5 | Info | 注释称候选清单「不依赖 PATH 本身」属过度声称（`npm prefix -g` 走 `command -v npm`） | 已修：注释按实际能力收窄 |
+| i6 | Info | 测试注释编号混乱（⑥b、两个 ⑦、缺 ⑤） | 已修：重排为 ①–⑧ |
+| i7 | Info | ⑦ 用正则精确匹配 `${_self_dir%/*}` 实现串，合法重构会误报红 | 已修：改成行为级锁——往 PATH 塞一个必定失败的 `dirname`，看体检是否照常通过 |
+
+### 5.1 评审没命中、但被**自己的新测试**当场抓出的 3 个缺陷
+
+这一节值得单列：它们说明「写完就以为对了」和「有测试」是两件事。
+
+1. **`CCG_BACKEND_BIN_DIRS` 按 `:` 切分**。Windows 盘符自带冒号，
+   `C:\...\Program Files\npm-global` 被劈成 `C` 和 `\...` 两个废目录。
+   改为一律只按**分号**切（换行也算），消费方本就按行读。
+2. **候选列表最后一行被静默丢弃**。`printf '%s'` 不带尾换行，而
+   `while IFS= read -r` 在 EOF 处读到内容却返回非零 ⇒ 最后一个候选没被检查。
+   两处都改：生产者用 `printf '%s\n'`，消费者用 `while ... || [ -n "$_d" ]`。
+3. **`set -u` 下 `[ -n "$APPDATA" ]` 直接中止 `candidate_dirs`**。
+   最小 env（无 `APPDATA`）里，排在后面的 npm / `CCG_BACKEND_BIN_DIRS` 分支
+   一句都跑不到，候选列表被静默截短，后端于是被判「找不到」。
+   ——**这正是本次要消灭的「静默降级」，出现在修复自己的代码里**。
+   全部变量改 `${VAR:-}`（`$HOME` 在 4 处同样加固）。
+
+第 3 条尤其值得记住：它的失败形态与原 Bug **完全同构**（保护逻辑自己静默失效，
+外部只看到「找不到」）。凡是「负责发现问题的代码」，
+它自己的失败模式必须也走「明确报错」而不是「安静地少做一点」。
+
+### 5.2 第二轮之后的状态
+
+- `bash -n` rc=0；`node --test scripts/deep-review-deps.test.js` **8/8 绿**
+- 真实环境三档文案与退出码实测全部正确：
+
+| 形态 | 文案 | rc |
+|---|---|---|
+| 双模型齐备 | `体检通过：后端可用。`（**无**降级措辞） | 0 |
+| 降级（1/2） | `⚠ 只剩单后端可用 …` + `体检不通过` | 2 |
+| 全缺（0/2） | `✗ 没有任何评审后端可用 —— 深度审查根本起不来。` + `体检不通过` | 2 |
+
+「双模型齐备时误报只剩单后端」这个缺陷是**跑真实环境**时发现的（`_rb_ok` 只是
+0/1 标志，2/2 与 1/2 长得一样），已改为按**计数**分档，并给测试①补上
+「齐备时不得出现降级措辞」的断言。教训同 5.1：**夹具能过的测试 ≠ 真实环境正确**。
+
+---
+
+## 六、预防措施
+
+1. **已落地**：告警改行为（`--check-deps` 三档退出码）+ 绝对路径解析 + 独立诊断入口 +
+   防回潮结构锁。
+2. **本仓既有认知的推广**：第 1 步为 `node` 写过 PATH 兜底，本次把同一思路推广到评审
+   后端。后续若有脚本把「某个 CLI 能否解析」当输入，应默认继承同一套候选目录解析，
+   不要新写 `command -v` 一次性告警。
+3. **流程层待办（不在本 PR 范围）**：
+   - `.quality-gates.md` 允许 QM-6 降级「如实登记」，建议补一条：**降级登记时必须附
+     `--check-deps` 输出**，否则「登记」会退化成「免责」。
+   - QM-6 记录应显式写明**实际参与了几路后端**，而不只是结论。
+4. **未在本 PR 修**：其他脚本对继承 PATH 的依赖（本次只审了 `deep-review.sh` 一条路径）。
+
+## 七、附：一条无害观察
+
+wrapper 诊断头打印的命令行里 `--setting-sources` 后面是**空值**：
+
+```
+Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
+```
+
+实测该形态调用正常（`exit=0`、stdout 正常），故判定为无害，未按缺陷处理，仅留痕。
diff --git a/scripts/deep-review-deps.test.js b/scripts/deep-review-deps.test.js
new file mode 100644
index 00000000..b47459fc
--- /dev/null
+++ b/scripts/deep-review-deps.test.js
@@ -0,0 +1,217 @@
+"use strict"
+
+// CCG 深度双模型审查（QM-6）后端依赖体检的回归保护。
+//
+// 背景（本机 2026-10-07 实测根因）：
+//   codeagent-wrapper 用**裸名** spawn 后端（stderr 诊断头原文：
+//   `Command: claude -p --dangerously-skip-permissions ...`），所以后端 CLI
+//   能否解析完全取决于 PATH。本机进程 PATH 里 C: 盘条目被剥掉了盘符
+//   （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
+//   而 Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
+//     cwd 在 D: → claude 不可解析（仓库正好在 D:）
+//     cwd 在 C: → opencode / codex 反而不可解析
+//   没有任何一条条目能同时对两个盘符有效。
+//
+// 为什么这值得一个锁：症状不是报错退出，而是引擎**静默降级成单后端**——
+// 评审照跑、结论照出，只是少了一路跨家族交叉验证。.quality-gates.md 里
+// 那次「通道偏差声明：primary 前端 claude 静默空转 ⇒ 降级 opencode 免费模型」
+// 就是这个坑的产物。旧实现对此只有一句 `⚠ 找不到 claude` 的被动告警，
+// 照跑不误，属典型的「有告警但告警不改变行为」。
+//
+// 本锁用「假 HOME + 最小 PATH」精确复现该条件：PATH 里没有后端，
+// 但后端确实装在 $HOME/.local/bin —— 修复前必红，修复后必须绿。
+
+const assert = require("node:assert/strict")
+const fs = require("node:fs")
+const os = require("node:os")
+const path = require("node:path")
+const { test } = require("node:test")
+const { spawnSync } = require("node:child_process")
+
+const ROOT = path.join(__dirname, "..")
+const SCRIPT = path.join(ROOT, "scripts", "deep-review.sh")
+
+// 本机跑脚本需要 Git for Windows Bash（裸 bash 可能解析到 WSL，且本机 PATH 无 bash）。
+// 与 start-mp-task.ps1 / branch-naming-contract.test.js 同一探测链：
+// MP_GIT_BASH 覆盖 → git 派生 → 硬编码候选。CI（ubuntu）上系统 bash 在 PATH。
+function resolveGitBash() {
+  if (process.env.MP_GIT_BASH) return process.env.MP_GIT_BASH
+  const candidates = []
+  try {
+    const { execFileSync } = require("node:child_process")
+    const git = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim()
+    if (git) candidates.push(path.join(git, "..", "..", "usr", "bin", "bash.exe"))
+  } catch {}
+  candidates.push(
+    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
+    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
+    "D:\\Program Files\\Git\\usr\\bin\\bash.exe",
+  )
+  for (const c of candidates) {
+    if (fs.existsSync(c)) {
+      const gitRoot = c.replace(/[\\/]usr[\\/]bin[\\/]bash\.exe$|[\\/]bin[\\/]bash\.exe$/, "")
+      if (gitRoot && fs.existsSync(path.join(gitRoot, "usr", "bin", "dirname.exe"))) return c
+    }
+  }
+  return "bash"
+}
+
+// 故意「贫瘠」的 PATH：只留 POSIX 基础工具目录，**不含任何后端安装目录**。
+// 这正是本机 cwd 在 D: 时的真实形态（.local\bin 那条被剥了盘符，落在 D: 上不存在）。
+const BARE_PATH = "/usr/bin:/bin"
+
+let seq = 0
+function makeFakeHome(backends) {
+  const home = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-deps-${process.pid}-${seq++}-`))
+  // wrapper 默认在 $HOME/.claude/bin —— 同样按假 HOME 造桩，否则体检会先在 wrapper 上退出。
+  fs.mkdirSync(path.join(home, ".claude", "bin"), { recursive: true })
+  fs.writeFileSync(path.join(home, ".claude", "bin", "codeagent-wrapper.exe"), "stub")
+  for (const [name, file] of Object.entries(backends || {})) {
+    const dir = path.join(home, ".local", "bin")
+    fs.mkdirSync(dir, { recursive: true })
+    fs.writeFileSync(path.join(dir, file), `#!/bin/sh\nexit 0\n`)
+    assert.ok(name, "backends 的键是后端名")
+  }
+  return home
+}
+
+function runCheckDeps(home, extraEnv) {
+  const res = spawnSync(resolveGitBash(), [SCRIPT, "--check-deps"], {
+    encoding: "utf8",
+    timeout: 60000,
+    env: {
+      PATH: BARE_PATH,
+      HOME: home,
+      USERPROFILE: home,
+      // 显式清空：不能被调用者的环境污染（父进程 PATH 里可能有真 claude）。
+      CCG_BACKEND_BIN_DIRS: "",
+      ...(extraEnv || {}),
+    },
+  })
+  return { rc: res.status, out: `${res.stdout || ""}${res.stderr || ""}` }
+}
+
+// ① 核心回归锁：后端不在 PATH，但装在 $HOME/.local/bin —— 修复前必红。
+test("后端不在 PATH 但装在 $HOME/.local/bin 时，必须按绝对路径恢复为可用", () => {
+  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
+  const { rc, out } = runCheckDeps(home)
+  assert.match(out, /claude/, "体检输出必须点名 claude")
+  assert.match(out, /opencode/, "体检输出必须点名 opencode")
+  // 关键：不能再是「找不到」。旧实现在这里只会 say 一句 ⚠ 然后照跑。
+  assert.doesNotMatch(out, /claude[^\n]*找不到/, "claude 已装在 $HOME/.local/bin，不得判为找不到")
+  assert.match(out, /\.local[\\/]bin/, "必须报出补入 PATH 的绝对路径，便于事后核对")
+  assert.match(out, /已从绝对路径补入 PATH/, "必须明确区分「靠 PATH 命中」与「靠绝对路径补入」")
+  // 双模型齐备时不得出现降级措辞（只看 0/1 标志的旧实现会在这里误报「只剩单后端」）
+  assert.doesNotMatch(out, /只剩单后端/, "两个后端都在时不得打印降级告警")
+  assert.doesNotMatch(out, /没有任何评审后端可用/, "两个后端都在时不得打印全缺告警")
+  assert.match(out, /体检通过/, "双模型齐备应判定通过")
+  assert.equal(rc, 0, "两个后端都可用时体检应通过退出")
+})
+
+// ② 把本机实测到的硬事实钉住：.cmd/.bat 是 CreateProcess 起不来的。
+// 若这里判成「可用」，引擎会拿一个起不来的后端去跑，失败信息还落在很后面。
+// rc 断言是 QM-6 评审 i1 补的：仅断言文案会放过「刚说完起不来、下一句体检通过
+// 却 exit 0」的自相矛盾。
+test("只存在 .cmd 时必须告警且判为不可用（wrapper 走 CreateProcess，起不了 .cmd）", () => {
+  const home = makeFakeHome({ claude: "claude.cmd" })
+  const { rc, out } = runCheckDeps(home)
+  assert.match(out, /CreateProcess/, "必须点明这是 CreateProcess 的限制，否则无人知道下一步做什么")
+  assert.match(out, /\.cmd/, "必须点名实际命中的文件")
+  assert.notEqual(rc, 0, "只命中 .cmd 时不得返回 0——那会让体检判成「体检通过」")
+})
+
+// ③ fail-closed：真的没有后端时不能静默降级，诊断命令要能自己失败。
+test("后端确实不存在时，--check-deps 必须非零退出并给出可操作提示", () => {
+  const home = makeFakeHome({})
+  const { rc, out } = runCheckDeps(home)
+  assert.notEqual(rc, 0, "一个后端都不可用时不得返回 0")
+  assert.match(out, /claude/, "必须点名缺失的后端")
+  assert.match(out, /找不到|不可用/, "必须说清是「找不到」而不是含糊的「失败」")
+  assert.match(out, /npm|安装|装/, "必须给出下一步可操作动作，不能只报错")
+})
+
+// ④ 候选目录含空格时仍必须能被找到（QM-6 评审 i2 的回归锁）。
+// 起因：`for d in $(candidate_dirs)` 按 IFS 拆词，而本机 `npm prefix -g`
+// 实测返回 `D:\Program Files\npm-global`——含空格，拆开后只剩两个废目录，
+// 于是「救 opencode/codex」那条分支在本机完全失效。
+// ④ 候选目录含空格、或路径自带冒号时，仍必须能被找到。
+// 两个缺陷叠在同一个「拆词/分隔符」选择上：
+//   · 命令替换按 IFS 拆词；本机 npm 全局 bin 实测含空格，
+//     拆开后只剩废目录，于是「救 opencode/codex」那条分支在本机完全失效
+//     （QM-6 评审 i2）。
+//   · 按冒号切 CCG_BACKEND_BIN_DIRS：Windows 盘符自带冒号，一样被劈开。
+//     这条是本 PR 自己的回归测试当场抓出来的，QM-6 评审没命中。
+test("候选目录含空格或冒号时仍必须命中（防命令替换/分隔符拆词回潮）", () => {
+  const home = makeFakeHome({})
+  // Windows 用盘符冒号、POSIX 用「名字里带冒号的目录」，
+  // 两条路径都能让「按冒号切」的实现变红，而不是只在 Windows 上有意义。
+  const isWin = process.platform === "win32"
+  const spaced = isWin
+    ? path.join(home, "Program Files", "npm-global")
+    : path.join(home, "od:d", "Program Files")
+  fs.mkdirSync(spaced, { recursive: true })
+  for (const tool of ["claude", "opencode"]) {
+    fs.writeFileSync(path.join(spaced, tool), "#!/bin/sh\nexit 0\n")
+  }
+  const { rc, out } = runCheckDeps(home, { CCG_BACKEND_BIN_DIRS: spaced })
+  assert.match(out, /已从绝对路径补入 PATH/, "含空格/冒号的候选目录必须被识别为命中")
+  assert.match(out, /Program Files/, "命中路径必须原样带空格回报")
+  assert.doesNotMatch(out, /找不到/, "含空格/冒号的目录不得被判为找不到")
+  assert.equal(rc, 0, "两个后端都命中时体检应通过退出")
+})
+
+// ⑤ 结构锁：诊断入口必须留在用法说明里，否则真出事时没人知道有这条命令。
+test("--check-deps 必须在用法说明中出现（诊断入口要保持可发现）", () => {
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  assert.match(src, /--check-deps/, "用法块未提及 --check-deps")
+  const usageAt = src.indexOf("--check-deps")
+  const helpAt = src.indexOf("--help")
+  assert.ok(usageAt >= 0 && helpAt >= 0, "用法块与 --help 分支都应存在")
+  assert.ok(usageAt < helpAt, "--check-deps 应出现在 --help 之前的用法说明里")
+})
+
+// ⑥ 退出码分三档：单后端就是本条坑造成的降级形态，不能判 0。
+// 否则体检自己的语义与它要检的缺陷相反。
+test("只剩单后端时 --check-deps 必须返回非零并点名降级（不能判通过）", () => {
+  const home = makeFakeHome({ claude: "claude" }) // 故意不给 opencode
+  const { rc, out } = runCheckDeps(home)
+  assert.notEqual(rc, 0, "只剩一个后端时不得返回 0")
+  assert.match(out, /只剩单后端|跨家族/, "必须明说已降级、且缺的是跨家族交叉验证")
+  assert.doesNotMatch(out, /体检通过：后端可用/, "降级态不得出现「体检通过」字样")
+})
+
+// ⑦ 诊断入口自身不得有前置外部依赖。
+// 实测踩到：ROOT 用 dirname -- "$0" 计算，而那是全脚本第一个外部依赖；
+// 本机 PATH 会丢工具目录，于是 `--check-deps` 先被 `dirname: command not found`
+// 打死——一个「查别人坏没坏」的命令自己先坏了。
+//
+// 这条按 QM-6 评审 i7 的意见改成**行为级**锁：往 PATH 最前面塞一个必定失败的
+// dirname，看体检是否照常通过。原来那条精确匹配 `_self_dir="${_self_dir%/*}"`
+// 的正则属于字符串级锁，合法重构（换写法但仍不依赖 dirname）会误报红。
+test("dirname 不可用时 --check-deps 仍须成功（行为级：不依赖 dirname）", () => {
+  const home = makeFakeHome({ claude: "claude", opencode: "opencode" })
+  const poison = fs.mkdtempSync(path.join(os.tmpdir(), `ccg-poison-${process.pid}-${seq++}-`))
+  // 任何对 dirname 的调用都会拿到空输出 + 127
+  fs.writeFileSync(path.join(poison, "dirname"), "#!/bin/sh\nexit 127\n")
+  const { rc, out } = runCheckDeps(home, { PATH: `${poison}:/usr/bin:/bin` })
+  assert.equal(rc, 0, `dirname 被毒化时体检仍须通过（实际 rc=${rc}）：${out.slice(0, 300)}`)
+  assert.match(out, /体检通过/, "dirname 不可用不得影响体检结论")
+  // 便宜的早期信号：ROOT 那一行不得再出现 dirname
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  const rootLine = (src.match(/^ROOT=.*$/m) || [""])[0]
+  assert.doesNotMatch(rootLine, /dirname/, "ROOT 计算不得再用 dirname")
+})
+
+// ⑧ 防回潮：不得再写回「只 say 一句被动告警然后照跑」的旧形态。
+test("不得回潮成被动告警：后端体检必须在补 PATH 之后再判定", () => {
+  const src = fs.readFileSync(SCRIPT, "utf8")
+  // 旧实现原句：command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude …"
+  assert.doesNotMatch(
+    src,
+    /command -v claude[^\n]*\|\|\s*say/,
+    "claude 的可用性判定不得退化为「不在 PATH 就 say 一句然后继续跑」",
+  )
+  // 真正的恢复动作必须存在：把探测到的目录 prepend 进 PATH 并导出。
+  assert.match(src, /PATH="\$[A-Za-z_]+:\$PATH"/, "必须存在把目录 prepend 进 PATH 的恢复动作")
+  assert.match(src, /export PATH/, "恢复后的 PATH 必须导出，否则子进程（wrapper）看不到")
+})
diff --git a/scripts/deep-review.sh b/scripts/deep-review.sh
index 746e970b..f6bfe97b 100644
--- a/scripts/deep-review.sh
+++ b/scripts/deep-review.sh
@@ -9,34 +9,252 @@
 # 会把仓库锁死。它是本地跑、结果落盘进 PR 的人工把关环节。
 #
 # 用法：
-#   sh scripts/deep-review.sh            # 读 HEAD 的判定记录，按 mode 决定跑不跑
-#   sh scripts/deep-review.sh --force    # 忽略 mode=skip，强制跑
-#   sh scripts/deep-review.sh --dry-run  # 只打印将要做什么
+#   sh scripts/deep-review.sh              # 读 HEAD 的判定记录，按 mode 决定跑不跑
+#   sh scripts/deep-review.sh --force      # 忽略 mode=skip，强制跑
+#   sh scripts/deep-review.sh --dry-run    # 只打印将要做什么
+#   sh scripts/deep-review.sh --check-deps # 只体检评审后端依赖（不需要 node / git 记录）
 #
 # 退出码：0 无阻断 / 1 有阻断 / 2 环境或配置问题
 
 set -u
 
-ROOT="$(cd "$(dirname -- "$0")/.." && pwd)"
+# 刻意不依赖 dirname：这行在任何别的检查之前跑，是全脚本第一个外部依赖。
+# 用 dirname 的话，--check-deps 这个「环境坏掉时的第一手诊断」会先被
+# `dirname: command not found` 打死——而本机 PATH 恰恰是会丢工具目录的那种
+# （见下面「后端解析」注释）。参数展开版对相对/绝对 $0 语义完全一致。
+_self_dir="$0"
+case "$_self_dir" in
+  */*) _self_dir="${_self_dir%/*}" ;;
+  *)   _self_dir="." ;;
+esac
+ROOT="$(cd "$_self_dir/.." && pwd)"
 cd "$ROOT" || exit 2
 
 FORCE=0
 DRY=0
+CHECK_DEPS=0
 for a in "$@"; do
   case "$a" in
     --force) FORCE=1 ;;
     --dry-run) DRY=1 ;;
+    --check-deps) CHECK_DEPS=1 ;;
     --help|-h)
-      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
+      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
       exit 0 ;;
   esac
 done
 
 say() { printf '%s\n' "$1"; }
 
+# ==========================================================================
+#  后端解析：为什么不能只靠继承来的 PATH
+# ==========================================================================
+# codeagent-wrapper 用**裸名** spawn 后端（实测 stderr 诊断头原文：
+#   Command: claude -p --dangerously-skip-permissions --output-format stream-json ...
+#），所以后端能不能起来只取决于 PATH。
+#
+# 而本机进程 PATH 不可信：里面 C: 盘的条目被剥掉了盘符
+# （`C:\Users\<user>\.local\bin` → `\Users\<user>\.local\bin`），
+# Windows 会把「无盘符的 PATH 条目」按**当前工作目录所在盘符**解析：
+#   cwd 在 D: → claude 不可解析（仓库正好在 D:）
+#   cwd 在 C: → opencode / codex 反而不可解析
+# 没有任何一条条目能同时对两个盘符有效。git 钩子与非登录 shell 又不重读
+# 注册表，于是这条坑稳定复现，且症状不是报错退出，而是引擎**静默降级成
+# 单后端**——评审照跑、结论照出，只是少了一路跨家族交叉验证。
+# （.quality-gates.md 那次「通道偏差声明：primary 前端 claude 静默空转
+#   ⇒ 降级 opencode 免费模型」就是本条坑的产物。）
+#
+# 所以：命中即把目录 prepend 进 PATH 并**导出**（wrapper 是子进程，
+# 看不到未导出的 shell 变量），并把「靠 PATH 命中」与「靠绝对路径补入」
+# 如实分开报出来。
+
+# Windows 风格路径 → POSIX 风格。
+# `npm prefix -g` 在 Windows 上返回反斜杠路径，直接拼进 sh 的 PATH 会失效。
+posix_dir() {
+  _pd="$1"
+  [ -n "$_pd" ] || return 1
+  if command -v cygpath >/dev/null 2>&1; then
+    _po="$(cygpath -u "$_pd" 2>/dev/null)" || _po=""
+    [ -n "$_po" ] && { printf '%s' "$_po"; return 0; }
+  fi
+  case "$_pd" in
+    [A-Za-z]:*)
+      _pv="$(printf '%s' "$_pd" | cut -c1 | tr 'A-Z' 'a-z')"
+      printf '%s' "$_pd" | sed -e 's|\\|/|g' -e "s|^${_pv}:|/${_pv}|"
+      ;;
+    *) printf '%s' "$_pd" ;;
+  esac
+}
+
+# 候选目录清单。**核心目标是不依赖那个被剥掉盘符的 PATH 条目**
+# ——$HOME/.local/bin / $HOME/bin / $APPDATA/npm 三条与 PATH 无关。
+# ⚠ 但别把它读成「完全不依赖 PATH」：`npm prefix -g` 走 `command -v npm`，
+#   posix_dir 走 cygpath/sed/cut/tr。PATH 坏到本方案针对的那个程度时，
+#   这两支会静默不生效（此时只剩前三条与 $CCG_BACKEND_BIN_DIRS 可用）。
+#   这正是 QM-6 评审 i5 指出的过度声称，注释按实际能力收窄。
+#   $CCG_BACKEND_BIN_DIRS 还能显式补一条不依赖任何外部命令的路径（冒号或分号分隔）。
+candidate_dirs() {
+  # ⚠ 每个变量都必须写成 ${VAR:-}。
+  #   本函数在 `set -u` 下运行，`[ -n "$APPDATA" ]` 在 APPDATA 未设时会**直接
+  #   中止整个函数**——后面的 npm / CCG_BACKEND_BIN_DIRS 分支一句都跑不到，
+  #   候选列表被静默截短，后端于是被判成「找不到」。
+  #   这就是「告警/保护逻辑自己静默降级」的同一种病，出现在修复本身里。
+  #   （本 PR 的「含空格候选目录」回归测试在最小 env 下当场抓到。）
+  if [ -n "${HOME:-}" ]; then
+    printf '%s\n' "$HOME/.local/bin" "$HOME/bin"
+  fi
+  if [ -n "${APPDATA:-}" ]; then
+    printf '%s\n' "$APPDATA/npm"
+  fi
+  if command -v npm >/dev/null 2>&1; then
+    _pp="$(npm prefix -g 2>/dev/null)" || _pp=""
+    if [ -n "$_pp" ]; then
+      _pq="$(posix_dir "$_pp" 2>/dev/null)" || _pq=""
+      [ -n "$_pq" ] && printf '%s\n' "$_pq"
+    fi
+  fi
+  if [ -n "${CCG_BACKEND_BIN_DIRS:-}" ]; then
+    # ⚠ 只按**分号**切，绝不按冒号切：Windows 盘符自带冒号（`C:\...`），
+    # 按冒号切会把 `C:\Users\x\Program Files\npm-global` 劈成 `C` 和
+    # `\Users\x\Program Files\npm-global` 两个废目录。第一版就是按 `:;` 切的，
+    # 被本 PR 自己的「含空格候选目录」回归测试当场抓住。
+    # 换行也算分隔符（消费方本就按行读），所以多行写法天然可用。
+    # `%s\n` 而不是 `%s`：不带尾换行的话，消费方的 `while read` 会在 EOF
+    # 处把**最后一行整个丢掉**（read 读到内容但返回非零）——最后一个候选
+    # 被静默跳过。本 PR 自己的「含空格候选目录」测试当场抓到了这个。
+    printf '%s\n' "$CCG_BACKEND_BIN_DIRS" | tr ';' '\n'
+  fi
+  return 0
+}
+
+# 探一个后端。输出 "<状态>|<说明>"，状态四取一：
+#   PATH  已在 PATH，裸名可解析
+#   ABS   原本不可解析，已按绝对路径补进 PATH（真身可直接 spawn）
+#   CMD   只找到 .cmd/.bat —— CreateProcess 起不来，只能算半个可用
+#   MISS  彻底找不到
+resolve_backend() {
+  _rb_tool="$1"
+  if command -v "$_rb_tool" >/dev/null 2>&1; then
+    printf 'PATH|裸名已可解析（无需干预）'
+    return 0
+  fi
+  # ⚠ 不能写成 `for _rb_d in $(candidate_dirs)`。
+  # 命令替换的结果会被 shell 按 IFS 拆词，而候选目录**确实含空格**：
+  # 本机 `npm prefix -g` 实测返回 `D:\Program Files\npm-global`，
+  # 拆开后只剩 `D:\Program` 和 `Files\npm-global` 两个废目录 ⇒ 这条候选
+  # 永远命中不了（QM-6 评审 i2，就是本分支自己被评审打回的真实缺陷）。
+  #
+  # 也不能用 `candidate_dirs | while ...`：管道会开子 shell，
+  # 里面的 `export PATH` 与 return 都会丢。here-doc 的 while 留在当前 shell。
+  _rb_list="$(candidate_dirs)"
+  # `|| [ -n "$_rb_d" ]`：EOF 无尾换行时 read 仍读到了内容但返回非零，
+  # 只写 `while read` 会把最后一行静默丢掉。候选列表宁可多判一次，
+  # 也不能少判一个（少判 = 后端被误判成找不到，正是本条坑的形态）。
+  while IFS= read -r _rb_d || [ -n "$_rb_d" ]; do
+    [ -n "$_rb_d" ] || continue
+    [ -d "$_rb_d" ] || continue
+    for _rb_f in "$_rb_d/$_rb_tool" "$_rb_d/$_rb_tool.exe" "$_rb_d/$_rb_tool.com" \
+                  "$_rb_d/$_rb_tool.cmd" "$_rb_d/$_rb_tool.bat"; do
+      [ -f "$_rb_f" ] || continue
+      PATH="$_rb_d:$PATH"
+      export PATH
+      case "$_rb_f" in
+        *.cmd|*.bat)
+          # 实测：wrapper 走 CreateProcess（UseShellExecute=false），它不解析
+          # .cmd/.bat；放个 .cmd 上去只会把失败推迟到引擎深处、错误信息还更难读。
+          printf 'CMD|只找到 %s —— CreateProcess 起不了 .cmd/.bat，wrapper 仍会失败' "$_rb_f"
+          return 0 ;;
+        *)
+          printf 'ABS|已从绝对路径补入 PATH: %s' "$_rb_f"
+          return 0 ;;
+      esac
+    done
+  done <<EOF
+$_rb_list
+EOF
+  printf 'MISS|找不到（PATH 与候选目录均未命中）'
+  return 1
+}
+
+# 逐个后端体检并打印。
+# 退出码刻意分三档而不是「有一个能跑就算过」——单后端正是本条坑造成的降级形态，
+# 把它做成 0 会让体检失去意义：
+#   0  两个后端都在（双模型齐备）
+#   2  有后端缺失或只命中不可执行的 .cmd（能跑则降级；两个都不可用时另加硬提示）
+#
+# 副作用：把 _RB_OK / _RB_RC 暴露给调用方，主流程要靠它决定是继续还是早退。
+# 注意 CMD 也必须置 _rb_rc=2：.cmd 明明被判为「wrapper 起不来」，
+# 若不置 rc，就会出现「刚说完深度审查起不来，下一行体检通过、exit 0」
+# 的自相矛盾（QM-6 评审 i1）。
+report_backends() {
+  _rb_rc=0
+  _rb_n=0
+  for _rb_b in claude opencode; do
+    case "$_rb_b" in
+      claude)   _rb_why="评审后端（主力）" ;;
+      opencode) _rb_why="出方案后端 / 跨家族校验" ;;
+    esac
+    _rb_st="$(resolve_backend "$_rb_b")"
+    _rb_code="${_rb_st%%|*}"
+    _rb_msg="${_rb_st#*|}"
+    say "  · $_rb_b  [$_rb_code] $_rb_msg（$_rb_why）"
+    case "$_rb_code" in
+      PATH|ABS) _rb_n=$((_rb_n + 1)) ;;
+      CMD)
+        # 判为不可用：既不计数，也必须置 _rb_rc=2（否则体检会自相矛盾，见上）。
+        _rb_rc=2
+        say "      ↳ 修法：让真身以 .exe/.com 形式出现在某个全盘符限定的 PATH 目录下"
+        say "        （符号链接 / 硬链接都可以；.cmd 不作数，原因见上）" ;;
+      MISS)
+        _rb_rc=2
+        say "      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），"
+        say "        或把它所在目录写进系统 PATH 后重开终端；"
+        say "        也可用 CCG_BACKEND_BIN_DIRS 显式指一个目录" ;;
+    esac
+  done
+  # ⚠ 必须按**计数**分档，不能只看「有没有」。
+  #   只看 0/1 标志时，2/2 可用与 1/2 可用长得一模一样，
+  #   于是双模型齐备也会打印「只剩单后端」（本 PR 自查时当场发现）。
+  case "$_rb_n" in
+    0)
+      say ""
+      say "  ✗ 没有任何评审后端可用 —— 深度审查根本起不来。" ;;
+    1)
+      say ""
+      say "  ⚠ 只剩单后端可用 —— 评审能跑，但跨家族交叉验证会缺失（这正是本条坑的形态）。" ;;
+  esac
+  _RB_OK=$([ "$_rb_n" -ge 1 ] && echo 1 || echo 0)
+  _RB_RC="$_rb_rc"
+  return "$_rb_rc"
+}
+
+# ---------- 0a. 纯依赖体检（--check-deps）----------
+# 刻意放在定位 node / 驱动 / 判定记录**之前**：这是「为什么我的评审降级了」
+# 的第一手诊断入口，真出事时 node 可能本身就是坏的，届时仍要能问。
+if [ "$CHECK_DEPS" -eq 1 ]; then
+  say "═══ CCG 深度审查 · 依赖体检 ═══"
+  _CD_WRAPPER="${CODEAGENT_WRAPPER:-${HOME:-}/.claude/bin/codeagent-wrapper.exe}"
+  if [ -f "$_CD_WRAPPER" ] || [ -x "$_CD_WRAPPER" ]; then
+    say "  ✓ codeagent-wrapper  $_CD_WRAPPER"
+    _CD_RC=0
+  else
+    say "  ✗ codeagent-wrapper 找不到: $_CD_WRAPPER"
+    say "    修法：npx ccg-workflow（生成 wrapper）"
+    _CD_RC=2
+  fi
+  report_backends || _CD_RC=2
+  say ""
+  if [ "$_CD_RC" -eq 0 ]; then
+    say "体检通过：后端可用。"
+  else
+    say "体检不通过：见上方逐条修法。"
+  fi
+  exit "$_CD_RC"
+fi
+
 # ---------- 1. 定位 node ----------
 if ! command -v node >/dev/null 2>&1; then
-  if [ -d "$HOME/.fnm" ]; then
+  if [ -d "${HOME:-}/.fnm" ]; then
     eval "$(fnm env --shell sh 2>/dev/null)" 2>/dev/null || true
   fi
 fi
@@ -53,7 +271,7 @@ DRIVER=""
 for c in \
   "$ROOT/scripts/ccg-deep-review.js" \
   "${CCG_ARL_DIR:+$CCG_ARL_DIR/ccg-deep-review.js}" \
-  "$HOME/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js"
+  "${HOME:-}/.claude/skills/adversarial-review-loop/scripts/ccg-deep-review.js"
 do
   [ -n "$c" ] && [ -f "$c" ] && DRIVER="$c" && break
 done
@@ -94,16 +312,29 @@ if [ "$MODE" = "skip" ] && [ "$FORCE" -eq 0 ]; then
 fi
 
 # ---------- 4. 依赖体检 ----------
-WRAPPER="${CODEAGENT_WRAPPER:-$HOME/.claude/bin/codeagent-wrapper.exe}"
+WRAPPER="${CODEAGENT_WRAPPER:-${HOME:-}/.claude/bin/codeagent-wrapper.exe}"
 [ -x "$WRAPPER" ] || [ -f "$WRAPPER" ] || {
   say "✗ 找不到 codeagent-wrapper: $WRAPPER"
   say "  生成：npx ccg-workflow"
   exit 2
 }
-command -v claude >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
-command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
+# 后端体检**并补 PATH**（旧实现只 say 一句被动告警然后照跑 ⇒ 静默降级）。
+# 这里保持非致命，与旧语义一致：真要 fail-closed 请用 --check-deps。
+# 降级（单后端）保持非致命，与旧语义一致；真要 fail-closed 请用 --check-deps。
+# 但「一个后端都没有」必须早退：继续跑只会在引擎深处抛一个难懂的错误，
+# 而上一行刚打印过「深度审查根本起不来」，再打印「体检通过」是自相矛盾
+# （QM-6 评审 i3）。
+report_backends || true
 say ""
-say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
+if [ "$_RB_OK" -eq 0 ]; then
+  say "✗ 没有可用评审后端，深度审查起不来。修法见上方逐条（也可先跑 --check-deps）。"
+  exit 2
+fi
+if [ "$_RB_RC" -eq 0 ]; then
+  say "依赖体检通过，开始深度审查（可能耗时 15 分钟以上，取决于 diff 体量）…"
+else
+  say "依赖体检有降级，开始深度审查（缺一路跨家族交叉验证）…"
+fi
 say ""
 
 # ---------- 5. 跑 ----------

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。