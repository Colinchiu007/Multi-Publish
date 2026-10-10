# 任务：播客 RSS 频道接入一键发布

## 1. 刀 1 多频道数据模型与迁移（本 PR 交付）

- [x] 1.1 `podcast-channel-locks.js`：两把按记录键的串行锁（index / channel）+ 发布防重入标记 `publishInFlight`；四条口径：缺键即抛、不同键互不阻塞、超时等待者不得执行临界区且仍推进序位、临界区抛错必须放行后来者
- [x] 1.2 `podcast-channel-registry.js`：`index.json` 读写（原子 rename + Windows 有界退避）、`ch_<16hex>` 不可变 id、create/rename/setDefault/list、`{cap,count}`、hosting 只存 `credentialRef`
- [x] 1.3 迁移 `ensureMigratedOnce()`：内容哈希三态判定、`migrationStatus: conflict|error` 持久化、`resolveMigration(keep_legacy|keep_existing)` 幂等、legacy 不删、**不改写 guid**
- [x] 1.4 服务层：`channelDir`/`channelId` 作用域化、`channel.json` 拆 `meta`/`feedSync`、`readFeedSync`/`writeFeedSync`、`episodeCap()`、`saveEpisode(…, {strict})` 预校验**合并结果**（strict 拒绝 / 非 strict 出声）
- [x] 1.5 IPC：6 条通道加必填 `channelId`、`endpoints:list` 保持无参、新增 `channel:list|create|rename|setDefault|migrate:resolve`、`episode:list` 回 `{episodes,cap,count}`、`episode:save` 透传 `strict`
- [x] 1.6 preload + 两个 bundle 重生成 + 渲染层桥 5 个新导出（字面量方法名）
- [x] 1.7 渲染层：composable 集中注入 `channelId`（`CHANNEL_SCOPED` 单点，禁止 7 处各写一份）+ `loadChannels/createChannel/renameChannel/setDefaultChannel/resolveMigration/switchChannel/refreshQuota`
- [x] 1.8 视图：频道目录区块（切换器、新建、设为默认、迁移冲突两个处置按钮、配额提示、空态）+ zh/en 成对 `podcast.picker.*` 20 键
- [x] 1.9 测试：registry 13 例、locks 9 例、service 22 例、ipc 10 例、preload 通道名 13、view 行为、单轨制结构锁；播客全域 158 例绿
- [x] 1.10 静态门禁：`check-ipc-bridge`（447 handlers / 465 preload / 0 缺口）、`check-locale-sync --pair-base/--cjk`（无新增硬编码）、`glossary.test.js`
- [ ] 1.11 QM-1 打包 + 启动 8 秒 + asar 清单 + `verify-worktree-deps`（进行中，结果写入执行记录）
- [ ] 1.12 QM-6 双模型外部评审（实现 diff）+ 逐条处置
- [ ] 1.13 QM-4 视觉：`podcast-channel` 浅/暗基线按同一次 CI run 重取并逐项归因（页面新增频道区块必然漂移）

## 2. 刀 2 托管直传接线（后续 PR）

- [ ] 2.1 凭证加密落盘（`credential-store`）+ `:save` 的 secret 缺席=保持、拒空覆写
- [ ] 2.2 `podcast:hosting:get|save|check`（check 注入 `clientImpl`，缺省零出站）
- [ ] 2.3 `podcast:feed:publish`：备份 → 覆盖上传 → 回滚入口；`backupCreated` 进结果态与横幅
- [ ] 2.4 行为锁⑦（重启后 partial 仍在）+ 结构锁⑫

## 3. 刀 3 成片一键出期 + 共用手柄（后续 PR）

- [ ] 3.1 `readDegradedFlags`（与 `ResultView.vue:648-657` 同真源同判据，判据只认 `degraded === true`）
- [ ] 3.2 `extractMix`（ffmpeg 抽全混音，失败/无音轨 fail closed，不回退旁白）+ `probe`（ffprobe 实测 duration/size/mime）
- [ ] 3.3 三处一致校验（stat == ffprobe == putObject 返回 size）+ 阻断 uploadFeed；存储侧损坏如实记为不覆盖
- [ ] 3.4 `usePodcastEpisodePublish` 状态机（相位闭集 + 逐格驱动全部结果态）+ `PodcastPublishAction.vue` 浮层 + 挂起合同登记
- [ ] 3.5 入口两枚：`ResultView.vue:726`、`CreateView.vue:4519`
- [ ] 3.6 按相位取消 + 崩溃对账提示

## 4. 刀 4 文案一键出期（后续 PR）

- [ ] 4.1 口语化分段 prompt（独立于 `rewrite-engine` 的去 AI 味链路）
- [ ] 4.2 分块 TTS 装配（块间显式静音、单任务硬超时、非法 env 回落并出声）
- [ ] 4.3 复用刀 3 手柄接入 `CopyLibraryView.vue:174`、`RewriteView.vue:812`、`Publish.vue:358`
- [ ] 4.4 存量 `mime` 一次性固化（`stockStamp` 标记），不得把存量整体打成 blocked

## 5. 刀 5 收口

- [ ] 5.1 入口判据落文档（哪些位置不放及理由：HotTopics / KeywordMonitor / PublishHistory 重发覆盖风险 / FilmEngineering 无发布挂载点）
- [ ] 5.2 PRD 提示文字逐字表由脚本从 locales 生成（禁止手工维护）
- [ ] 5.3 三处记忆同步 + `01-docs/i18n-glossary.md` 术语收口

## 明确不做

- 平台登记面（platforms.yaml / publish-capabilities / platform-definitions / rpa selectors）与 `publishMode` 第四态
- 接入 `publish:batch` / `taskQueue` / `task-queue-frequency` 日配额 / `publish:progress` 相位枚举 / 发布历史
- 自动挤出已发布单集（D-8 撤销）；跨频道音频对象去重；打包 AGPL/未明许可的本地 TTS 模型
- 逆向小宇宙私有写接口
