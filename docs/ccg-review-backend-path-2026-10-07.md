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

`scripts/deep-review-deps.test.js`，8 例，用**假 HOME + 最小 PATH**（`/usr/bin:/bin`）
精确复现「后端不在 PATH 却已安装」这一条件。

红绿口径要分清两个阶段（QM-6 评审 i4 指出原文档数字对不上）：

- **首版 5 例**在修复前实测 **5/5 全红**（当时脚本只有这 5 条断言）。
- 随后为 QM-6 评审补到 8 例；**修复后 8/8 全绿**。
  编号 ①–⑧ 连续，每条注释与 `test()` 顺序一一对应。

其中 3 例是 QM-6 评审直接催生的：② 的 `rc ≠ 0` 断言（i1）、④ 的含空格/含冒号
候选目录（i2 + 下面第四节记的额外缺陷）、⑦ 从字符串级锁改成行为级（i7）。

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

## 五、QM-6 拿自己的修复审自己（第二轮）

修复推上去后，用**刚修好的通道**对本次改动跑了一遍 QM-6 深度双模型审查
（commit `c689da94`，基线 `origin/main`，引擎自报
`跨家族校验: proposer=opencode critic=claude 通过`）——这本身就是原问题已修复的
最强证据：改动前这里是 claude 静默空转。

`critic=claude` 给出 7 条（1 Critical + 2 Warning + 4 Info，最低分 correctness 5），
引擎走自扮演裁决出口（`self_play`，置信权重 0.6，低于真跨家族的 1）。逐条处置：

| id | 严重度 | 问题 | 处置 |
|---|---|---|---|
| i1 | Critical | `CMD` 分支既不置 `_rb_rc` 也不计数 → 两个后端只有 `.cmd` 时会打印「深度审查根本起不来」却 exit 0 并打印「体检通过」，自相矛盾 | 已修：`CMD` 置 `_rb_rc=2`；② 补 `rc ≠ 0` 断言 |
| i2 | Warning | `for d in $(candidate_dirs)` 未加引号，含空格候选被按 IFS 拆词。本机 `npm prefix -g` 实测返回 `D:\Program Files\npm-global` ⇒ **「救 opencode/codex」那条分支在本机完全失效** | 已修：改 `while IFS= read -r` + here-doc（不用管道，管道会开子 shell，`export PATH` 与 `return` 都会丢） |
| i3 | Warning | 主流程 `report_backends \|\| true` 之后无条件打印「依赖体检通过」 | 已修：按计数分支；**一个后端都没有时提前 `exit 2`** |
| i4 | Info | 文档「修复前 5/5 全红」与 7 例对不上 | 已修：分两阶段写清（首版 5 例 5/5 红；最终 8 例 8/8 绿） |
| i5 | Info | 注释称候选清单「不依赖 PATH 本身」属过度声称（`npm prefix -g` 走 `command -v npm`） | 已修：注释按实际能力收窄 |
| i6 | Info | 测试注释编号混乱（⑥b、两个 ⑦、缺 ⑤） | 已修：重排为 ①–⑧ |
| i7 | Info | ⑦ 用正则精确匹配 `${_self_dir%/*}` 实现串，合法重构会误报红 | 已修：改成行为级锁——往 PATH 塞一个必定失败的 `dirname`，看体检是否照常通过 |

### 5.1 评审没命中、但被**自己的新测试**当场抓出的 3 个缺陷

这一节值得单列：它们说明「写完就以为对了」和「有测试」是两件事。

1. **`CCG_BACKEND_BIN_DIRS` 按 `:` 切分**。Windows 盘符自带冒号，
   `C:\...\Program Files\npm-global` 被劈成 `C` 和 `\...` 两个废目录。
   改为一律只按**分号**切（换行也算），消费方本就按行读。
2. **候选列表最后一行被静默丢弃**。`printf '%s'` 不带尾换行，而
   `while IFS= read -r` 在 EOF 处读到内容却返回非零 ⇒ 最后一个候选没被检查。
   两处都改：生产者用 `printf '%s\n'`，消费者用 `while ... || [ -n "$_d" ]`。
3. **`set -u` 下 `[ -n "$APPDATA" ]` 直接中止 `candidate_dirs`**。
   最小 env（无 `APPDATA`）里，排在后面的 npm / `CCG_BACKEND_BIN_DIRS` 分支
   一句都跑不到，候选列表被静默截短，后端于是被判「找不到」。
   ——**这正是本次要消灭的「静默降级」，出现在修复自己的代码里**。
   全部变量改 `${VAR:-}`（`$HOME` 在 4 处同样加固）。

第 3 条尤其值得记住：它的失败形态与原 Bug **完全同构**（保护逻辑自己静默失效，
外部只看到「找不到」）。凡是「负责发现问题的代码」，
它自己的失败模式必须也走「明确报错」而不是「安静地少做一点」。

### 5.2 第二轮之后的状态

- `bash -n` rc=0；`node --test scripts/deep-review-deps.test.js` **8/8 绿**
- 真实环境三档文案与退出码实测全部正确：

| 形态 | 文案 | rc |
|---|---|---|
| 双模型齐备 | `体检通过：后端可用。`（**无**降级措辞） | 0 |
| 降级（1/2） | `⚠ 只剩单后端可用 …` + `体检不通过` | 2 |
| 全缺（0/2） | `✗ 没有任何评审后端可用 —— 深度审查根本起不来。` + `体检不通过` | 2 |

「双模型齐备时误报只剩单后端」这个缺陷是**跑真实环境**时发现的（`_rb_ok` 只是
0/1 标志，2/2 与 1/2 长得一样），已改为按**计数**分档，并给测试①补上
「齐备时不得出现降级措辞」的断言。教训同 5.1：**夹具能过的测试 ≠ 真实环境正确**。

---

## 六、预防措施

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

## 七、附：一条无害观察

wrapper 诊断头打印的命令行里 `--setting-sources` 后面是**空值**：

```
Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
```

实测该形态调用正常（`exit=0`、stdout 正常），故判定为无害，未按缺陷处理，仅留痕。
