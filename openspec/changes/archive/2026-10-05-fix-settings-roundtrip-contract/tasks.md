## 1. 基线与取证（改动前状态必须留痕）

- [x] 1.1 记录改动前基线：4 个测试文件实测 `90 passed`（68+8+9+5），含「重启后从 settings 恢复 appMenu」——登记为"全部为防回归锁，无一条是 Bug 探针"
- [x] 1.2 真实 Store + 真实服务往返复现（`getConfig` 读空、落盘行完好），并确认引入点 `384b5c8b`、store 侧 `safeJsonParse` 非拆分引入
- [x] 1.3 并发冲突预检：`automation-content-category` 同文件 +14 行（`contentCategories`），确认改动区段不重叠
- [x] 1.4 记录本机验收现场：`ops-center/backend/.env` 已补 `OPS_CATALOG_API_KEY`/`OPS_RUNTIME_SIGNING_KEY_PATH`，后端监听实测 `127.0.0.1:8010`，`/api/v1/runtime/bootstrap` 错 Key=401 / 对 Key=200 且 `appMenu.items=20`

## 2. RED：先让缺陷可表示

- [x] 2.1 `ops-center-sync.test.js` 的 `makeStore` 改为与真实存储同形（写字符串按 `safeJsonStringify` 语义、读按 `safeJsonParse` 语义返回解析值）；只允许因新 API 名调整调用形状，**禁止放宽任何断言**
- [x] 2.2 三个 reporter 的测试夹具同步同形化（`diagnostics-reporter.test.js` / `publish-reporter.test.js` / `usage-reporter.test.js`）
- [x] 2.3 新增 `apps/desktop/electron/services/settings-roundtrip-contract.test.js`：真 `Store`（sql.js，库落在 `os.tmpdir()` 带随机后缀目录，`afterEach` 显式 `close()`）+ 真服务实例，覆盖四条恢复路径：`opsCenterSync` 配置（url/apiKeyEnc/runtimePublicKey）、`opsCenterRuntime`（含 appMenu + featureFlags + pipelineOptions）、三个 watermark 非零
- [x] 2.4 实跑 2.3 并**确认变红**，记录变红的用例名与原语（这是 Bug 探针；实现前红/绿必须在最终记录里标明）
- [x] 2.5 夹具有效性自证：断言同形夹具下「按字符串读取」的旧写法确实产出空值（证明夹具能区分两种实现，不是恒真）

## 3. GREEN：实现收敛

- [x] 3.1 `settings-store.js` 新增 `getSettingObject(key, defaultValue)`：唯一实现，内含对象判据、JSON 文本兼容、损坏行兜底、`_ready=false` 兜底
- [x] 3.2 `ops-center-sync.js` 六处读取（134/190/200/290/299/309）改用 `getSettingObject`；删除各处 `String(...)+JSON.parse` 剥壳
- [x] 3.3 `ops-center-sync.js` 三处写入（181/257/324）改为直接传对象（落盘字节不变）
- [x] 3.4 三个 reporter 的读取（150/64/62）与写入（157/72/69）同口径收敛
- [x] 3.5 全仓复扫（必须 `-a`，防 NUL 文件被当二进制跳过）确认 4 文件内不再残留 `String(...getSetting` 形状；新出现该形状的文件须逐个判定是否同一契约
- [x] 3.6 实跑 2.3 与 4 个既有测试文件全绿（`90 + 新增` 条）
- [x] 3.7 把 `hot-topics-service.js:157/185/360` 这三处「正确但重复」的归一化登记为后续收敛（写进 `docs/settings-persistence-contract.md` 的「已知重复项」节 + 一句它为何不在本 PR：其注入物是 `container.setup.js` 的窄包装，收敛须先扩转发层），**不得**因为它是重复就顺手改（已在 §6 登记；本轮把清单从 3 处纠为**实测 13 处**（主进程 9 + 渲染层 4），并按真实阻塞理由分组（窄包装 vs 数组型 vs IPC 层），另列 7 处"同形但不同真源"的排除项）

## 4. 反证（变异逐条实跑，禁止口头登记）

- [x] 4.1 摘掉 `getSettingObject` 的对象分支 → 真实存储锁必须红
- [x] 4.2 把夹具退回「原样回吐」→ 真实存储锁**仍红**（证明锁不依赖夹具形状）
- [x] 4.3 把 `_loadRuntimeState` 的 appMenu 恢复改为恒 `null` → 侧边栏恢复用例红
- [x] 4.4 把任一 reporter 的写入改为 no-op → 对应 watermark 用例红
- [x] 4.5 每条变异还原后按字节（md5）比对确认无残留；「未红」一律当待解释异常处理，不得写成"该变异是 no-op"

## 5. 验证范围与重型门禁

- [x] 5.1 **消费者并集**（不是只跑我改过的文件）：对 4 个被改模块 + `store-schema`/`settings-store` 取 `git grep -l` 的消费者测试并集全跑并全绿
- [x] 5.2 apps/desktop 全量 vitest（`pnpm vitest run electron`）——同文件并发改动可能撞到别人的断言
- [x] 5.3 QM-1 本地打包验证（改了 `apps/desktop/electron/` 属强制项）：先 `node scripts/verify-worktree-deps.js`，再 `pnpm exec electron-builder --win --dir --publish never`，产物按 `extractFile` 抽检（`asar list` 是反斜杠路径，不归一化会假 0），启动 8 秒捕获 stderr（PASS：`verify-worktree-deps.js` OK 11 项 → `pnpm run build:dir` → 产物内 3 个真身 `hasNewApi=true`/旧形状=false → 打包 exe 独立 temp userData 启动 8 秒存活且 **stderr 0 字节**、禁用特征 0 命中（含 `getSettingObject is not a function`）。QM-6 修复后已**重跑一次**，同样 PASS）
- [x] 5.4 本地端到端验收（D2=A）：以本机 8010 为运营中心，重启桌面端 → `getConfig` 读回手动 url/apiKey → `syncNow` 成功 → 侧边栏按 20 行配置显隐与排序；在运营中心关闭一项再同步一次，确认免重启广播生效

## 6. QM-5 五步反哺（产出物必须落文件）

- [x] 6.1 根因溯源到 commit（`384b5c8b`，2026-08-10）并写清当时意图（已写入 `.quality-gates.md` 根因行：`store/settings-store.js:22` 返回解析后对象，引入点 `384b5c8b`（2026-08-10），并排除"Store 拆分引入"（拆分前已如此））
- [x] 6.2 逃逸链按层输出：单元（夹具不同形 → 免疫）/ 集成（无）/ E2E（无）/ 视觉（侧栏回落内置，看不出差异）/ 审查（代码自洽，读不出来）（已按层写入执行记录：单元（夹具不同形 → 改动前实测 90 passed 全绿）/ 集成（无该链路）/ E2E（无）/ 视觉（侧栏回落内置菜单，对"配置未生效"零区分）/ 审查（代码读起来自洽））
- [x] 6.3 系统性漏洞定位到具体文件与环节：`ops-center-sync.test.js:44 makeStore`（定位到 `ops-center-sync.test.js:44 makeStore`（Mock 边界漏洞）+ 缺"真实存储往返"这一类锁（门禁缺失漏洞））
- [x] 6.4 回归保护测试即第 2 组产物，写明"真实依赖、不用 mock"（`settings-roundtrip-contract.test.js`（真 Store + 真 sql.js + 关闭重开同一库文件 + 恢复期出站计数为 0），17 条）
- [x] 6.5 预防措施落地：AGENTS.md 增一条 MUST（落盘读回必须与存储实际契约一致；契约夹具不得改变被存值类型），`01-docs/learnings.md` 记录根因与教训（AGENTS.md 已增一条 MUST（落盘读回必须与存储实际契约一致；契约夹具不得改变被存值类型），同 PR 落地）

## 7. QM-6 双模型外部评审

- [x] 7.1 读 `~/.claude/.ccg/config.toml` 的 `[routing].primary` 取模型名（实测 backend=codex / frontend=claude），并行派发两路，评审 diff 绑定 `7bbe33e6b`
- [x] 7.2 通道实况（偏差如实登记）：指定通道 `codeagent-wrapper --backend claude` 两次均**空转**（rc=0/1、无 `agent_message`、无产物），前端结论实际由降级通道 `opencode/nemotron-3-ultra-free` 产出并经本地逐条实测复核（推翻其 2 条子主张、自查拦下 1 条会导致新 Bug 的建议）；后端 `--backend codex` 一路 wrapper 退出并自删日志、**无 findings 落盘**，故第一轮不满足"双模型"，已就修复后的新 head 重投
- [x] 7.3 findings 合计 1 Critical / 5 Warning / 3 Info（前端一路）。Critical 已修（`_readStoredObject` 三个出口统一出声）；Warning 中 W5（单键夹具使断言键不敏感）与 W6（窄包装落后契约一个方法且无锁）已修，W4（锁正则误伤）按实测改窄并补判据矩阵，W2/W3（文档清点不全 + 数组型不在覆盖范围）以文档纠偏落地；**驳回 2 条**并留证据：Info-8 主张"主进程中文日志会被 CJK 门禁拦"——`check-locale-sync.js:39` 扫描域只有 `apps/desktop/src`，不覆盖 `electron/`；其建议"日志统一中文"与三个 reporter 的既有约定相反（实测英文 4/6/9 条 vs 中文 1 条，而那 1 条正是本 PR 新引入的），故按**文件自身约定**改为英文

## 8. 文档与质量节拍收口

- [x] 8.1 新建 `docs/settings-persistence-contract.md` 满足 doc-gate（新文件不与任何人顶插同一行，撞车面归零），并在其中写明与 `app-menu` 规格第 51 行的关系（已建（99 行，含 §6 实测清点与 §7 DoH 证据更正））
- [x] 8.2 `CHANGELOG.md` 收口采用**字节级前插**（`Buffer.concat`，禁 split/join），并当场用「去掉前缀后与合并基逐字节相等」证明纯置顶（已做（Buffer 级前插 + 逐字节前缀相等证明））
- [x] 8.3 行尾对账两口径（`git diff --numstat` vs `--ignore-cr-at-eol --numstat`）必须一致且删除数为 0；另做逐字节孤立 CR 扫描（两口径一致、删除数 0）
- [x] 8.4 `.quality-gates.md` 增执行记录（含 `| 远程同步 | PENDING |`），**同 PR** 往 `scripts/gate-record-debt-ledger.json` 登记该条并本地跑 `node scripts/check-gate-record-debt.js`（记录与 ledger 同 PR，`check-gate-record-debt` 本地 OK）
- [x] 8.5 并发预检证据入执行记录（实测方式：`git worktree list` + 逐分支 `git diff --name-only origin/main..<branch>` 与本次 4 个目标文件求交，命中 `automation-content-category` 后已确认其改动区段不重叠，且该分支在本 change 建区前已并入 main）。**不新建 `openspec/active-tasks.json`**：`git ls-files | grep -i active-task` 实测零命中，AGENTS.md 描述的这套中央登记本仓从未落地，不在 bugfix PR 里顺手发明机制（缺登记机制本身另案处理）。新增测试落 `apps/desktop`（vitest workspace 自动收集），仍须跑 `node scripts/check-unwired-tests.js` 确认未被判为未接线（并发预检已入记录；`check-unwired-tests` OK（54 个测试文件全部接线或登记））

## 9. 提交、PR、远程同步

- [x] 9.1 推送前本地跑通：`check-gate-record-debt` / `check-unwired-tests` / `check-step-failfast` / `check-max-lines`（`ops-center-sync.js` 已 629 行，注意行数熔断预算）（本轮已本地复跑四道：max-lines（超限 98 / 挂账 98 / 墓碑 1，无新增）、gate-record-debt、unwired-tests、step-failfast 全 OK）
- [x] 9.2 分支推送走 PowerShell 原生 `D:\` 路径；`classify-docs-only.js` 判定为混合 PR → 走完整质量节拍；创建 PR 后以产物存在为判据（`gh pr create` 可能 rc=0 而什么都没做）（PR #2899 已创建并以产物（`gh pr view` 回读 number/headRefOid）为判据；判定为混合 PR → 完整门禁）
- [x] 9.3 CI 轮询用 `gh pr checks --json`，红项先按「本机可配置维度必须本机复现」归因；`pnpm-lock.yaml` 不得文本合并 —— **已失效（无待轮询对象）**：#2899 已于 2026-10-05 12:47 squash 合并为 `10d2a8202`，PR 不复存在，CI 无待轮询项。归因纪律本身（红项先按「本机可配置维度必须本机复现」判因、`pnpm-lock.yaml` 禁文本合并）已由 `openspec/records/fix-settings-roundtrip.md` 的 QM-6/全量测试行留痕，无需再执行。
- [x] 9.4 合并后：回填远程同步行 PASS **并同 PR 删除 ledger 登记项**；`openspec archive` + `active-tasks.json` 销账 —— **已完成（本次收口销账）**：① 远程同步行已 PASS 并载 merge SHA `10d2a8202a83d173d3495652d84c02a9fed7a62d` + 远端分支已删（`openspec/records/fix-settings-roundtrip.md` 末行）；② `scripts/gate-record-debt-ledger.json` 已无 #2899 登记项（实测全文检索 0 命中）；③ `openspec/records/` 载体文件齐备；④ `openspec/active-tasks.json` 本仓从未建立过该文件 ⇒ N/A；⑤ `openspec archive` 由本次收口执行。
- [x] 9.5 worktree/分支清理走 `scripts/safe-worktree-remove.ps1`（先 `-WhatIf` 干跑）；`branch -d` 被拒不等于未合并，需行级包含证明 —— **N/A（无残留可清）**：`git worktree list` 现存仅 3 个（mulpub 主根 + `mp-issue-2610-locales-baseline` + `mp-issue-2878-egress-stubs`），本 change 的 worktree `mp-fix-settings-roundtrip` 已不存在；`fix-settings-roundtrip` 分支本地与远端均无（squash 合并后已删远端）。故 `safe-worktree-remove.ps1 -WhatIf` 无对象可干跑，行级包含证明亦无对象可证。

## 10. 记忆与本机现场

- [x] 10.1 内置记忆：更新 [[project-mulpub-verification-seams]] 或新增条目，记「契约夹具不得改变被存值类型」这一落点与判据（内置记忆已写（AGENTS.md 同步一条 MUST；夹具类型不对称落点））
- [x] 10.2 项目记忆：本机运营中心三段配置事实（本地 8010 已通 / 应用配置行现指向本地并依赖本 PR 才可读回）。**原判据"ops.iart.work DNS 不解析"已作废**：fake-ip 型代理对本机任何域名都回 `198.18.x.x`，本机 `dns.lookup` 无法区分"未部署"与"链路不通"；改用 DoH（`dns.google/resolve` + `github.com` 正控）复测得 `Status=3 NXDOMAIN`，结论不变、证据替换。同场实测 `auth.iart.work`→`39.105.42.85` 线上 302，即部署主机已存在 —— **已完成（#2914 落地，实测复核）**：`docs/proxy-environment-adaptation.md` 已载 fake-ip `198.18.0.0/15` 机制、`github.com → 198.18.0.54` 等实测读数、判据改走 DoH（`dns.google/resolve` 读 `Status`，3=NXDOMAIN）并强制配正控，以及本仓实例 `ops.iart.work`=NXDOMAIN / `auth.iart.work`=`39.105.42.85` 线上 302；`docs/settings-persistence-contract.md` 第 94 行另存「取证通道换过一次」的方法论现场。
- [x] 10.3 EverOS：episode 级沉淀（现象 → 复现手法 → 逃逸原因 → 修法）（EverOS episode 已落盘（`~/.everos/dsh/Mulpub-*/users/to_co/episodes/episode-2026-10-05.md`，以文件为判据，不以工具应答为判据））
- [x] 10.4 收尾时明确 `.env` 追加的两行与 `AppData\Local\Mulpub\ops-center-dev\` 私钥文件的归属与删除方式（密钥不落仓库、不贴对话） —— **已完成（实测复核）**：`docs/settings-persistence-contract.md:91` 载明 `.env` 补 `OPS_CATALOG_API_KEY` + `OPS_RUNTIME_SIGNING_KEY_PATH`，私钥文件位于仓库外 `%LOCALAPPDATA%\Mulpub\ops-center-dev\`，**不入 git、不入对话**；同文第 98 行给出删除时机（ECS 部署完成后移除手写 `opsCenterSync` 配置行，让应用回落 identity 自动发现）。

## 11. QM-6 修复轮（第二轮）验证

- [x] 11.1 每条新锁都做了"拆掉它必须红"的变异反证，且**先跑基线**证明该用例在未变异时确实跑过且为绿（vitest 全绿时不打印 `N failed`，判据要把"无 failed 计数"当绿，否则会把绿读成"基线不可信"）：M1 摘「未注入 store」留痕 / M2 摘「缺少方法」留痕 / M3 退回静默 catch / M4 结构锁常量改 no-op / M5 窄包装转发不存在的方法 / M6 扩转发不销账 / M7 运行时策略写错键 —— 7 条全部 `1 failed`，收尾断言三个被改文件与备份**逐字节相同**
- [x] 11.2 行尾：本轮被改文件行尾**并不统一**（`settings-roundtrip-contract.test.js` 与 `publish-reporter.js` 是 LF，`ops-center-sync.*`、`settings-store.js`、`container.setup.js` 是 CRLF）。先用 `grep -c $'\r'` 探一次得到的是**错答案**（把 LF 文件报成 CRLF），改用 Node 直字节计数才定准；所有补丁按目标文件自身行尾落，并断言"原有每一行都还在 + 行尾类型未变"
- [x] 11.3 后端角色重投并绑新 head；两路 Critical 均为零后方可挂 auto-merge —— **已完成（结论已固化，无需再挂 auto-merge）**：后端第二投结论 0 Critical / 5 Warning / 9 Info（见 12.1）；前端路 1 条 Critical（`_readStoredObject` 两处无声 `return {}`）已修、W4/W5/W6 已修、W2/W3 以文档纠偏落地 ⇒ Critical 归零。#2899 后续已实际合并，auto-merge 前提与对象均已消解。

## 12. QM-6 后端评审（第二轮，绑定 7bbe33e6b）处置

- [x] 12.1 后端 `codeagent-wrapper --backend codex` **重投成功**（首投 PID 42800 跑满 ~14 分钟后 stdout 截断在第一条 finding 中途、包装器日志退出时自清、`~/.codex/sessions` 无 rollout ⇒ 不可恢复；改法＝要求"先落盘产物再回摘要"）。结论 **0 Critical / 5 Warning / 9 Info**，判定可合并
- [x] 12.2 结构锁被实测出**双向错误**并已在 commit 之外修好：commit 版 `String(...getSetting` 过宽（误伤 `getSettingObject`）；我为消误报收窄成 `getSetting\s*\(` 之后又**漏掉修复前的真实原形** `String(this._store?.getSetting ? this._store.getSetting(K) || '' : '')`（三元里的 ` ? ` 空格断了字符类）⇒ 消误报顺手把锁改弱了。改为**按语义取 `String(` 的配对实参**再判其中是否引用 `get(?:User)?Setting`；判据矩阵正例逐条取自 `git show origin/main:<file>` 的原文（7 条全 FLAGGED），负例 5 条含新入口全部 CLEAN，且四个真身在 origin/main 上命中 6/1/1/1、在修复后为 0
- [x] 12.3 后端条目 #10/#12 的证据被本 worktree 的**未提交并发改动**污染（其引用的 `FORBIDDEN_SHAPE`/`KNOWN_LAGGING` 在 `7bbe33e6b` 里不存在）⇒ 新 commit 推上去后须对新 head 重评这两条。编排侧已自查写出方：10 个 M 文件的 mtime 与我自己的脚本运行时刻逐一对得上（10:36–10:49），无第二写者 —— **已完成（已在新 head 上重评，两条变异反证均变红）**：`7bbe33e6b` 是 squash 前的 worktree 提交，squash 合并后不再是有效对象（`git cat-file -t` 报 `Not a valid object name`），故以新 head `10d2a8202` 为准重评。基线 `settings-roundtrip-contract.test.js` = **17 passed**；变异 #10（结构锁）向 `ops-center-sync.js` 注入修复前真实原形（`String(` 配对实参里引用 `getSetting` 的三元守卫形态）⇒ 恰「ops-center-sync.js 不得再用 String(getSetting(...)) 的误判口径读配置」1 failed / 16 passed；变异 #12（装配锁）向 `settings-store.js` 注入未转发的 `getProbeObject` ⇒ 恰「对象语义读取入口的未转发清单只能缩小」1 failed / 16 passed。两个被变异文件均按 md5 逐字节还原（`28DF9CC015D9` / `61282D8334C7`），收尾复跑 17 passed 且 `git status --porcelain` 为空。
- [x] 12.4 Warning 登记为后续切片：§8.1 行损坏抹 Key（要改 `_readStoredObject` 的三态契约，波及 6 个调用点）；§8.2 信任锚移出可写表（属产品级安全决策，非加验签能了结）；窄包装扩面（本 PR 只加了注释 + 装配锁，未强行转发） —— **已完成（本次补齐中央台账）**：`docs/settings-persistence-contract.md` §8.1（行损坏抹 Key）与 §8.2（信任锚不重验签，威胁模型断言）已登记；本次另在 `01-docs/tech-debt.md` 补入这两条与「窄包装未转发 `getSettingObject`」的中央台账条目，使后续切片可被独立检索。
