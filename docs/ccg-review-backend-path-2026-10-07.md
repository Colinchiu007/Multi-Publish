# CCG 深度双模型审查（QM-6）后端解析缺陷复盘

- 日期：2026-10-07
- 分支：`ccg-review-claude-path`（worktree `D:/Data/projects/mp-worktrees/mp-ccg-review-claude-path`）
- 影响面：`scripts/deep-review.sh`（QM-6 本地入口）与其上游 `adversarial-review-loop` 引擎
- 症状：双模型外部审查时 `claude` 报「不在 PATH」，引擎**静默降级成单后端**

---

## 一、根因

### 1.1 表面现象

跑 CCG 双模型外部审查（QM-6）时，`claude` 不在 PATH。`codeagent-wrapper` 用**裸名** spawn
后端，于是评审后端缺席。

### 1.2 第一性原因：进程 PATH 里的 C: 盘条目被剥掉了盘符

实测（本机 2026-10-07）进程 `$env:PATH` 中存在两种形态并存的情况：

| 注册表（HKCU + HKLM）里的形态 | 进程 `$env:PATH` 里的形态 |
|---|---|
| `C:\Users\<user>\.local\bin` | `\Users\<user>\.local\bin` |
| `D:\Program Files\npm-global` | `\Program Files\npm-global` |

**Windows 会把「无盘符的 PATH 条目」按当前工作目录所在盘符解析。** 实测：

```
cwd = D:\Data\projects\mulpub   （仓库所在盘）
  where claude    -> 找不到
  where opencode  -> D:\Program Files\npm-global\opencode
  where codex     -> D:\Program Files\npm-global\codex

cwd = C:\
  where claude    -> C:\Users\<user>\.local\bin\claude.exe
  where opencode  -> 找不到
  where codex     -> 找不到
```

两组条目**没有任何一条同时对两个盘符有效**。仓库 cwd 在 D: → 恰好 `claude` 挂、
`opencode`/`codex` 好用。这与 `.quality-gates.md` 里那次
「通道偏差声明：primary 前端 claude 静默空转（rc=2、completed without agent_message
output、无产物）⇒ 降级 opencode 免费模型」的现象完全吻合。

`claude.exe` 本体健康（`2.1.278 (Claude Code)`），注册表里的 PATH 也是对的——坏的只是
**会话进程继承下来的那份**。git 钩子与非登录 shell 又不重读注册表，于是稳定复现。

### 1.3 第二性原因：入口脚本把「告警」当成了「处理」

`scripts/deep-review.sh` 由 `d98f54db`（PR #2955，2026-10-06 01:09:40）**一次引入**，
下面两行从出生就在，不是从可用态退化来的：

```sh
command -v claude   >/dev/null 2>&1 || say "⚠ 找不到 claude —— 评审后端不可用，引擎会降级为单后端"
command -v opencode >/dev/null 2>&1 || say "⚠ 找不到 opencode —— 出方案后端不可用，跨家族校验会降级"
```

这两句**发现了问题，但不改变任何行为**：不补 PATH、不改退出码、不阻断。评审照跑、
结论照出，只是少了一路跨家族交叉验证。旁边对 `codeagent-wrapper` 的处理恰恰相反
（找不到就 `exit 2`）——同一个「依赖体检」段落里两种哲学并存。

---

## 二、逃逸分析（逐层）

| 层 | 为什么没拦住 |
|---|---|
| 单元测试 | `deep-review.sh` **从来没有任何测试**。它不在任何 `node --test` 列表里，CI 也没有结构锁保护。本 PR 补 7 例。 |
| 集成测试 | 深度审查**明确不进 CI**（脚本头注释：单次 >15 分钟，挂 required check 会把仓库锁死）。于是 PR 层也没有它的回归保护，只能靠人工把关。 |
| 端到端 | 有 QM-6 人工环节，产物是 `.quality-gates.md` 记录 + `.ccg/qm6-*.json`。但**人眼看的是评审结论，不是「几路后端参与了」**。 |
| 代码审查 | `d98f54db` 的评审重点在「wrapper 缺失要 exit 2」；两条 `|| say` 看起来是合理的降级提示。关键是**评审者当时的环境里 claude 是可解析的**——环境恰好是好的，缺陷就不可见。 |
| 流程 | `.quality-gates.md` 允许把降级「如实登记」后继续。降级因此从异常变成**可接受常态**，掩盖了它其实是环境缺陷而非审查本身的问题。 |

---

## 三、系统性漏洞定位

1. **告警不改行为**（结构性根因）。凡是「发现了但照跑」的检查，实质上把缺陷转化为
   沉默。本仓的 fail-closed 原则在别处执行得很严，唯独这里开了口子。
2. **依赖继承的 PATH 而非绝对路径**。凡是把「环境可解析性」当输入的脚本都在赌会话
   环境。值得注意的是 `deep-review.sh` 自己的第 1 步**已经**为 `node` 写过同类兜底
   （`fnm env` 兜底，注释写明「git 钩子不继承登录 shell 的 PATH，node 常常在这里丢失」）——
   这个问题在本仓已被认知过一次，但只修了 `node` 一个工具，没推广到评审后端。
3. **缺诊断入口**。真降级时没有一条命令能问「为什么少了一路」，只能靠读引擎日志反推。
4. **降级被流程合法化**（掩盖层）。见上表最后一行的流程层。

---

## 四、修复与回归保护

### 4.1 机器层（本机环境态，不在版本控制内）

在**全盘符限定**的 PATH 目录里放一个指向真身的符号链接，使其与 cwd 所在盘符无关：

- 位置：`C:\hermes-home\bin\claude.exe` → `C:\Users\<user>\.local\bin\claude.exe`
  （`C:\hermes-home` 是 junction，真实路径 `C:\Users\<user>\bin`）
- 为什么用符号链接而不是 `.cmd` shim：实测 wrapper 走 `CreateProcess`
  （`UseShellExecute=false`），**不解析 `.cmd`**，放 `.cmd` 上去只会把失败推迟到引擎深处。
  符号链接还不会像硬链接那样在 Claude Code 自更新后滞留在旧版本。
- 实测收益：`where claude` 在 D: 与 C: 两个盘符下均命中；
  `codeagent-wrapper --backend claude` 端到端 `exit=0`、stdout 返回正常内容。

### 4.2 仓库层（本次 PR，持久化）

`scripts/deep-review.sh` 不再信任继承的 PATH：

1. 新增 `posix_dir` / `candidate_dirs` / `resolve_backend` / `report_backends`。
   候选目录：`$HOME/.local/bin`、`$HOME/bin`、`$APPDATA/npm`、`npm prefix -g`
   （经 `cygpath -u` 或 sed 归一）、`$CCG_BACKEND_BIN_DIRS`（显式追加）。
2. 命中即把目录 `prepend` 进 PATH 并 **`export`**（wrapper 是子进程，看不到未导出的
   shell 变量——这是「补了等于没补」的常见坑）。
3. 状态四取一并如实分开报出：
   - `PATH` 裸名已可解析
   - `ABS` 原本不可解析，已按绝对路径补入
   - `CMD` 只找到 `.cmd`/`.bat` → **明确判为不可用**并说明 CreateProcess 限制
   - `MISS` 彻底找不到 → 给出可操作修法
4. 新增 `--check-deps`：**纯依赖体检入口**，刻意放在定位 node / 驱动 / 判定记录**之前**，
   即「环境坏掉时的第一手诊断」自己不能依赖那些可能已坏的东西。
   为此把 `ROOT` 的计算从 `dirname -- "$0"` 改成参数展开——`dirname` 原本是全脚本第一个
   外部依赖，实测它会先于体检逻辑把 `--check-deps` 打死
   （`dirname: command not found`）。
5. 退出码分三档：两个后端都在 = 0；有缺失 = 2。**单后端不算通过**——那正是本条坑
   造成的形态，把它判 0 会让体检语义与它要检的缺陷相反。主流程仍保持非致命（与旧语义
   一致），要 fail-closed 请显式用 `--check-deps`。

### 4.3 回归保护测试

`scripts/deep-review-deps.test.js`，7 例，用**假 HOME + 最小 PATH**（`/usr/bin:/bin`）
精确复现「后端不在 PATH 却已安装」这一条件——修复前 5/5 全红，修复后 7/7 全绿：

1. 后端不在 PATH 但装在 `$HOME/.local/bin` → 必须判为可用并报出补入的绝对路径
2. 只存在 `.cmd` → 必须告警 CreateProcess 限制，不得判为可用
3. 后端确实不存在 → `--check-deps` 必须非零退出并给出可操作提示
4. 降级为单后端 → 必须非零退出并点名「跨家族交叉验证会缺失」
5. `--check-deps` 必须出现在用法说明里（诊断入口保持可发现）
6. `ROOT` 计算不得再依赖 `dirname`
7. 防回潮结构锁：不得写回 `command -v claude … || say` 的被动告警形态，
   且必须存在 `prepend + export PATH` 的真实恢复动作

已接线进 `.github/workflows/quality-gate.yml` 的 Gate 2b
（`check-unwired-tests` 实跑：检查域内 59 份测试全部接线或按欠账登记，rc=0）。

### 4.4 真实环境取证

```
# 真实环境（PATH 正常）
$ sh scripts/deep-review.sh --check-deps
  ✓ codeagent-wrapper  /c/Users/<user>/.claude/bin/codeagent-wrapper.exe
  · claude  [PATH] 裸名已可解析（无需干预）（评审后端（主力））
  · opencode  [PATH] 裸名已可解析（无需干预）（出方案后端 / 跨家族校验）
体检通过：后端可用。                                    rc=0

# 故意打成坏 PATH（模拟无机器层符号链接时的真实形态）
$ PATH=/usr/bin:/bin sh scripts/deep-review.sh --check-deps
  · claude  [ABS] 已从绝对路径补入 PATH: /c/Users/<user>/.local/bin/claude
  · opencode  [MISS] 找不到（PATH 与候选目录均未命中）
      ↳ 修法：装一个（npm i -g @anthropic-ai/claude-code），…
体检不通过：见上方逐条修法。                            rc=2
```

第二段是本次修复的核心证据：坏 PATH 下 `claude` 仍被**绝对路径分支救回**，
`opencode` 诚实报缺失并给修法，退出码自解释。

---

## 五、预防措施

1. **已落地**：告警改行为（`--check-deps` 三档退出码）+ 绝对路径解析 + 独立诊断入口 +
   防回潮结构锁。
2. **本仓既有认知的推广**：第 1 步为 `node` 写过 PATH 兜底，本次把同一思路推广到评审
   后端。后续若有脚本把「某个 CLI 能否解析」当输入，应默认继承同一套候选目录解析，
   不要新写 `command -v` 一次性告警。
3. **流程层待办（不在本 PR 范围）**：
   - `.quality-gates.md` 允许 QM-6 降级「如实登记」，建议补一条：**降级登记时必须附
     `--check-deps` 输出**，否则「登记」会退化成「免责」。
   - QM-6 记录应显式写明**实际参与了几路后端**，而不只是结论。
4. **未在本 PR 修**：其他脚本对继承 PATH 的依赖（本次只审了 `deep-review.sh` 一条路径）。

## 六、附：一条无害观察

wrapper 诊断头打印的命令行里 `--setting-sources` 后面是**空值**：

```
Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
```

实测该形态调用正常（`exit=0`、stdout 正常），故判定为无害，未按缺陷处理，仅留痕。
