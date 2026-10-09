# Tasks: podcast-rss-channel

> P0=RSS 通道 MVP（形态 A 零托管）；P1=用户自有 OSS/COS 直传（形态 B）；P2=代托管（形态 C，前置三条件闭合前不启动）。
> 标注 [阻塞于] 的项在依赖项完成前不得开工。

- [x] 1. 共享引擎（TDD，先测后码）——P0
  - [x] 1.1 `packages/shared-utils/src/__tests__/podcast-rss.test.js`：频道/单集校验精确码数组、fail-closed 抛 `PODCAST_FEED_INVALID` 携带 issues、feed 头部与单集块逐行精确断言（文本结构断言口径）、guid/转义/倒序/MIME 派生、parseFeed 往返锁、verifyFeed 四码（不可达/类型/长度/无时长）与"无 headImpl 零出站"、`isHttpsUrl` 协议判据、`formatDuration` 两档格式（25 例，本机 2026-10-09 实跑通过）
  - [x] 1.2 `packages/shared-utils/src/__tests__/podcast-endpoints.test.js`：目录顺序精确 `['xiaoyuzhou','apple_podcasts','spotify']`、小宇宙 app 提交/无 submitUrl/人工首提/verifiedAt 格式、条目 evidence/steps 非空、未知 id 返回 null、submitUrl 过共享 https 判据、与平台契约面隔离（15 平台数不变）、CJS/ESM parity（8 例，实跑通过）
  - [x] 1.3 `podcast-rss.js`（CJS 引擎）+ `podcast-endpoints.json` + `podcast-endpoints.js`/`.browser.js` 双版本实现至绿

- [x] 2. 文档交付——P0（本刀，docs-only 不成立：PR 含 1 的代码文件，属混合 PR）
  - [x] 2.1 调研报告入库 `01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`（PRD 前置对齐材料）
  - [x] 2.2 `01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md`：数据模型（与引擎常量逐项对齐）、校验码全量表、首次接入时序、IPC 合同表（标注规划未实现）、交互/显示项、locales `podcast` 命名空间 zh/en 全清单、验收/非功能/风险
  - [x] 2.3 `docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md`（D2/D3 决策固化）
  - [x] 2.4 openspec change 目录（proposal/design/specs/tasks）
  - [x] 2.5 主 PRD 索引登记 + `01-docs/i18n-glossary.md` 术语 + CHANGELOG 追加
  - [x] 2.6 `.quality-gates.md` 执行记录 + `scripts/gate-record-debt-ledger.json` 登记（远程同步 PENDING，回填时同次提交删除登记项）

- [x] 3. 主进程接线——P0 [阻塞于 1]（本刀，2026-10-09 实跑：9 套件 rc=0）
  - [x] 3.1 频道/单集持久化服务 `apps/desktop/electron/services/podcast-channel-service.js`（userData 域内 `podcast/`；受控根 = `userData`，路径解析 `userDataDir` 与 `app.getPath('userData')` **同构**并有行为锁；损坏 JSON fail-closed `PODCAST_STORE_CORRUPT`）。判重口径落位说明：服务层按 `id` → `guid` 原地更新；`guid||audioUrl||resolvedAudioUrl` 全链在**引擎构建层**以 `EPISODE_DUPLICATE` fail-closed 兜底（`podcast-rss.js:181`），因此"无 guid 仅重复 audioUrl"不会产出半成品 feed，服务层不重复实现该链（避免两份切词口径）
  - [x] 3.2 IPC 8 通道全部**字面量**注册：`podcast:channel:get/save`、`podcast:episode:list/save/remove`、`podcast:feed:build/verify`、`podcast:endpoints:list`（合同=PRD §8.1；信封 `{code:0,data}` / `{code,message,issues}`；`unwrapObject` 形态守卫；build 失败透传 `PODCAST_FEED_INVALID`+issues 且**不写文件**，实测旧 feed 逐字保留）。字面量原因：`electron/tests/ipc-contract.test.js` 用正则从源码清点通道名，间接/循环注册会让通道对契约锁**隐身**并误报「preload 通道无 handler」
  - [x] 3.3 feed 原子落盘 `<userData>/podcast/feed.xml`：临时文件+`renameSync`，Windows 仅对 EPERM/EACCES/EBUSY 有界退避 `[20,40,80,160,320,640]`，超预算原样抛出；覆盖=全量重建；失败清理 `.tmp.*` 残留（断言目录内无 `.tmp.`）
  - [x] 3.4 双实现收敛：`packages/api-publish-engine/src/podcast/feed-schema.js` 早期草稿已移出源码树（唯一真源 = `shared-utils/podcast-rss.js`；草稿留档 `%TEMP%/podcast-feed-schema-divergent-draft.js` 可恢复）。仓库内无引用（`grep -rna feed-schema` 仅命中本文档与 PRD/CHANGELOG 说明）；`scripts/safe-delete.js` 因本机缺 `mavis-trash` CLI 拒绝删除，故按「可逆优先」走移出而非递归删，目录留空不入 git
  - [x] 3.5 `headImpl` 注入点 + 隐私锁（仅 HEAD 不读体；**缺省不注入即跳过网络检查**，生产默认零真实出站，日志标 `head=off`；日志只记通道名与校验码，禁记草稿标题原文与音频 URL）。主进程 `net` 版 HEAD provider **未接**：P0 自检只跑本地结构校验，接线属 F9 巡检刀（PRD 未实现面 §十二 如实登记）
  - [x] 3.6 回归：`podcast-rss.test.js`(25)+`podcast-endpoints.test.js`(8)+`podcast-channel-service.test.js`+`ipc-handlers/podcast.test.js`+`preload/podcast.test.js`+`usePodcastChannel-contract.test.js`+`PodcastChannelView.test.js`+`href-scheme-contract.test.js`+`ipc-contract.test.js` 全绿；shared-utils 消费面按「消费者并集」跑

- [x] 4. 渲染层——P0 [阻塞于 3]（4.1~4.6 全部闭合；4.5 登记与**浅色**基线曾按 run `37840950306` 的 CI artifact 闭合，但 **4.6 的字号令牌化使 `podcast-channel.png` 重新失效，须按下一次 run 重取**；**暗色基线**仍须待合并后 main 首次 Visual Tests 产物，见 4.5/4.6）
  - [x] 4.1 页面三区块（频道配置/单集列表/RSS 输出与分发端指引）+ 视图注册进路由与侧边菜单。**偏差声明**：状态承载用 `src/composables/usePodcastChannel.js`（PRD 原写 `stores/podcast.js`），理由：本页面为单页自持状态、无跨页共享需求，与仓内同类页面（`use*` 域组合式）口径一致；表单↔引擎键名的映射**唯一实现点**是模块级 `channelFormToPayload`/`channelPayloadToForm`，由 `usePodcastChannel-contract.test.js` 证明该映射是承重的（摘掉即报「播客分类不能为空」）
  - [x] 4.2 locales `podcast` 命名空间 zh/en **成对**落盘：`check-locale-sync.js --pair-base` PASS、`--cjk` PASS（基线 1489 → 当前 1332，无新增硬编码）
  - [x] 4.3 分发端指引卡片：`podcastEndpointHref` 判据 + `target=_blank rel=noopener` + `verifiedAt`「以对方后台当日实况为准」；`href-scheme-contract.test.js` 全域扫描通过（例外清单未扩大）
  - [x] 4.4 空态/失败态文案如实（EPISODES_EMPTY 不硬凑；自检异常点名单集；未构建与「构建出来但不合格」分档显示）
  - [x] 4.5 QM-4：新视图登记视觉用例**两份清单**（all-views `viewTests` + run-pixel-tests `pixelTests`），基线只能取 CI 产物。**登记已在本刀闭合、基线仍在 CI 侧**：用例名 `podcast-channel`，`route: '/podcast'`，`waitFor: '.podcast-channel-page [data-testid="podcast-page-title"]'`（指向页面主标题本身，渲染不出来即本条失败，不是"截一张空白页当基线"），两份清单**逐字一致**（由 `tests/visual-ci.test.js` 的双清单漂移锁守）；`base-screenshots/.gitignore` 同步放行 `!podcast-channel.png` 与 `!podcast-channel-dark.png`（根 `*.png` 会**静默**吞掉基线 PNG，`git add` 不报错也不收，漏放行的后果是 CI 永远缺基线）。本机复跑 `vitest run tests/visual-ci.test.js electron/tests/visual-view-runner.test.js` → **2 files / 34 tests passed**。触发登记的直接动因是全量回归里那条红：`electron/tests/visual-view-runner.test.js` 从 `src/router/index.js` 抽全部 `path:` 并要求每条被 `viewTests` 覆盖，报「路由 /podcast 缺少单视图门禁」。**首张基线不得本机生成**（AGENTS QM-4 MUST 第 7 条：只能来自同一次 CI run 的 `quality-gate-visual-reports` artifact），故首次 `QG Visual` 对本条必然报 `ERR_VISUAL_BASELINE_MISSING`，按那次 run 的渲染回填并自证「新基线 vs 同一次 CI 渲染 = 0 px」，**禁止**提阈值消化。风险已写入 `.quality-gates.md`：侧边菜单新增条目会改变所有含侧栏视图的全页像素，若 `QG Visual` 因此变红，正解是按同一次 run 的 CI 渲染重建受影响基线（非提阈值）。**第三刀（2026-10-09）已按上述口径闭合浅色侧**：首次 `QG Visual` 如预测报 `ERR_VISUAL_BASELINE_MISSING`，取同一次 run `37840950306` 的 `quality-gate-visual-reports` artifact（上传步骤 `if: always()`，所以失败那次 run 同时就是可用的渲染来源），用 `scripts/check-baseline-freshness.js` 导出的 `findRender()` 选图（优先 `<name>.png`，`from=views`，**不另写第二份名字映射**）回填 9 张：新增 `podcast-channel.png` + 重建被侧栏条目位移的 `calendar`/`cloud-publish`/`collection`/`create-editor`/`intelligence`/`keyword-monitor`/`model-providers`/`viral-analysis`，逐张自证「落盘字节 == artifact 渲染字节」（SHA-256 全等，全部 `OK_0PX`）；`check-baseline-freshness` 由「检查 42 张 / **违规 8 张**」变为「检查 42 张 / 违规 0 张」，`tests/visual-ci.test.js` 等 4 files / 50 tests passed。**未改 `PIXEL_THRESHOLD`、未加 mask、`KNOWN_DYNAMIC` 仍为空、未提交任何本机截图**。8 张重建基线的 diff 量级同为 473 px 且包围盒同一条带（侧栏新增「播客」条目），属本次代码改动而非噪声。**暗色 `podcast-channel-dark.png` 仍为未闭合**：`test:visual:pixel:dark` 只接在 `.github/workflows/visual-test.yml:100`（main push / workflow_dispatch），PR 侧 `QG Visual` 只跑浅色，所以暗色基线结构上无法在本 PR 内产出，须合并后由那次 main 的 Visual Tests artifact 回填；`visual-ci.test.js` 的放行白名单只要求 `.gitignore` 里存在 `!podcast-channel-dark.png` **条目**（已放行），不要求该 PNG 已入库）
  - [x] 4.6 **第四刀：渲染端 IPC 入口收口 + 字号令牌化**（两条 `QG Static` 门禁，此前从未被执行到）① Gate 10「渲染端 IPC 单轨制」：`check-frontend-consistency.js` 的 `rendererIpcDirect` 基线为 0 且棘轮只能缩小，本 PR 实红在 `src/composables/usePodcastChannel.js` 的 9 处直写桌面端暴露面（视图 0 处）。正解=新建本仓唯一白名单目录内的窄面层 `src/api/podcast-channel.js`，内部只走 `electron-bridge.js` 的 `invokeNamespace`，**8 个具名导出各自写方法名字面量**（泛化转发 `callPodcastIpc(method,…)` 会被 `ipc-exposure-contract` 判为「生产侧动态取名」，新面还必须先登记进其 `SCAN_DOMAIN`），composable 的自制探测函数删除、`call()` 形参改为桥接层函数引用；**该层不剥壳、不改写、不补默认值**，只把「命名空间/方法不存在」的 `undefined` 显式转成 `{available:false}`（与「调用抛错」是两种用户可见语义）。回归锁 `usePodcastChannel-ipc.test.js` 11 例（夹具只 mock 桌面暴露面、驱动**真实**桥接层；含 reactive→纯对象脱壳的原型断言 + 逐条字面量结构锁 + 导出名与 preload 暴露面逐字一致锁；变异反证：摘 `available` 判定红 3 例、把某个导出退回变量转发时 `ipc-exposure-contract` 与本文件结构锁**同时红**，还原后全绿）。用户可见行为与错误码文案逐字不变。② Gate 16「字号标度」（该 job 第 22 步，被 Gate 10 的红挡住过）：本页 16 处 `font-size: Npx` 折进七档令牌（xs12/sm13/base15/md17/lg20/xl24/xxl32），16px→`md`、14px→`base` 使两处标题各高 1 px；**禁止** `calc(var(--font-size-md) - 1px)` 这类把 off-scale 值藏回令牌的写法。复跑 `check-frontend-consistency`（0/0 PASS）+ `check-font-size-scale`（34/基线 790 PASS）+ `check-css-var-defined`/`check-color-literals`/`check-vue-style-parse`/`check-scoped-root`/`check-max-lines` 全 PASS，并按「同一 job 顺序步骤」教训把 `QG Static` 的全部 37 个门禁脚本本机逐个跑一遍。**由此产生的未闭合**：`podcast-channel.png` 浅色基线不再等于下一次渲染，须按下一次 run 的 `quality-gate-visual-reports` 以 §4.5 完全相同口径重取（同 `findRender()`、逐张 SHA-256 自证 0 px、不提阈值、不加 mask、不用本机截图）；PR 侧 `QG Visual` 的 6% 全页容差对 1 px 文本变更失明，其绿**不作为**基线有效证据

- [x] 5. 正交通道分叉与闸守护——P0 收尾 [阻塞于 3]
  - [x] 5.1 发布任务入口通道类型分流：**无需新增分流代码，靠"不存在条目 + 既有闭值域归一"两道既有闸**（小宇宙/Apple/Spotify 在 `config/platforms.yaml`、`publish-capabilities.json`、`platform-definitions.js`、rpa 选择器四处全缺，DOM/API 轨根本无从选中）；`publishMode` 三态值域不动（ADR-0008）。本刀补上此前缺失的行为锁（文件头原本自称"归一 fail-closed"但无对应断言）：`publish-mode-config.test.js` 新增三条 —— 值域精确 `['api-only','api-then-dom','dom-only']`、`normalizeMode('rss')` 与 `decideRoute({mode:'rss'})` 必须抛 `unknown publishMode`（**不得**静默回落 `api-then-dom`，回落即把 RSS 推进轨调度去点不存在的选择器）、`platforms.yaml` 平台键不得含三个分发端 id。实跑 13/13 通过（原 10 条）
  - [x] 5.2 接线守卫：分发端 id 永不出现在 DOM/API 轨调度集合，由 `podcast-endpoints.test.js` 两个 describe 承担（「不得出现在登录 URL 表 / 平台名表 / 发布能力注册表」+「不得出现在会话标记表 / 认证主机表——RSS 通道无凭证采集面」）；`platform-definitions.test.js` 的 15 平台数不变是第二道
  - [x] 5.3 新测试文件接进 CI：本刀新增的 6 个测试文件全部落在 vitest workspace 自动收集面（`apps/desktop`、`packages/shared-utils`），引擎侧只往**已登记**的 `publish-mode-config.test.js`（在 `run-tests.js` 的 `VITEST_FILES` 清单第 33 行）追加用例 ⇒ 无需新增点名；`node scripts/check-unwired-tests.js` PASS（无新增未接线）

- [ ] 6. 验收闭环——P0 [阻塞于 3,4,5]
  - [ ] 6.1 真实链路人工核对一次：生成 feed → 部署可达 → 小宇宙 App 提交 → 审核期不改 feed 地址 → 收录后追加单集验证小时级同步（验收主判据=RSS 生效，聚合端展示人工核对）
  - [x] 6.2 QM-1 打包验证（触 `apps/desktop/electron/` 后必须）+ QM-6 双模型评审（M+/中高风险）——QM-1 两次实跑（首刀 `mp-pod-qm1b.txt`；修复刀复跑 `mp-pod-qm1c.txt`：build:dir rc=0、asar 含窄面孪生与修复行、解包 require ok、启动 12s 无禁发噪声）；QM-6 后端模型实回 1 Critical+4 Warning+3 Info **全部处置**（每条变异反证实测变红后还原全绿，评审产物 `.ccg/reviews/54e217e3….json`、`c5f44f2e….json` 入库），前端模型三次重试挂起按降级口径如实记录（详见 `.quality-gates.md` QM-6 行）

- [ ] 7. P1 用户自有 OSS/COS 直传（形态 B）[阻塞于 6 完成]
  - [ ] 7.1 另行规格化（openspec 新 change 或本 change 追加 delta）：`oss-uploader.js` 改「用户自配 AK/bucket/endpoint/前缀」形态、AK 进 credential-store、直传回填 `resolvedAudioUrl`、外链巡检（PRD F7~F9）
  - [ ] 7.2 feed.xml 一并上传用户桶固定 key 的路径设计（PRD O5 开放问题的正解候选，规格化时裁决）

- [ ] 8. P2 代托管（形态 C）[阻塞于 7；前置三条件缺一不启动]
  - [ ] 8.1 能收费：entitlement 配额（存储 GB+抓取流量）定价模型
  - [ ] 8.2 可审核：机审+举报下架流程
  - [ ] 8.3 可退出：churn 后 feed 归属与迁移导出方案
