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
- [ ] 3.7 把 `hot-topics-service.js:157/185/360` 这三处「正确但重复」的归一化登记为后续收敛（写进 `docs/settings-persistence-contract.md` 的「已知重复项」节 + 一句它为何不在本 PR：其注入物是 `container.setup.js` 的窄包装，收敛须先扩转发层），**不得**因为它是重复就顺手改

## 4. 反证（变异逐条实跑，禁止口头登记）

- [x] 4.1 摘掉 `getSettingObject` 的对象分支 → 真实存储锁必须红
- [x] 4.2 把夹具退回「原样回吐」→ 真实存储锁**仍红**（证明锁不依赖夹具形状）
- [x] 4.3 把 `_loadRuntimeState` 的 appMenu 恢复改为恒 `null` → 侧边栏恢复用例红
- [x] 4.4 把任一 reporter 的写入改为 no-op → 对应 watermark 用例红
- [x] 4.5 每条变异还原后按字节（md5）比对确认无残留；「未红」一律当待解释异常处理，不得写成"该变异是 no-op"

## 5. 验证范围与重型门禁

- [x] 5.1 **消费者并集**（不是只跑我改过的文件）：对 4 个被改模块 + `store-schema`/`settings-store` 取 `git grep -l` 的消费者测试并集全跑并全绿
- [x] 5.2 apps/desktop 全量 vitest（`pnpm vitest run electron`）——同文件并发改动可能撞到别人的断言
- [ ] 5.3 QM-1 本地打包验证（改了 `apps/desktop/electron/` 属强制项）：先 `node scripts/verify-worktree-deps.js`，再 `pnpm exec electron-builder --win --dir --publish never`，产物按 `extractFile` 抽检（`asar list` 是反斜杠路径，不归一化会假 0），启动 8 秒捕获 stderr
- [x] 5.4 本地端到端验收（D2=A）：以本机 8010 为运营中心，重启桌面端 → `getConfig` 读回手动 url/apiKey → `syncNow` 成功 → 侧边栏按 20 行配置显隐与排序；在运营中心关闭一项再同步一次，确认免重启广播生效

## 6. QM-5 五步反哺（产出物必须落文件）

- [ ] 6.1 根因溯源到 commit（`384b5c8b`，2026-08-10）并写清当时意图
- [ ] 6.2 逃逸链按层输出：单元（夹具不同形 → 免疫）/ 集成（无）/ E2E（无）/ 视觉（侧栏回落内置，看不出差异）/ 审查（代码自洽，读不出来）
- [ ] 6.3 系统性漏洞定位到具体文件与环节：`ops-center-sync.test.js:44 makeStore`
- [ ] 6.4 回归保护测试即第 2 组产物，写明"真实依赖、不用 mock"
- [ ] 6.5 预防措施落地：AGENTS.md 增一条 MUST（落盘读回必须与存储实际契约一致；契约夹具不得改变被存值类型），`01-docs/learnings.md` 记录根因与教训

## 7. QM-6 双模型外部评审

- [ ] 7.1 读 `~/.claude/.ccg/config.toml` 的 `[routing].primary` 取模型名（不照抄文档里的示例值），并行派发后端 + 前端两路审查，绑定评审 diff 的 SHA
- [ ] 7.2 评审判据：以 findings 落盘或自身 stdout 有正文为准，rc=0 不算跑过；失败按既有替代通道降级并声明偏差
- [ ] 7.3 Critical 清零后方可挂 auto-merge；评审记录写入 `.quality-gates.md`

## 8. 文档与质量节拍收口

- [ ] 8.1 新建 `docs/settings-persistence-contract.md` 满足 doc-gate（新文件不与任何人顶插同一行，撞车面归零），并在其中写明与 `app-menu` 规格第 51 行的关系
- [ ] 8.2 `CHANGELOG.md` 收口采用**字节级前插**（`Buffer.concat`，禁 split/join），并当场用「去掉前缀后与合并基逐字节相等」证明纯置顶
- [ ] 8.3 行尾对账两口径（`git diff --numstat` vs `--ignore-cr-at-eol --numstat`）必须一致且删除数为 0；另做逐字节孤立 CR 扫描
- [ ] 8.4 `.quality-gates.md` 增执行记录（含 `| 远程同步 | PENDING |`），**同 PR** 往 `scripts/gate-record-debt-ledger.json` 登记该条并本地跑 `node scripts/check-gate-record-debt.js`
- [ ] 8.5 并发预检证据入执行记录（实测方式：`git worktree list` + 逐分支 `git diff --name-only origin/main..<branch>` 与本次 4 个目标文件求交，命中 `automation-content-category` 后已确认其改动区段不重叠，且该分支在本 change 建区前已并入 main）。**不新建 `openspec/active-tasks.json`**：`git ls-files | grep -i active-task` 实测零命中，AGENTS.md 描述的这套中央登记本仓从未落地，不在 bugfix PR 里顺手发明机制（缺登记机制本身另案处理）。新增测试落 `apps/desktop`（vitest workspace 自动收集），仍须跑 `node scripts/check-unwired-tests.js` 确认未被判为未接线

## 9. 提交、PR、远程同步

- [ ] 9.1 推送前本地跑通：`check-gate-record-debt` / `check-unwired-tests` / `check-step-failfast` / `check-max-lines`（`ops-center-sync.js` 已 629 行，注意行数熔断预算）
- [ ] 9.2 分支推送走 PowerShell 原生 `D:\` 路径；`classify-docs-only.js` 判定为混合 PR → 走完整质量节拍；创建 PR 后以产物存在为判据（`gh pr create` 可能 rc=0 而什么都没做）
- [ ] 9.3 CI 轮询用 `gh pr checks --json`，红项先按「本机可配置维度必须本机复现」归因；`pnpm-lock.yaml` 不得文本合并
- [ ] 9.4 合并后：回填远程同步行 PASS **并同 PR 删除 ledger 登记项**；`openspec archive` + `active-tasks.json` 销账
- [ ] 9.5 worktree/分支清理走 `scripts/safe-worktree-remove.ps1`（先 `-WhatIf` 干跑）；`branch -d` 被拒不等于未合并，需行级包含证明

## 10. 记忆与本机现场

- [ ] 10.1 内置记忆：更新 [[project-mulpub-verification-seams]] 或新增条目，记「契约夹具不得改变被存值类型」这一落点与判据
- [ ] 10.2 项目记忆：本机运营中心三段配置事实（本地 8010 已通 / `ops.iart.work` DNS 不解析 / 应用配置行现指向本地并依赖本 PR 才可读回）
- [ ] 10.3 EverOS：episode 级沉淀（现象 → 复现手法 → 逃逸原因 → 修法）
- [ ] 10.4 收尾时明确 `.env` 追加的两行与 `AppData\Local\Mulpub\ops-center-dev\` 私钥文件的归属与删除方式（密钥不落仓库、不贴对话）
