# blanket fs 夹具棘轮（Gate 2c-e）

> 单一实现：`scripts/check-blanket-fs-mock.js`；接线：`.github/workflows/quality-gate.yml` 的 `Gate 2c`；
> 本地同口径：`node scripts/check-blanket-fs-mock.js`（判定）+ `node --test scripts/check-blanket-fs-mock.test.js`（锁自身，20 例）。

## 1. 它防的那条链（#2794 归因）

一个测试文件写

```js
__registerMock('fs', { existsSync: () => false, readFileSync: () => '' })
```

经 `test-setup.js` 的 `Module._load` 拦截，作用域是**该 realm 里每一个** `require('fs')`，不是"我这个模块的 fs"。
而 `apps/desktop/vitest.config.js` 的 `deps.inline:['electron']` 会把 `node_modules/electron/index.js` **内联进同一个 realm**，
它对 `existsSync(distPath) === false` 的反应是"二进制没备好"⇒ 打印 `Downloading Electron binary…` 并当场 spawn `install.js`。

真正的代价不是那几秒下载，而是 `stdio:'inherit'` 让子进程输出并进父进程，vitest 把这段下载
**记到当时正在跑的那条用例名下** —— 表现成一条什么都没做的用例随机 15s 超时，且每次红在不同文件。

同类形状在别处也存在（`sql.js` 读 `.wasm` 是同族第二落点），所以判据范围是"全仓测试文件"，不是"桌面那几个"。

## 2. 扫描器：两份等长文本，各管一件事

`scanMask(text)` 一次线性扫描产出**等长**的 `codeOnly`（注释掩成空格，字符串保留）与 `skeleton`
（再把字符串/正则的**内容**掩成空格）。分工是这套判据的不变量：

| 用途 | 取哪一份 | 为什么不能混用 |
|------|---------|---------------|
| 找注册点、读函数体内容、匹配 `require('node:fs')` | `codeOnly` | skeleton 把 `'node:fs'` 掩成空格 ⇒ 拿它匹配"是否委托真实 fs"会对**真夹具**失明（第一版就这么把自己的正控判成违规） |
| 花括号配对、取函数体**位置** | `skeleton` | 代码字符串里的 `{` `` ` `` 会让纯计数把对象字面量边界数错 ⇒ 已收敛的形状被误报成违规 |
| 两者之间 | 位置来自 skeleton，切片来自 codeOnly | 等长 ⇒ 同一坐标可用；一旦谁改变了长度，"位置取自一份、内容取自另一份"会静默错位，故 `scanMask` 有保长断言 |

三条由此派生的口径：

| 口径 | 内容 | 不这样写会怎样 |
|------|------|---------------|
| 只认真代码 | 整行注释、块注释、行尾 ` //` 之后的都不算注册点；但**字符串里的 `//` 不是注释** | 反例实测：`const url = 'a // b'; __registerMock('fs', {existsSync: () => false})` 在"按 `//` 切行"的旧实现里被整段吃掉 ⇒ 真 blanket 判成 `NONE`（**静默漏检方向**，QM-6 命中） |
| 两种形态、**每一个注册点**都判 | `__registerMock` / `vi.mock` / `vi.doMock` × `fs` / `node:fs` / `fs/promises`；同文件多处注册取**最差**结论 | 只认一种 ⇒ 换个写法逃出棘轮；只看第一个注册点 ⇒ "第二个才是 blanket"整条洗白（probe F 实测复现） |
| 收敛 = 沙箱来自 tmpdir + 按路径段 + 动词真调用句柄 | 见 §3 | 任何一环缺失都退回 `BLANKET`，并在文案里点名缺的是哪一环 |

## 3. "已收敛"的四条链（每条对应一个已复现的绕过）

1. 从 fs 的 mock **对象字面量**里取出每个"读动词"的实现体（配对在 skeleton 域做，见 §2）。
2. 该体内引用的谓词，其**声明**必须带至少一个形参 —— `() => true` 这种"名字对、行为恒真"直接否。
   谓词按**完整名字**解析：文件里存在一个合格的 `isSandboxPathAlias` 而实现体引用的是不存在的
   `isSandboxPath` 时，不得按前缀借光（反证 F18 实测：把声明正则放松成 `ident + [\w$]*` 即变红）。
3. **只看谓词自己的函数体**（按花括号平衡取，不是"声明后 700 字符窗口"）：
   窗口会把**邻近函数**里的合格比较借给一个恒真谓词（probe E 实测：`isSandboxPath = (p) => true`
   旁边放一个 `helper` 做真路径段比较 ⇒ 旧实现报 `SANDBOX_DELEGATED`）。
   并且 `===` 与 `startsWith` 必须比**同一个**标识符。
4. 那个标识符必须**可追溯到 `os.tmpdir()`**（沿 `const X = …` 右值有界解析，≤8 个候选）——
   否则 `const ALLOW = '/tmp/anything-at-all'` 这种任意宽常量就是"沙箱"，大量真实路径可被谎报
   （probe D 实测）。这一条同时也是 AGENTS.md「文件系统测试隔离」的机器化。
5. 动词实现体必须**真的调用**该句柄上的同名方法 `<handle>.<verb>(…)`；
   "文件里某处 `require('fs')` 过"不算委托（C1-b 实测：`(realFs ? false : false)` 曾拿到 `SANDBOX_DELEGATED`）。

`READ_VERBS` **只有** `existsSync` 与 `readFileSync`：#2794 实测的同 realm 第三方（内联的 `electron/index.js`、
`sql.js` 读 `.wasm`）用的就是这两个。`statSync` / `readdirSync` 故意不在列内 —— 两处已收敛的夹具对
`statSync` 保留固定返回值，理由是"换成真读会让不存在的沙箱外路径从 `{size:1024}` 变成抛 ENOENT"，
那是本缺陷之外的语义漂移（见 `asset-generator.test.js` 注释）。把它们纳进来等于逼夹具改生产语义。

## 4. 欠账清单只能缩小

`KNOWN_BLANKET` 是"文件 → **核对过的原因**"。四条联动判据：

- 现场出现未登记的 blanket ⇒ 红（必须收敛，或带核对过的原因登记）；
- 登记项原因为空 ⇒ 红（"待办/暂时"不是原因）；
- 登记项在现场已不是 blanket ⇒ 红（**陈旧登记**：收敛与销账必须同一次发生）；
- 登记项指向不存在的文件 ⇒ 红（键漂移不许静默）。

反证 F8 实测的是反方向：把现场**已收敛**的那一个塞回清单 ⇒ 真实仓库那条必须红。

## 5. fail-closed 出口（三个，都是"探针坏了不得读成通过"）

- **枚举退化**：测试文件数低于 `MIN_TEST_FILES`（800，现场实测 1068）即红。下界不参与"合规"判定，
  只保证"不完整遍历不得判全绿"（与 worktree 链接扫描 R3 同款坑）。
- **读不动 / 正文缺失**：任一测试文件读取抛错，或注入式 `readFile` 返回 `null`/`undefined` ⇒ 红并计入
  `unreadable`。旧写法是 `continue`，后果是"枚举里有这个文件、判据域里没有"，而 `scanned` 照算 ⇒
  判"全仓合规"的分子里含着一个从没被测过的文件。
- **`git ls-files` 失败** ⇒ 以可读的 `FAIL:` 文案非零退出（不再是裸栈；仍是 fail-closed）。

门禁还自检自身是否被 `.gitignore` 吞掉（`scripts/*.js` 那条默认忽略是真陷阱，须配 negation）。
这里踩过两个洞，同一个形状：

1. `git check-ignore` 曾写成 `-q -v` ⇒ git 直接 `cannot have both` 返回 128，而 `catch` 一律判"未被忽略"
   ⇒ **这条自检从来没在工作**（反证 F10 实测暴露）。
2. git 二进制取不到时抛的错 `status` 是 **`null`**、`code` 是 `ENOENT`，旧映射
   `typeof e.status === 'number' ? e.status : 1` 把它也折成"未被忽略"（probe G 实测）。
   现在退出码三态如实返回：`0` = 被忽略（红）、`1` = 未被忽略（过）、其余（含 128 与 ENOENT→3）= 探针坏了（红）。

## 6. 它为什么不会被 docs-only 短路

门禁住在 `static-gates`（`QG Static`），该 job 被 `docs-only != 'true'` 门控 —— 单看接线位置确实有
"自我关闭"风险（本仓 `#2718` / `#2745` 两次就是这么红的）。这里不靠人记得住，靠两件事：

- 判据的**对象域是测试文件**（`apps/**`、`packages/**` 下的 `*.test.js`），它们**不在** `CI_IGNORED_PATHS` 里
  ⇒ 任何新增 blanket 夹具的 PR 必然是混合 PR，`static-gates` 必然跑；
- `scripts/classify-docs-only.test.js` 已有一张 `(白名单路径 → 门禁去向)` 对账表，用 `deepEqual` 钉住
  表的键集合 == `CI_IGNORED_PATHS` ⇒ 想把本门禁的文件加进白名单，必须同时登记去向，
  登记 `commands` 就被要求接线进无条件的 `changes` job。
- 本仓另加一条正向锁（`check-blanket-fs-mock.test.js`「判据域必须整体落在 docs-only 白名单之外」）：
  把 12 个登记项 + 2 个已收敛现场逐个喂给 `classify-docs-only.isDocsOnly`，任一为 `true` 即红。

## 7. 维护 SOP

- **新增测试文件要用 fs 夹具**：照 `apps/desktop/electron/core/container.setup.test.js` 的形状写
  （`os.tmpdir()` + PID 的沙箱、`isSandboxPath` 按路径段、沙箱外 `<handle>.<verb>(…)` 委托、写动词一律 no-op），
  不要往 `KNOWN_BLANKET` 里加自己。
- **收敛一个已登记的**：删掉它在 `KNOWN_BLANKET` 里的登记项，**同一个 PR 内**；否则报"陈旧登记"。
- **确实收敛不了的**：原因必须写清"为什么不会踩到 §1 那条链"（例：本文件 `vi.mock('electron')` 已被 vitest
  提升到文件体之前 ⇒ 真 `electron/index.js` 不进本 realm），"待办"不行。
- 改判据必须同 PR 补/改反证，并做一次**把锁本身改成 no-op 必须立刻变红**的变异。
  注意方向：反证要挑"会让脏夹具通过"的改法，不是"让所有文件都红"的改法 —— 后者红说明代码在跑，
  不说明判据有用。

## 8. 现场与遗留

现场（本次实测）：1068 个被跟踪测试文件、12 个 blanket（全部已带原因登记）、2 个已收敛、0 个读不动。

- 12 个登记项里绝大多数同时 `__enableElectronMock()`，即 electron 走 mock 而非真 `index.js` ⇒ 那颗雷**今天不响**。
  不响不是不存在：一旦有人去掉那行 opt-in，同一个 realm 就回到 §1 的形状。逐个收敛是后续工作。
- 判据仍是**静态**的：它看夹具形状，不运行测试。`REGEX_PRECEDERS` 那张表不含关键词结尾（`return /x/`），
  失效方向是"少掩码"⇒ 最坏把字符串里的花括号当代码数，即**误报**而不是漏报。
  真正的漏报样本若出现，正解是引 AST 而不是继续叠正则。
- 沙箱常量"可追溯到 tmpdir"是按**声明链**判的，不校验运行时真的用了这个值；一个把 tmpdir 常量
  取来却拿去比较无关路径的夹具仍会通过（那属"语义错"，由 review 与「文件系统测试隔离」门禁负责）。
- `deps.inline:['electron']` 是否仍必要属独立评估项（任务 #33）。摘掉它会让这条链从根上消失，
  但那是运行时代码面的决定，不在本棘轮范围内。
