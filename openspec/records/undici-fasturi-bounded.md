---
record: undici-fasturi-bounded
task: 把 undici / fast-uri 两条 pnpm override 由无上界 >= 收成 ^，并加一条"整张覆写表都必须有上界"的棘轮
date: 2026-10-05
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；回填者＝下一个会话，回填后必须删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（取 git log origin/main --grep='(#NNNN)$' 的 merge SHA 与时间）
---

## 本次执行记录：undici / fast-uri 覆写收上界 + 整表棘轮（undici-fasturi-bounded，2026-10-05）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（依赖配置 + 锁 + 回归锁） | worktree `D:/Data/projects/mp-worktrees/mp-undici-fasturi-bounded`，裸分支 `undici-fasturi-bounded`，base `97b569ea9`；三连实证 toplevel/branch/head 全对。`pnpm install --frozen-lockfile --ignore-scripts` rc=0（1m4.9s），`verify-worktree-deps` **rc=0 / 消费方解析通过 11 项** |
| 第一性原因（QM-5 ①） | 已定位 | `7cba107ba`（PR **#2613**，2026-09-29「提升 undici/fast-uri 到安全修复版下限，解阻塞全部 open PR 的依赖审计红」）建立这两条 override 时写成 `>=7.29.1` / `>=3.1.7`。当时是为了解红，取"下限"是最快写法；上界的代价要等**下一次非 frozen 的 install** 才暴露，所以没人当时付。`git log --format='%h %cI %s' origin/main -- pnpm-workspace.yaml` 三条：#2613 / 我上一轮的 #2856（只把 axios 收成 `^`，注释里明写"上面两条 undici/fast-uri 仍是 >=，属同族隐患，但改它们要重新 resolve 那两个包，本 PR 不夹带"）/ 本 PR。⇒ 这个隐患被**两次**看见、两次写下、两次没修，存续 6 天，期间没有任何东西在看它 |
| 为什么要收（实测，不是推测） | ✅ | registry 现场：`undici` `dist-tags.latest = 8.11.2`（major 分布 7.x=60 个、8.x=20 个），`fast-uri` `latest = 4.2.1`；而锁里解析到的是 `undici@7.30.0` / `fast-uri@3.1.8`。override 是**整体替换**依赖区间 ⇒ 保留 `>=` 等于允许下一次 `pnpm install`（不带 --frozen-lockfile）把它们静默抬到 8.x / 4.x，跨 major 且无任何声音 |
| 消费者与兼容性 | 实测 | 两者都是纯传递依赖：`undici` 由 `@electron/get@5.0.0`、`cheerio@1.2.0`、`jsdom@29.1.1` 声明；`fast-uri` 由 `ajv@8.18.0`、`ajv@8.20.0` 声明；`importers` 段里**无人直接声明**（实测 hits=0）。收成 `^7.29.1` / `^3.1.7` 后解析结果不变（锁里仍是 7.30.0 / 3.1.8），改的只是"将来允许解析到什么" —— 这条由新增用例「收上界不得改变解析结果」钉住 |
| 逃逸分析（QM-5 ②） | 逐层 | ①单元测试层：`production-dependency-security.test.js` 里**早就有**一条"axios override 必须有上界"的断言，但它按**单条点名**写（只匹配 `axios:` 那一行），新增/保留别的无上界覆写对它完全不可见；②门禁层：`check-dep-audit` 判公告命中，不判覆写有没有上界；③审计基线：`upgrade-tracked` 的口径也不看这个；④锁一致性：没有任何东西比较 `pnpm-workspace.yaml` 与 `pnpm-lock.yaml` 的 overrides 段 —— 而这两处手工必须同步（本 PR 就是按行手工重放锁的，靠的正是 CI 的 `pnpm install --frozen-lockfile` 会拒绝漂移）。共同点同上一轮：**"某个人在某条断言里想到的那一条"被守住了，同一形状的其余几条没有** |
| 修复 + 回归保护（QM-5 ④） | 已落地 | 值改动 4 行：`pnpm-workspace.yaml` 两条 override + `pnpm-lock.yaml` overrides 段两行（**按行重放，不重新 resolve** —— 重新 resolve 会夹带无关版本）。回归锁三条新用例：①**整表**判据（读到几条判几条，含规模下界 `>=3`，裸 `>=` 一律红）；②两把锁的 overrides 段 `deepStrictEqual`（我这次手工重放就靠它自证没漂）；③锁里 undici/fast-uri 解析版本不得跨 major 且不低于修复下限。加上既有的 axios 那条，共 5 例 |
| 防止再次发生（QM-5 ⑤） | ✅ | 判据从"逐条点名"升级成"整表 + 规模下界"，并写进 `pnpm-workspace.yaml` 的注释指向该测试文件 —— 以后加一条无上界覆写会当场红，不再靠人记得补注释。原断言里那句"或同步收紧 undici/fast-uri 两条"已过期（两条已收紧），一并改掉，不留一条指向不存在出路的话 |
| 反证（锁必须能红） | 已实跑，cause-match | **M1** 把 `undici` 退回 `'>=7.29.1'` ⇒ 套件 rc=1，红 2 条（整表上界 + 两把锁一致），正是预期那 2 条；**M2** 只改 workspace 让锁漂移（`fast-uri: '^3.9.9'`）⇒ rc=1，**恰好 1 条红**且是漂移锁而非上界锁（证明两条判据互不掩盖）；**M3** 删掉 `axios` 那条 override ⇒ rc=1，红 3 条，其中含既有那条「生产依赖不允许解析到存在高危公告的 Axios 版本」⇒ 新判据没有把旧判据挤掉。三次变异都先断言"文本真的变了"（打印 bytes 前后 + 锚点已消失），全部按**字节**还原，还原后套件 rc=0、0 红 |
| CI 等价判据 | ✅ | `pnpm install --frozen-lockfile` rc=0（这是唯一能证明"手改锁没有把 YAML 改成非法"的命令；上一轮我因 rebase 文本合并造出重复键，CI 报 `ERR_PNPM_BROKEN_LOCKFILE` 把 required 四项一起打红，地板锁/审计门禁对那种非法文件全都免疫）。另核实 `overrides:` 键在两个文件里各只出现 **1** 次（我第一版迁移脚本会写出第二个 `overrides:` 键，落盘前的重复键检查把它拦下了） |
| 测试面 | ✅ | `production-dependency-security.test.js` **7/7**（QM-6 后由 5 例增至 7 例）；`pnpm --filter @multi-publish/api-publish-engine test` **34 files passed**，rc=0；`node scripts/check-dep-audit.js` rc=0 `✅ 无新增已知漏洞公告` |
| 行尾与 diff 对账 | ✅（过程自伤已当场修） | 三个改动文件最终 `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 逐文件相等：test `62/1`、lock `2/2`、workspace `11/5`。**过程中自己造了一次行尾损坏**：追加用例的脚本对已是 CRLF 的文本又跑一遍 `replace(/\n/g,'\r\n')` ⇒ **122 行变成 `\r\r\n`**（症状：工作树 CR=306 而行数只有 185；`git diff` 两口径差 11 行）。由两口径对账暴露，修复脚本带「剥掉 CR 后内容逐行相同」断言（只准动行尾，一个内容字符都不许变），复验 `doubleCR=0` |
| 另一处当场自纠 | 已修 | 新写的 `readOverridesBlock` 有真 bug：`overrides:` 段里夹着**顶格注释**（本仓 axios 那条前面有 8 行顶格说明），而它按 `/^[^\s]/` 遇顶格即 break ⇒ 只读到 2 条 override、axios 整条隐身。是**我自己的新用例**当场把它判红的（`names.length >= 3` 规模下界）。修法：注释行继续、真顶格才 break，并在注释里写下这条来由 |
| QM-1 打包 / QM-4 视觉 | N/A | 未改运行时代码语义（只改依赖区间与锁），且解析结果逐字节未变；未触 `apps/desktop/electron/` 与 UI 文件 |
| QM-6 CCG 双模型外部评审 | 部分执行（三路两败一成，7 条已处置） | 通道实况：`codeagent-wrapper --backend codex` rc=0 但只有一句中间话、无 findings 产物；`--backend claude` 报 `completed without agent_message output` rc=1；**替代通道 `opencode run --model opencode/*-free` 产出真产物**（`.qm6-findings-fe2.json`，7 条：0 Critical / 4 Warning / 3 Info）。回声核验：评审用语在我发出的 prompt 与喂入的 diff 里 `grep -c` 均 0（仅 `自相矛盾`/`两域齐全` 各 1 次命中，命中的是被审代码自身注释）⇒ 判为评审产出。**本 PR 相关那条（Warning）实测成立**：`production-dependency-security.test.js:75` 的失败文案让人「改成带 ^/~ 的写法」，而同文件两处判据硬编码成只认 `^`（`:74` `/^\^?\d/`、`:157` 同形）⇒ 照文案写 `~` 会被自家门禁判红，**指引与判据互斥**；且 `:16` 的 `parseVersion` 早就接受 `~`，说明"~ 属合法写法"是本文件自己的既有口径 |
| QM-6 处置（本 PR） | 已修并实跑 | 把「有上界的写法」收成**单一真源**：`BOUNDED_PREFIXES = ['^','~']` + `hasUpperBound()` + `boundedHint()`；两处判据改调 `hasUpperBound`，两处失败文案改由 `boundedHint()` 生成（文案由判据集合生成，结构上不可能再互斥）。新增 2 例：①行为锁（`^1.2.3`/`~1.2.3`/`1.2.3` 必须接受，`>=1.2.3`/`>1.2.3` 必须判红）；②结构锁（两个调用点必须走真源、代码行里不得再出现内联前缀正则、文案不得再硬写「^/~」）。**修脚本时自己踩到两个新坑并当场纠正**：(a) 起初用 `'^[' + prefixes.join('') + ']'` 拼字符类，`['^','~'].join('')` 得到 `[^~]` 是**取反类** —— 恰好把 `~` 判成不合格，改成显式交替 `/^(?:\^|~)?…/`；(b) 结构锁用 `src.includes(needle)` 扫 `__filename`，而 needle 就写在那行断言里 ⇒ **自指假红**，另加"只扫代码行"（动因注释里原样抄旧写法是给读者的现场证据，不该被撞红） |
| QM-6 反证（两条新锁各自能红） | 已实跑 3 档，cause-match | **M1** 判据退回只认 `^` ⇒ rc=1，红的正是行为锁那一条；**M2** 调用点改回内联 `/^\^?\d/` ⇒ rc=1，红的正是结构锁；**M3** 文案改回硬写「改成带 ^/~」⇒ rc=1，红的正是结构锁。每档先断言"文本真的变了"（打印 `hits` / bytes 前后 / `mutated`），三档结束后各自**按字节还原**并断言与备份逐字节相同（`restored=true ×3`）。套件由 5 例增至 **7 例全绿** |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin undici-fasturi-bounded` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 遗留（不假装已闭合）
- **`^7.29.1` 只是把"静默跨 major"换成"钉在 7.x"**：undici 已有 8.11.2。要不要真升到 8.x 是一次**显式决策**（涉及 jsdom/cheerio/@electron/get 三家对 undici 的区间预期），不属本 PR。本 PR 的效果是"这件事必须有人主动做，而不是被一次 install 顺手做掉"。
- **ops-center/frontend 的 undici 仍在修复版之下**：它自己的 `package-lock.json` 解析到 `undici@7.29.0`，而 10 条公告的区间是 `<7.29.1` ⇒ 确实命中。但它是 **dev 依赖**（vitest 链），而本仓两个 npm 域都按 prod/`--omit=dev` 口径扫 ⇒ 当前不可见。要不要把 dev 域收进判定是 #2904 记录里已登记的同一个决策。
- pnpm 的 override 语义里 `^7.29.1` 对**声明了 `undici: ^8` 的消费者**是强制降级（覆写整体替换区间，不做交集）。当前没有任何直接/传递消费者要求 8.x（实测锁里只有 7.30.0），所以今天无副作用；将来出现这种要求时表现会是"解析到 7.x 后对方行为异常"，判据面目前没有覆盖这一条。
