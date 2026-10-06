---
record: dep-audit-baseline-2026-10
task: 登记 CVE 库更新后新出的 8 条依赖公告，解除对所有 PR 的 required check 阻塞
date: 2026-10-06
---

## 本次执行记录：依赖审计基线登记 7 条新公告（dep-audit-baseline-2026-10，2026-10-06）

> **来由**：`#2966`（Gate 7b cwd 修复）重跑 CI 时 `依赖漏洞审计` 转红。归因：**与该 PR 改动无关**，且**在干净 main 上同样红**（`node scripts/check-dep-audit.js` 于 main 实测输出同样 7 条）。根因是 CVE 库在两次 CI 运行之间更新了公告，而基线仍是旧的。**这是一条阻塞面在 main、不在任何单个 PR 上的门禁债**。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | 运行时代码（门禁数据文件） | worktree `D:/Data/projects/mp-worktrees/mp-dep-audit-baseline-2026-10`，裸分支 `dep-audit-baseline-2026-10`；健康检查 `mp-worktree-health.ps1` `ok:true`（49 worktree / `outsideWorktrees` 空）；依赖就绪 `verify-worktree-deps.js` rc=0（消费方解析 11 项） |
| 归因（先证明不是自己引入的） | ✅ | 在**未做任何改动的** main 上跑 `node scripts/check-dep-audit.js` ⇒ 同样 7 条 `NEW_ADVISORY`、同样 `rc=1`。这是本 PR 刻意做的第一件事：不先归因就登记，等于把公告变化误记成自己的账 |
| 第一性原因（QM-5 ①） | ✅ | 公告库侧新增 advisory，而 `scripts/dep-audit-baseline.json` 是**快照式挂账**（`reviewBy: 2026-12-31` + 25 条）。门禁判据是「现实命中 ⊆ 基线登记」，现实长大、基线没长 ⇒ 多出来的即 `NEW_ADVISORY`。**判据本身是对的**，缺的是登记 |
| 修复 | ✅ 8 条 | npm 域 5 条 + npm-opscenter 域 2 条 + **pip 域 1 条**，逐条 decision 不同（见下表），非一刀切 `upgrade-tracked` |
| 回归保护（QM-5 ④） | ✅ | `scripts/check-dep-audit.test.js` 26/26 rc=0。其中 `入库基线自洽` 一条**真的拦住了我**：它断言「非 `upgrade-tracked` 的条目不该带 `targetVersion`」，而我给 `sprintf-js` 同时写了 `decision: no-fix-available` **和** `targetVersion: "1.1.4"` —— 自相矛盾，被打回后才摘掉 `targetVersion` |
| 反证（每条登记都能红且可归因） | ✅ 两档，各命中预期那条判据 | **M1**：摘掉 `proxy-addr`（critical）登记 ⇒ `❌ NEW_ADVISORY: npm/GHSA-jqcg-44mw-7w3h` rc=1；**M2**：给 `no-fix-available` 条目加回 `targetVersion` ⇒ 单测 `pass 25 / fail 1`，红在 `非 upgrade-tracked 的条目不该带目标版本承诺`（**红在那一条断言上，不是顺带红**）。两次变异后按字节还原，`restored=True`（SHA256 前缀 `517DA74187EB` 前后一致），还原后门禁回绿 |
| 防止再次发生（QM-5 ⑤） | ✅（部分，见「遗留」） | 每条 note 写明**实测来源**（lockfile 解析版本 / `npm view` 结果 / 本仓是否直接引用），不是抄模块名。`reviewBy` 仍是 2026-12-31，**到期即拦**的既有机制继续生效 |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` = `93 0 scripts/dep-audit-baseline.json`，`--ignore-cr-at-eol --numstat` **逐文件相等**（93/0），无行尾污染 |
| 接线棘轮 | N/A | 本 PR 不新增 `*.test.js` |
| QM-1 打包 / QM-4 视觉 | N/A | 只改门禁数据文件，未触 `apps/desktop/electron/`、未改依赖区间、未触 UI |
| classify-docs-only | false（混合 PR） | 改动含 `scripts/` ⇒ 完整质量节拍，不借道快速通道 |
| QM-6 CCG 双模型外部评审 | 未执行 | 7 条挂账登记，无外部评审通道产物；如实写「未执行」，不以自审冒充 |
| 远程同步 | PASS | 已合并：squash 落地 `6566db8912dcaf1497b68af55892a2384b3f07e0`（PR #2972，`2026-10-06T03:44:15Z`）。取证（2026-10-06 现取）：`git log origin/main --grep='(#2972)$' --format='%H\|%cI'` 得该 SHA 与时间；`git ls-remote --heads origin dep-audit-baseline-2026-10` 返回 **0 行**，证远端分支已随 squash 删除。落地抽查：`git show origin/main:scripts/dep-audit-baseline.json` 上 8 条登记全部在位（含 `CVE-2026-85394` 的 pip 域与 `GHSA-G2V6-RQMX-R4W6` 的 npm-opscenter 域）。**合并后效果已实测**：`#2947` 的「依赖漏洞审计」红灯在本 PR 合并后重跑消解，本地 `node scripts/check-dep-audit.js` 亦为 ✅ rc=0（命中 33 = 挂账 33） |

### 逐条判据（decision 不是一刀切）

| 域 | 公告 | 级别 | 实测版本 → 修复版 | decision | 依据 |
|---|---|---|---|---|---|
| npm | GHSA-jqcg-44mw-7w3h `proxy-addr` | **critical** | lockfile `2.0.7` → `>=2.0.8` | `upgrade-tracked` | 差一个补丁版本；来源单一（`ai-writer-api` → `express@4.22.2`，manifest `^4.18.0`），本仓零直接引用 |
| npm | GHSA-68fv-2mgg-jv7q `source-map-js` | high | lockfile `1.2.1` → `>=1.2.2` | `upgrade-tracked` | 差一个补丁版本；构建期传递依赖（vue-i18n / `@vue/compiler-core`），manifest 零声明，不进运行时产物 |
| npm | GHSA-g2v6-rqmx-r4w6 `@vue/server-renderer` | high | lockfile `3.5.35` → `>=3.5.42` | `upgrade-tracked` | 本仓三处声明 `vue ^3.5.0`，**caret 已覆盖**修复版，仅 lockfile 未刷新；作为 vue 的 peer 引入，本仓不直接声明 |
| npm | GHSA-hp3w-g68c-fv3c `sprintf-js` | moderate | lockfile `1.0.3` → 要求 `>=1.1.4` | **`no-fix-available`** | **唯一一条拿不到修复版的**：`npm view sprintf-js version` 实测最新为 **1.1.3**，公告要的 1.1.4 **尚不存在**；上游 `argparse@1.0.10` 又把范围锁死 `~1.0.2`（`npm view argparse@1.0.10 dependencies` 实测）。写成 `upgrade-tracked` 等于承诺一个不存在的版本 |
| npm | GHSA-rj75-hqrm-r3gf `postcss-selector-parser` | moderate | lockfile `7.1.4` → `>=7.1.6` | `upgrade-tracked` | 差两个补丁版本；构建期传递（eslint-plugin-vue / css-loader / `@remotion/bundler`），manifest 零声明 |
| npm-opscenter | GHSA-G2V6-RQMX-R4W6 `@vue/server-renderer` | high | ops lock `3.5.41` → `>=3.5.42` | `upgrade-tracked` | **该域首条登记**。审计 `ops-center/frontend/package-lock.json`（npm 而非 pnpm），版本与 npm 域那条**不同**（3.5.41 vs 3.5.35）⇒ 必须分域各登一条，两域基线键不共用 |
| npm-opscenter | GHSA-68FV-2MGG-JV7Q `source-map-js` | high | ops lock `1.2.1` → `>=1.2.2` | `upgrade-tracked` | 同上，该域第二条；经 `@vue/compiler-core@3.5.41` 构建链引入 |
| pip | CVE-2026-85394 `python-jose` | unknown | 实装 `3.5.0`，**无修复版** | `not-exploitable` | 见下方专段 |

### pip 域那条 CVE 的判据（认证链漏洞，不可只按"记一笔"处理）

`CVE-2026-85394` 落在 `python-jose`，而 python-jose 是 **ops-center 的认证核心**（`middleware/auth.py`、`services/auth_service.py`、`services/logto_verifier.py` 三个源文件在用），公告描述的是**可伪造 HS256 令牌**——这类结论不能照抄模块名挂账，必须逐条判可利用性：

- **漏洞成立前提**：公告原文限定 `when algorithms are not explicitly restricted`。本仓**两个** jwt 验证点都显式传了 algorithms 白名单——`middleware/auth.py:37 algorithms=[settings.jwt_algorithm]`、`services/logto_verifier.py:95 algorithms=["RS256","ES256"]`。
- **且取值被类型锁死**：`config.py:52` 是 `jwt_algorithm: Literal["HS256"] = "HS256"`，配不出非对称算法；`tests/test_security_config.py:43 test_rejects_unsupported_jwt_algorithm` 已回归拦截 HS384。
- **结论**：当前调用形态下不可利用 ⇒ 判 **`not-exploitable`**。**不判 `no-fix-available`**——那会谎称上游已放弃修复，而公告明说这是 CVE-2024-33663 的不完整修复，上游仍在。复核条件写进 note：任一验证点去掉 algorithms 参数、或 `Literal` 放宽为多算法，即改判。

### 本机 pip 域曾经"假不可用"（差点让这条漏登记）

第一次跑 `node scripts/check-dep-audit.js` 时 pip 域报 `SCANNER_UNAVAILABLE`、`--update` 直接 fail-closed 拒写基线，**当时按域不判处理**。但复查发现并非扫描器缺失：

- `pip-audit 2.10.1` **确实已安装**，只是不在 PATH（`python -m pip_audit --version` 可跑通）；
- 真错因是 `UnicodeDecodeError: 'gbk' codec can't decode byte 0xad` —— 本机 Windows 中文 locale 的默认编码，`requirements.txt` 里含非 UTF-8 可解码字节，**CI（UTF-8 Linux）不会有这个问题**。

于是 `set PYTHONUTF8=1` 后 pip 域真跑通，拿到真实结论：**3 个包命中**（`python-jose` CVE-2026-85394、`ecdsa` PYSEC-2026-1325 报两次）。

**若当时信了"域不可用就不判"，CI 上这条 critical 级认证漏洞会在本 PR 合并后继续红，且本地证据链完全看不出原因。** 这是本轮最值得记的一条。

### 遗留（不假装已闭合）

- **本 PR 只登记、不升级**：6 条 `upgrade-tracked` 的实际动作都是「刷新 lockfile」（`pnpm update vue` / `pnpm update postcss-selector-parser` 等；ops-center 域是在 `ops-center/frontend` 跑 `npm install`），**一次都没做**。含义要写清楚：**这些漏洞在 main 上此刻仍然真实存在**，只是被登记为已知并挂账到 `reviewBy: 2026-12-31`。其中 `proxy-addr` 是 **critical** 且属于 `ai-writer-api` 的 express 链——下一刀应当优先做这个。
- **`PYSEC-2026-1325`（ecdsa）不是本 PR 新增**：main 上早已登记且 decision 为 `no-fix-available`。我一度把它重复添加了一份（`基线不得有重复条目` 单测当场打回，34→33），**保留了既有的上游口径**（上游明言侧信道不在范围内、无计划修复），未改判。判据冲突时以既有登记为准。
- **`pip` 域在本机仍需 `PYTHONUTF8=1`**：直接跑 `node scripts/check-dep-audit.js` 依旧 `SCANNER_UNAVAILABLE`。这是本机 locale 问题、不影响 CI，但**下一个人在本机复核这条记录时会再踩一次**，值得单独开刀（脚本内自行设 UTF-8 模式，或文档化）。
- **`reviewBy` 未动**：仍是 `2026-12-31`。8 条新登记全部挂到这个日期，**没有为它们单独设更近的复核期限**——这是既有基线的统一做法（顶层单值），但 critical 那两条（`proxy-addr`、`CVE-2026-85394`）其实值得更早复核。