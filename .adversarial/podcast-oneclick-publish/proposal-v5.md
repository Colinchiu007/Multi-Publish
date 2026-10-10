# 设计 v5 · 播客 RSS 频道接入一键发布

> **优先级声明（防 #27 型「两处各自成为真源」）**：v5 起实现以本文 **§3/§4/§5/§6/§7/§8.6** 为规范真源（**§4 已纳入清单**，修 #30/#32）。§8.5 与 §8.6 之外的历史章节只作处置记录；凡规范承诺只写在 §8.6 而正文没有的，一律视为**未落实**——第 4 轮 #23/#25/#28/#30/#31/#32/#33 全部属这一类。
> 状态：第 1-4 轮对抗评审 **29 + 9 = 38 条**（逐轮 9 / 9 / 11 / 9，修 #34 的计数错误）+ 外部 CCG 10 条已处置；第 5 轮为最后一轮收口（`maxRounds=5`）。
> 状态：第 1-3 轮对抗评审 28 条 + 外部 CCG 10 条已处置；第 4 轮为「只判是否闭合、不开新面」的收口轮（`maxRounds` 经用户同意 3→5，偏差记入 `task.json`）。

- 日期：2026-10-10
- 状态：**v3（第 1 轮 9 条全部被独立复核后撤回；第 2 轮 codex 新出 9 条已全部处置）**；配对产物：`proposal-v1/v2/v3`、`critique-v1/v2`、`rebuttal-v1/v2`
- 评审配置偏差：critic 第 1 轮 opencode、第 2 轮起改 codex（原会话连续两次在最终动作前被自动压缩、无产物），`proposer=anthropic ↔ critic=openai` 仍跨家族；详见 `task.json` 的 `attempts`
- 上游：`01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md`、`docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md`、openspec change `podcast-rss-channel`（已归档，PR #3193 → `06737f999`）
- 复杂度：**M+**（跨主进程/IPC/preload/渲染层/存储层 4 层以上，含不可逆数据迁移）→ 必经 OpenSpec change + QM-6 双模型外部评审
- 本文只定"设计与契约"，不含实现；实现刀次见 §2.3

---

## 0. 问题陈述：不是"每个入口都加一个按钮"

### 0.1 现状事实（全部经代码取证，非推断）

| 事实 | 证据 |
|---|---|
| 真正执行发布的 IPC 只有 2 条主通道 | `electron/ipc-handlers/publish.js:248` `publish:batch`（→ `:298-307` 逐 target `taskQueue.add`）、`electron/services/batch-manager.js:562` `batch:create`；`CloudPublish.vue:215` 走独立引擎 |
| 其余 11 处是"造内容 → 跳 `/publish` 预填"，不是执行体 | `Collection.vue:1459/1503/1507/2143/2161/2212/2270`、`RewriteView.vue:812-820`、`HotTopics.vue:85/563/675/677`、`CopyLibraryView.vue:174`、`CreateView.vue:4519`、`ResultView.vue:726`、`PublishHistory.vue:764/769`、`Home.vue:7/67/78/134`、`CreateHistory.vue:50`、`FirstRun.vue:115` |
| 发布 payload **没有内容种类字段**，靠形状侧写 | `usePublishFlow.js:204-245 buildArticleData()` 无 `contentType`；`publish.js:305` 以 `video_path` 有值判视频；`publish-helpers.js:42-52 summarizeArticle` 只认 title/video/cover/accountId/tags |
| 品类枚举与能力注册表均无 audio 位 | `stores/platforms.js:40-45` 仅 `VIDEO/IMAGE_TEXT/MIXED`；`publish-capabilities.json:23-90` 语义键含 `video`/`images`，`audio` 0 命中 |
| 成片项目目录内**已有旁白音频** | `story2video-project-service.js:920-921` 落 `narration.m4a`；`ResultView.vue:153` 已消费 `audioPath` |
| 旁白存在 **degraded（静音占位）态** | `ResultView.vue:652` `segment?.audioMeta?.degraded === true → kinds.add('silent_narration')` |
| TTS 能力已具备但只为视频旁白服务 | `services/ai-generator.js:19/22` 映射 `tts|audio → 'synthesize'`；6 家适配器 `adapters/{openai,minimax,doubao,google,mimo,elevenlabs}-tts.js` 统一返回 `{audio: Buffer, format}`；`tts-voice:*` 4 通道只做音色目录/克隆，**不合成** |
| `podcast-repurpose-stages.js` 方向是**音频 → 视频**，不产出音频 | `:3` 注释、`:96` 入参 `params.audio`、`:106` ffprobe 探时长、`:204-212` ffmpeg 切 `.m4a` |
| 托管直传**只有规则层** | `podcast-hosting-upload.js:31` `HOSTING_PROVIDERS=['oss']`（cos 占位并如实拒绝 `:56`）、`:15` 用户自带长期 AK、`:47 validateHosting`；无凭证落盘/IPC/上传调用/入口 |
| 播客侧已支持按 guid 幂等原地合并 | `podcast-channel-service.js:280-281` 先按 id 再按 guid 命中即原地更新；`:296` `ITEMS_MAX` 上限；`:301` 新 id 走 `crypto.randomUUID()` |
| 单集白名单**无来源回链字段** | `podcast-rss.js:142-167` 白名单无 `sourceContentId`；`saveEpisode` 用 `Object.assign` 不过滤未知键 ⇒ 私有字段"可存不可见"，`buildItem` 永不输出 |

### 0.2 判据：三条同时成立，该位置才该有入口

① 产出是**成稿**（有标题 + 可连续读完的正文），非选题/碎片/统计；② 该位置**已经或能够**获得一个音频形态；③ 用户在此的意图是**交付这份内容**，不是"重跑上次那次交付"。

| 位置 | 结论 | 依据 |
|---|---|---|
| `ResultView.vue:726`、`CreateView.vue:4519`（成片） | ✅ 最该放且最便宜 | 音轨已在盘，零 TTS |
| `CopyLibraryView.vue:174`（文案库） | ✅ 放 | 成稿 + 交付意图最强 |
| `RewriteView.vue:812`（AI 改写） | ✅ 放 | 同上，`rewriteHistoryId` 回链先例可仿 |
| `Publish.vue:358/1152`（页内 AI 写作、标题助手） | ✅ 放 | 本就在执行页 |
| `Collection.vue`（文本类采集） | ⚠️ 有条件放 | `:1740/1907` 产 `mediaType:'video'` 的转载视频分支不放 |
| `FilmEngineeringView.vue` / `FilmCanvasView.vue` | ⚠️ 本期不放 | 两页发布挂载点 0 命中，先补既有交付动词是另一件事 |
| `HotTopics.vue`、`KeywordMonitorView` | ❌ 不放 | ①②不成立，合成一期必产垃圾单集 |
| `PublishHistory.vue:764`（重发） | ❌ 不放（**危险**） | ③不成立；重发带同 guid ⇒ `:280` 原地合并 = "重发"静默覆盖正在播那期 |
| `Home.vue` / `CreateHistory.vue:50` / `FirstRun.vue:115` | ❌ 不放 | 裸跳转无内容 |

### 0.3 开源参照（2026-10-10 `gh api` 实测 star 与 license）

| 段 | 参照 | ★ / License | 采纳什么 |
|---|---|---|---|
| 文稿化 | `souzatharsis/podcastfy` | 6,590 / Apache-2.0 | 先转带说话人标签的 transcript，再逐句分派 voice |
| 文案→音频 | `DrewThomasson/ebook2audiobook` | 20,320 | **禁止整篇喂 TTS**：按句段切块逐块合成再拼接；块间显式静音（`[break]` 0.3–0.6s / `[pause]` 1.0–1.6s）；中间产物放独立 process 目录 |
| | `santinic/audiblez` / `denizsafak/abogen` | 8,717 / 6,099 | abogen 产同步字幕 ⇒ 未来对应 `podcast:transcript` |
| 引擎选型 | `QwenAudio/CosyVoice` 23,910 / **Apache-2.0**；`SWivid/F5-TTS` 15,366 / MIT；`rhasspy/piper` 11,298 / MIT；`hexgrad/kokoro` 9,236 / Apache-2.0；`k2-fsa/sherpa-onnx` 15,196 / Apache-2.0 | | 许可干净、CPU 可行的本地兜底候选（本期不引入） |
| 引擎否决 | `2noise/ChatTTS` 39,894 / **AGPL-3.0**；`index-tts/index-tts` 24,397 / **NOASSERTION**；`RVC-Boss/GPT-SoVITS` 62,614（需训练） | | AGPL 对分发桌面应用是开源义务；同族门禁见 AGENTS.md「GPL 媒体二进制发布约束」 |
| feed 生成 | `advplyr/audiobookshelf` 14,602（唯一高 star 的自托管播客 RSS 生成）；`podcast rss generator` 类全部 **0–20★** | | 无高 star 先例 ⇒ 本仓 `podcast-rss.js` 已是最完整一份，继续自持 |
| 分发 | Apple 官方：提交新节目 = 交 RSS 地址；刷新靠手动触发抓取；视频播客同样走 RSS | | **无逐期发布 API** ⇒ "一键发布到播客"的唯一正确语义 = 一键更新「音频对象 + feed 对象」 |

---

## 1. 七条已锁决策（用户逐条确认，2026-10-10）

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D-1 | 一键动作 = **端到端出一期**：合成/抽取音频 → 直传托管 → 追加单集 → 重建 feed → **覆盖上传 feed.xml** | 否决"只落草稿再统一生成"：不满足"一键"直觉，且 feed 不上传则聚合端永远看不到新期 |
| D-2 | **多频道**（P0 的单份 `channel.json` 必须改数据模型） | 用户场景是多个播客节目；单频道下"这一期进哪个频道"无解 |
| D-3 | 重复点击 = **原地更新同一期**（稳定 guid ⇒ `saveEpisode:280-281` 现有幂等路径） | 否决"每次新建一期"（同稿堆出重复节目）与"弹窗问用户"（一键变两击且需在 4 个入口重复实现） |
| D-4 | 托管凭证 **全局一份 + 按频道路径前缀** `{pathPrefix}/{channelId}/…` | 否决"每频道一份完整配置"（凭证管理面翻倍）与"全局默认 + 频道可覆写"（两套解析优先级、测试面翻倍） |
| D-5 | 成片取 **全混音**（ffmpeg 从成片抽完整音轨，含 BGM/音效） | 显式否决"全混音回退旁白"：回退会把"一期听感不一致"变成静默行为；抽取失败一律 fail closed |
| D-6 | 入口形态 = **共用手柄 + 正交执行链** | 否决"先建统一交付通道抽象层"（抽象先行、改动面大、易被误用为平台也走这层）；**明确否决"进 Publish 页平台勾选"**——见 §1.1 |
| D-7 | 合成引擎 = **云端适配器**（复用既有 6 家 TTS，走模型供应商体系） | 否决打包本地大模型（体积与 GPU 现实）；否决引入 AGPL/自定义许可模型；本地 piper/kokoro 作未来离线兜底候选，本期不做 |
| D-8 | 到 `ITEMS_MAX` 上限时**保留 `EPISODES_FULL` 报错，不自动挤出任何一期**；`{cap, count}` 暴露给渲染层做事前禁用 | 撤销 v1 原稿的"自动挤出最老一期 + confirm 预告"：它既与 `saveEpisode` 现语义（`podcast-channel-service.js:296` 抛错、从不挤出）矛盾，又会**静默把已发布的一期从公网 feed 摘掉**，听众丢节目比报错严重得多 |
| D-9 | **共用手柄与浮层前置到刀 3**（先只挂成片两入口），刀 4 复用 | 否决 v1 的"刀 5 才收敛"：那会让刀 3/刀 4 先写临时入口再返工，并多走一轮像素基线周期（对抗评审 #7 命中） |

### 1.1 为什么"进平台勾选"必须否决（评审时不得重开这条）

1. 违反已锁定 ADR-0008 与 D2/D3：`publishMode` 三态闭集回答的是"走 API 轨还是 DOM 轨、失败是否回退"，RSS 属另一种**通道种类**（范畴错误）。
2. 机械后果一：误配的 `rss` 会被 `rpa-view-manager.js` 的 `mode != 'dom-only'` 判据**静默归入 API 轨**，不报错。
3. 机械后果二：`podcast-endpoints.test.js` 的「与平台契约面隔离」describe 会当场红（分发端 id 出现在任一平台表中即红）——这条锁本身就是架构不变量的回归保护。
4. 语义后果："追加一期"被塞进 `publish:progress` 的成功/失败/取消终态与发布历史。**播客没有"发布失败"，只有"这期还没进 feed"**。

---

## 2. 架构

### 2.1 五个新单元

| 单元 | 位置 | 职责 | 注入依赖（测试零出站） |
|---|---|---|---|
| `podcast-channel-registry` | 主进程 | 多频道目录、默认频道、存量迁移、单集归属；**两把锁**：`withPodcastIndexLock()`（index.json 全局单键）+ `withPodcastChannelLock(channelId)`（episodes.json 按频道键） | `fs` |
| `podcast-hosting-service` | 主进程 | 凭证落盘（走 `credential-store`）、上传音频与 feed 两个对象、回公网 URL | `clientImpl` |
| `podcast-episode-assembler` | 主进程 | 稿/成片 → 一期音频：分块合成、块间静音、拼接、ffprobe 实测、degraded 判定 | `ttsImpl`、`ffmpeg/ffprobe` |
| `usePodcastEpisodePublish` + `PodcastPublishAction.vue` | 渲染层 | 共用手柄与状态机 | `src/api/podcast-channel.js` |
| `podcast:episode:publishFromSource` | IPC | 幂等主通道，编排上三层 | — |

### 2.2 硬边界（一条都不越）

不碰 `publish:batch`、`batch:create`、`taskQueue`、**`packages/shared-utils/src/task-queue-frequency.js`（发布频率策略 v2 的日配额/紧急放行，PR #3260 刚合并）**、`publish:progress` 相位枚举、`publish-capabilities.json`、`platform-definitions.js`、`publishMode`。播客一键发布不占任何平台日配额，因为它不是平台发布——此边界必须写进 PRD，防未来被"顺手接进频控"。

### 2.3 刀次（每刀独立可交付）

1. **刀 1** 多频道数据模型 + 迁移（`ensureMigratedOnce`，首个需要频道数据的调用触发）+ 默认频道 + **逐通道**加必填 `channelId`（见 §4 表）+ `{cap, count}` 暴露（主进程 + 播客页频道切换器）
2. **刀 2** P1 托管直传接线：凭证落盘、`podcast:hosting:*`、`podcast:feed:publish`、页面入口（独立价值：手工加的单集也能一键托管）
3. **刀 3** 成片一键出期（`ResultView` / `CreateView`）+ **共用手柄与浮层在本刀建成**：读 degraded 真源 → 抽全混音 → 三处一致校验 → 上传 → 挂期 → 重建并**带备份地**上传 feed。本刀前置依赖刀 2（如实声明，不再假装可独立交付）
4. **刀 4** 文案一键出期（`CopyLibrary` / `Rewrite` / `Publish` 内写作）：口语化分段 + 分块云端 TTS + 装配
5. **刀 5** 刀 4 的三处入口复用刀 3 已建好的共用手柄（不再新建组件）+ 文档/门禁/记忆收口

---

## 3. 数据模型与迁移

```
<userData>/podcast/
  index.json                      { version, defaultChannelId, migratedAt,
                                    channels:[{id,name,createdAt,updatedAt}],
                                    hosting:{provider,endpoint,bucket,pathPrefix,credentialRef} }
  channels/<channelId>/channel.json    `validateChannel` 白名单逐字不变（作用域限定在 meta 段）；发布同步元数据**另立一段**：
                                       channel.json = { meta:{…白名单字段}, feedSync:{ result, attemptedAt, errorCodes[], hostingSnapshot } }
                                       —— 拆两段正是为了堵 #19：`saveChannel:247` 以 `Object.assign({}, channel, {createdAt,updatedAt})` 整写，
                                       若把 feedSync 平铺进 channel 对象，用户改一次频道名就会把发布状态整抹掉
  channels/<channelId>/episodes.json   沿用 saveEpisode 语义（ITEMS_MAX 按频道计）
  channels/<channelId>/feed.xml        本地构建缓存 + lastFeedPublicUrl + lastFeedPublishedAt
```

- 凭证**不进** `index.json` 明文：`accessKeySecret` 走 `credential-store`（AES-256-GCM），`index.json` 只存 `credentialRef` 与非敏感字段。
- **`channelId` 是不可变短 id `^ch_[a-z0-9]{4,16}$`，绝不用频道名**：托管路径含 channelId，改名会打断**已提交给 Apple/小宇宙的 feed URL**（对外不可逆承诺）。
- **`guid` 作用域含 channelId**：`mpub:<channelId>:<sourceKind>:<sourceId>`，`sourceKind ∈ {project,draft,copy,rewrite,manual}`；播客页手工加的单集仍走 `crypto.randomUUID()`。代价（用户已接受）：跨频道同内容 ⇒ 两条单集、两份音频对象；**不做跨频道对象去重**（YAGNI，且会把"删一期"变成引用计数问题）。
- **迁移落在 `ensureMigratedOnce()`，由首个需要频道数据的调用触发（读或写均可），双保险恰好一次**（`index.lock` 文件锁 + `migratedAt`）。**v2 的"注册期单飞"已撤销**：它与 `ipc-handlers/podcast.js:69`「服务实例惰性解析：注册动作本身不得触碰 userData 目录（测试环境同样走这条注册路径）」不可同真，第 2 轮 #13 命中。
- **迁移冲突不得以随机异常出现在读路径**：冲突时持久化 `migrationStatus: "conflict"`，读路径正常返回该状态（界面渲染横幅 + 定位到冲突项），写路径与一键入口 fail-closed；未 resolve 前不得静默选一份。`registerHandlers` 仍绝不触碰 userData。
- **legacy 频道分配的 id 必须合规**：`ch_<16hex>`，与手工建频道同一生成器；目录名 = 该 channelId。`default` **只能作 UI 显示名**，绝不进 id、目录名或对象 key（v1 写 `channels/default/` 与 `^ch_[a-z0-9]{4,16}$` 自相矛盾，会被自己的写前校验拒绝——两轮评审同时命中）。
- **迁移不改写任何既有 guid**（新增不变量）：legacy 单集本无 `guid` 值，`buildItem:238` 回退成 `audioUrl`；一旦迁移时补成 `mpub:<channelId>:…`，聚合端会把每一期**认成新节目**，听众看到整个节目单重复一遍。迁移只搬文件、不动 `episodes.json` 里的任何字段值。
- **冲突态有出口（判据与 §8.6 #23 一字同源，修 #31）**：迁移完整性按**内容哈希三态**判定——全量一致 = 已完成；不一致且**来源仍完整** = 静默续传；来源与目标**各为不同合法内容**才落持久化 `migrationStatus:"conflict"`。复制中途 IO 失败落 `migrationStatus:"error"`（`PODCAST_MIGRATION_IO_FAILED`）。**删除 v4 那句"内容不同 ⇒ conflict"的二值判据**：半复制目标内容必然不同，按旧句会被误判成 conflict，正是要修的行为。冲突/错误态下只读通道保留，写路径与一键入口 fail-closed；提供 `podcast:channel:migrate:resolve`（`keep_legacy | keep_existing`，两分支均幂等）。legacy 文件始终不删（回滚依据，符合 R0）。
- `getChannel` 等全部改 `(channelId, …)` 签名；默认值由渲染层选中态决定，**主进程不猜**。

---

## 4. 接口契约

**错误体契约（补 #25/#30：v4 只在 §8.6 宣称、正文无载）**：所有播客 IPC 的失败返回统一为 `{ code, message, issues?: [{ code, path, message }] }`。其中 `PODCAST_FEED_INVALID` **必须**透传 `err.issues`（`podcast-rss.js:273` 已挂载，`path` 形如 `episodes[3].audioUrl`，由 `validateEpisode(raw, idx)` 的 `at()` 产生）；`toIpcError`（`ipc-handlers/podcast.js:55-62`）现仅回 `{code, message}` 且白名单不含该码 ⇒ 落入 `REQUEST_ERROR` 丢弃 issues，**刀 1 必须扩白名单并同步 preload 包裹层**。验收见 §7 行为锁⑨。


| 域 | 通道 | 刀次 |
|---|---|---|
| 频道 | `podcast:channel:list`（返回 `channels / defaultChannelId / empty / migrationStatus`）/ `:create`（只分配 id 与骨架）/ `:rename` / `:setDefault` / `:migrate:resolve` | 1 |
| 既有 8（**逐通道判，不是一律**） | 必填 `channelId`：`channel:get` / `episode:list` / `episode:save` / `episode:remove` / `feed:build` / `feed:verify`；**保持无参**：`endpoints:list`（分发端目录与频道无关，`ipc-handlers/podcast.js:142 → listPodcastEndpoints()`） | 1 |
| 托管 | `podcast:hosting:get`（永不回显 secret，只回 masked + `configured`）/ `:save` / `:check`（注入 `clientImpl`） | 2 |
| 发布 | `podcast:feed:publish`（含上一版备份）/ `podcast:episode:publishFromSource`；`channel:save` 与 `channel:create` 职责切分：create 只分配 id 与骨架、save 只改元信息**且不得改 id** | 2/3/4 |
| 事件 | `podcast:onPublishProgress(cb)` 返回取消函数（同构先例 `preload/aggregation.js:38-39` 的 `ipcRenderer.on` + `removeListener` 成对）；composable 必须在 `onBeforeUnmount` 注销；改 preload ⇒ 重打 `index.bundle.js` 并过 `check-ipc-bridge.js` | 3/4 |
| 进度 | **新事件名 `podcast:publish:progress`** | 3/4 |

- IPC 一律写字面量 `ipcMain.handle('podcast:…')`，**禁止**收成 map 循环注册：`ipc-contract.test.js` 靠字符串字面量 harvest，间接注册会让新通道从契约面静默隐身。注释中**不得出现示例字面量**（本仓有过结构锁不剥注释、把注释示例读成真实注册的事故）。
- 渲染层新导出仍逐个写字面量方法名（`src/api/podcast-channel.js` 头部注释已锁该形态），调用必须包成 thunk 交给 `envelope`（`invokeNamespace` 非 async，权限错误在参数求值期同步抛出）。
- 进度事件必须满足**双边界**：`start` 在检测/执行体之前发、`done` 在完成时发；慢任务不得让遮罩钉死在第一阶段。
- **两处本仓门禁会当场打红，先写进设计**：
  1. 浮层挂起合同：一键发布的浮层若是应用级模态，必须经 `src/composables/useEmbeddedViewSuspension.js` 挂起/恢复内嵌视图，并在 `src/overlay-view-suspension.test.js` 登记 owner（`WebContentsView` 是原生图层，CSS z-index 无效）。
  2. 像素面：入口默认**收进各页既有"发布"动作的次级项**，点击后才在浮层内出现播客频道区 ⇒ 默认态不改一个像素。否则 6 个页面浅色 + 暗色共 12 张基线全部漂移。

---

## 5. 数据流与失败语义

```
pickChannel → extractMix(ffmpeg 抽全混音) → probe(ffprobe 实测 durationSec/sizeBytes/mime)
→ uploadAudio(OSS) → saveEpisode(幂等合并 by guid) → buildFeed + validateFeed
→ uploadFeed(覆盖 {prefix}/{channelId}/feed.xml)
```

### 5.1 五条不变量

1. **"成功"只有一种：两个对象都已落地。** 音频成功但 feed 上传失败 ⇒ 状态 `partial`，界面显示"这一期已挂到本地频道，公网 feed 尚未更新"并提供【只重试上传 feed】，**不得**报成功。
2. **degraded / 无音轨一律 fail closed，且判据必须在主进程可消费**：数据流新增前置步骤 `readDegradedFlags` 从项目持久化数据读 `segment.audioMeta.degraded` 集合，与渲染层 `ResultView.vue:648-657` 的 `degradedAssetKinds` **复用同一真源与同一判据**（禁止主进程重抄一份、也禁止只靠渲染层那条提示——它只是显示，不构成防线，v1 正是漏了这点）。任一 degraded ⇒ `PODCAST_AUDIO_DEGRADED_SOURCE`；成片无音轨/ffmpeg 抽取失败 ⇒ 指名具体原因，**不回退纯旁白**（D-5）。
3. **写者全覆盖的串行**（v1 只圈了"两次一键"，漏了手工增删与 index.json，两轮评审同时命中）：
   - `withPodcastChannelLock(channelId)` 覆盖 **`episodes.json` 的所有写者**——一键发布、播客页手工增删、迁移，全部经服务层同一收口点（`saveEpisode:275` / `removeEpisode:316` 都是 `listEpisodes→改→_writeJson` 的 read-modify-write，内部原本无锁）。
   - `withPodcastIndexLock()` 覆盖 `index.json` 的 `hosting` 与 `defaultChannelId` 读改写——它是**跨频道全局共享状态**，按 channelId 加键根本盖不住。
   - **锁序（可机械断言，v2 原句自相矛盾，第 2 轮 #10 命中）**：两把锁均为 try-acquire，固定顺序 index → channel；channel try-acquire 失败必须**立即释放 index** 再整体拒绝。需要同时用到两侧时唯一合法形态是「持 index 读 hosting 快照 → **释放 index** → 持 channel 写 episodes」，即**两个持有期不得重叠**。结构锁断言源码中不存在"已持 channel 锁再取 index 锁"的调用序列。
   - `index.lock`（迁移用的跨进程文件锁）与 `withPodcastIndexLock()`（运行时内存串行）**是两套机制**，关系写死：迁移只在 `ensureMigratedOnce()` 内持文件锁完成，运行时锁不得跨迁移持有。
   - 等待语义是**已被持则立即拒绝**（`PODCAST_CHANNEL_BUSY` / `PODCAST_INDEX_BUSY`），**不得**沿用 `account-state-lock.js:41-48` 的 30s 默认等待与「登录态写入等待超时」文案——发布临界区含 ffmpeg 与 `PUT_TIMEOUT_MS=120000`（`podcast-hosting-upload.js:36`），分钟级预算会把它误报成登录态超时。
   - 仍保留两条：超时的排队者不得执行其临界区；临界区抛错必须放行后来者。
4. **"实测三处一致"只约束一键产出的音频对象**（v1 写成全局不变量，与刀 2 手工外链单集自相矛盾——对抗评审 #5 命中）：一键路径必须 `fs.stat` 字节 == ffprobe `sizeBytes` == `putObject` 实际发送字节，不等即 `PODCAST_AUDIO_MEASURE_FAILED` 并**阻断 `uploadFeed`**；`mime` 必须显式取 ffprobe 容器，**不得依赖 `buildItem:236` 的 `audioMimeFromUrl(url)` 按 URL 猜**。手工外链单集沿用既有 `validateEpisode`（`EPISODE_SIZE_REQUIRED` / 时长整数，`podcast-rss.js:153-159`），不强加"实测"。ffmpeg 参数受 `media-tools-lock.json` 门禁约束。存储侧损坏（对象落库后被改）在默认零出站路径**不覆盖**，如实记为欠账、归入注入才跑的可选巡检，不得声称已闭合。
5. **写 `index.json` / `feed.xml` 保持临时文件 + 原子 rename 语义**；Windows 只对 `EPERM/EACCES/EBUSY` 短退避重试，超预算原样抛错。

### 5.2 降级矩阵（每格一句具体的话，不得合并成"发布失败请重试"）

| 场景 | 结果态 | 文案要点 |
|---|---|---|
| 无凭证 / 凭证不完整 | `blocked` | 「未配置对象存储托管」+ 跳转托管配置 |
| provider=cos | `blocked` | 沿用 `PODCAST_HOSTING_PROVIDER_UNSUPPORTED` 原文 |
| 无音轨 / 抽取失败 | `failed` | 指名是"成片无音轨"还是"ffmpeg 失败"，不回退旁白 |
| degraded 旁白 | `failed` | 「检测到静音占位旁白，已阻止上传」 |
| TTS 超时/超预算 | `retryable` | 「本轮合成未完成，这一期仍是草稿，不会出现在 feed 中」；单任务硬超时（env 可覆盖，非法值回落默认并出声告警） |
| OSS 403/签名失败 | `retryable` | 只给错误码与计数，**日志禁记 AK/secret** |
| `validateFeed` 不过 | `blocked` | 本地已挂期、公网 feed 未动，逐条列 issue |
| feed 上传失败 | `partial` | 「这一期已挂到本地频道，公网 feed 尚未更新」+【只重试上传 feed】；**`partial` 永不进"已发布/成功"分桶**；状态持久化在 `channel.json` 的 `feedSync:{result, attemptedAt, errorCodes[]}`（#19：不平铺进 channel 对象，否则改名即抹掉），**重启后横幅仍在**（#11） |
| 用户在 `uploadAudio` **之前**的任一相位（`pickChannel/extractMix/probe`）主动取消 | `cancelled` | 允许取消：零出站、零计费对象，回滚临时文件即可（#22：一刀切禁取消的理由只适用于上传之后） |
| 用户在 `uploadAudio` **之后**要求中止 | `not-cancellable` | 明示「音频已上传，本期不可中止，将按正常终态落盘」——半途取消会让对象归属不可判定 |
| 用户关闭浮层 / 切走页面（未点取消） | 无新终态 | 任务照常跑完并按持久化终态落盘，浮层内明示「关闭不会取消本次发布」；相位枚举 `pickChannel\|extractMix\|probe\|uploadAudio\|attach\|buildFeed\|uploadFeed\|cancelled` 为闭集并加规模下界断言 |
| 应用退出 / 崩溃于发布中途 | `reconcile` | 启动时对账：以 `feedSync.attemptedAt` 与 episodes 现状比对，如实提示「上次发布疑似中断（第 N 期状态未知）」——**只提示，不自动修复**（#22） |
| 两对象均已落 OSS | **`success`** | 「feed 已更新，聚合端下次抓取后生效（通常数小时至数天）」——**不得写"已即时生效"**（聚合端有缓存） |
| 已达 `ITEMS_MAX` | `blocked` | 事前禁用 + 「已达上限 {cap} 期，请先删除」（D-8）；服务端 `EPISODES_FULL` 兜底，判据同源。`{cap, count}` **每次发布动作发起前现算，禁止跨动作缓存**（第 2 轮 #17） |
| 列表中存在与本内容无关的历史非法单集 | `blocked` | 「该频道有 N 期不符合规范，导致本期无法发布，请先修正它们」并逐条列出是哪几期（第 2 轮自查 M-3：`validateEpisodeList` 校验全量列表，一条坏集会卡死整频道，不得让新内容背锅） |
| 同频道已有发布在跑 | `busy` | `PODCAST_CHANNEL_BUSY`：「该频道有一次发布正在进行，请等它结束」——立即拒绝而非排队到超时 |

### 5.3 两处用户可见后果必须显式预告

- ~~`ITEMS_MAX` 挤出最老一期~~ **已撤销**（D-8）：改为达上限事前禁用 + 报错，绝不静默下掉已发布的一期。
- 孤儿对象：`partial` 且用户放弃重试时，OSS 上会留一个无引用的音频对象。处置放在**删除单集**路径（默认关闭、显式可选、失败仅记日志），**不在 partial 分支删**——用户可能正要重试，删了即打断重试；残余孤儿由 OSS 前缀生命周期策略兜（运维文档一条），应用内不做引用计数（D-4 已 YAGNI 否决去重）。
- 覆盖更新一期 ⇒ 聚合端缓存导致听众短时仍见旧音频。文案**不得**写"已即时生效"，只写"feed 已更新，聚合端下次抓取后生效（通常数小时至数天）"。

---

## 6. 校验与错误码

`channelId` 的**唯一载体是 `index.json` 的 `channels[].id`**（目录名与之相等，落盘层校验与对象 key 派生共用同一判据）；`channel.json` 的 `validateChannel` 白名单**逐字不变**，不新增 `id` 字段（v1 未写明归属，被评审判为歧义）。

三层校验位：输入层（`validateChannel` / `validateEpisode` 白名单逐字不变，`validateHosting` **直接复用** `podcast-hosting-upload.js:47`，禁止第二份）→ 落盘层（registry 写前校验 channelId 形态与目录存在性）→ 出站层（`validateFeed` 前置于 uploadFeed，**校验不过绝不上传**，公网 feed 永不变脏）。

| 字段 | 判据 | 拒绝码 |
|---|---|---|
| `channelId` | `^ch_[a-z0-9]{4,16}$`，不可变 | `PODCAST_CHANNEL_ID_INVALID` |
| `hosting.endpoint` | `^https://oss-[a-z0-9-]+\.aliyuncs\.com$` 形态 | `PODCAST_HOSTING_ENDPOINT_INVALID` |
| `hosting.pathPrefix` | 不得为空、不得以 `/` 开头、不得含 `..`（防跨频道路径逃逸） | `PODCAST_HOSTING_PREFIX_UNSAFE` |
| 音频 | mime ∈ {`audio/mpeg`,`audio/mp4`} 且与 ffprobe 实测容器一致 | `PODCAST_AUDIO_FORMAT_MISMATCH` |
| 时长/大小 | ffprobe 实测；`durationSec ≥ 1`；`sizeBytes` 与真实字节一致 | `PODCAST_AUDIO_MEASURE_FAILED` |
| guid | 含 channelId 作用域，跨频道不撞 | `PODCAST_GUID_SCOPE_INVALID` |

每个 `PODCAST_*` 码必须有 zh/en 成对文案；PRD 逐字抄录，并**从 `locales/{zh,en}.js` 脚本生成全量对照表**（不得手工维护——先例：135 条里曾有 89 条在 PRD 查不到逐字值）。新增用户可见文案必须成对进 locales（Gate 7），且术语必须进 `01-docs/i18n-glossary.md` **并被 UI 实际采用**（`src/i18n/glossary.test.js` L3 术语锁，`check-locale-sync --pair-base` 判不到它）。

---

## 6.1 v5 新增错误码（补 #23/#29 的 §6 落点，此前只在 §8.6 宣称）

| 码 | 判据 | 出现层 |
|---|---|---|
| `PODCAST_MIGRATION_IO_FAILED` | `ensureMigratedOnce()` 复制中途 IO 失败 → 落 `migrationStatus:"error"`，只读通道保留、写路径 fail-closed | registry |
| `EPISODE_MIME_UNDETERMINED` | `audioMimeFromUrl` 未命中扩展名返回 `null`（现实现 `podcast-rss.js:228` 的默认回退会把猜测当事实），`buildItem:237` 遇 `null` 出声 | 引擎（仅对新增/编辑动作生效） |
| `PODCAST_AUDIO_DEGRADED_SOURCE` | 源项目 `segments[].audioMeta.degraded === true`（与 `ResultView.vue:648-657` 同判据同真源） | assembler |

每个新码必须有 zh/en 成对文案并排进**刀 1** 的 locales 任务，术语同步 `01-docs/i18n-glossary.md`（`src/i18n/glossary.test.js` L3 会判术语成对，`--pair-base` 判不到）。

## 7. 测试策略与反证

| 层 | 内容 |
|---|---|
| 单元 | registry 用真实 fs（`os.tmpdir()` 隔离，禁止固定仓库内路径）；assembler 注入假 tts/ffmpeg/ffprobe；hosting 注入假 client；guid 派生表（含跨频道不撞车负例）；迁移：幂等重跑 + **从非空 legacy 出发** + 冲突不猜 |
| 契约 | `ipc-contract.test.js` 双向对账（既有 8 改签名 + 新增 7 通道）；`ipc-exposure-contract` 从调用点抽首参字面量与 preload 暴露面比 |
| 结构锁 | 字面量注册锁；`envelope` thunk 形态负向锁（沿用）；浮层 owner 登记锁；`channelId` 传递链单一实现锁；`validateHosting` 单一实现锁；**⑩ 发布临界区内不存在第二次 hosting 配置读取**（#21/#33）；**⑪ 手柄状态机相位枚举闭集变更必须与 §5.2 矩阵逐格测试同 PR**（#14/#28/#32）；**⑫ `toIpcError` 白名单必须含 `PODCAST_FEED_INVALID` 且透传 issues**（#25）；**⑬ 迁移判据只有一处**：§3 与 §8.6 #23 必须同源，出现第二套 conflict 判据即红（#31） |
| 行为锁（各配一次"把锁本身改成 no-op 必须立刻变红"的变异反证） | ① feed 上传失败报 `partial` 而非成功；② 摘掉 degraded 判定必红；③ 锁超时的迟到排队者不得补写；④ `validateFeed` 不过时 uploadFeed 一次都不能被调用；⑤ `durationSec` 不得来自常量或 LLM 估计；**⑥ 改名不得抹掉发布状态**（先发布到 partial，再 `channel:save` 只改 name，断言 `feedSync` 仍在 → 钉 #19）；**⑦ 重启后 partial 横幅仍在**（重建服务实例 → 钉 #11/#19）；**⑧ 旧脏字段 + 新合法对象 → 合并产物仍非法时不得落盘**（钉 #24，预校验必须打在合并结果上）；**⑨ `issues[]` 逐条到达渲染层**（不是只断言错误码出现过 → 钉 #25） |
| 视觉 QM-4 | 新增浮层用例浅色 + 暗色（首跑必红 → 同一次 run 的 `quality-gate-visual-reports` artifact 回填，逐张 SHA-256 自证）；**必须同时登记两份清单**——`views/all-views.visual.test.js` 的 `viewTests` 与 `scripts/run-pixel-tests.js` 的 `pixelTests`（:10-55，既有 `podcast-channel` 在 :55），**只登记前者等于没跑**，通过证据是 CI 日志中该用例名出现次数 > 0；未触碰视图必须 0 px；漂移按「本 PR / 上游传染」两类分别记账；不动 `PIXEL_THRESHOLD`、不加 mask、`KNOWN_DYNAMIC` 保持空 |
| QM-1 | 改 `electron/` ⇒ 完整打包 + 启动 8 秒 + asar 清单 + `verify-worktree-deps.js`；`Access is denied` 先按命令行定位本 worktree 遗留进程逐个 kill（前后 `Get-Process electron` 计数必须相等），禁递归删产物 |
| 全量回归 | 由 CI 代跑；本地跑法必须与该包自己的 runner 一致（先例：`node --test test/*.test.js` 造出 35 条假红） |
| 测试不出站 | `clientImpl` / `ttsImpl` 一律注入；`podcast:hosting:check` 缺省跳过真实探测（与 `podcast:feed:verify` 的 `headImpl` 同口径）；`network-egress-guard` 全仓化，真实出站即红 |

---

## 8. 评审与门禁排期

| 节点 | 评审 | 对象 | 产物 |
|---|---|---|---|
| 本文完成 | `adversarial-review-loop`（跨家族对抗循环） | 本设计全文 | `.adversarial/<name>/{proposal-v1.md,critique-v1.md,adjudication.json,family-snapshot.json}`（沿用本仓既有四件配对形态） |
| 本文完成 | `/plan-eng-review` → `/plan-design-review` → `/plan-devex-review` → `/cso` | 架构+迁移 / 新浮层+像素面 / IPC 契约面 / OSS 凭证与出站 | `.quality-gates.md` |
| PRD + openspec change 写完 | 差异审计（对已归档 `podcast-rss-channel` 数据模型） | 规格一致性 | `openspec/changes/podcast-oneclick-publish/` |
| **每刀最后一个代码提交之后** | QM-6 CCG 双模型：`codeagent-wrapper --backend claude`（逻辑/安全/规格）+ `--backend opencode`（模式/可维护性）并行审 `git diff origin/main...HEAD` | 实现 diff | `.quality-gates.md` 双模型 PASS + 发现项/修复项逐条 |

已知纪律（本会话实测踩过，写进排期防重演）：`sh scripts/deep-review.sh` 只读 HEAD 的 `.ccg/reviews/<sha>.json`，docs/test-only 提交不生成记录却 rc=0 看似跑过 ⇒ 评审必须排在最后一个**代码**提交之后或显式 `--sha`；`resume` 必须带 `--backend`；后端模型 5–15 分钟属正常，不得用 `timeout` 掐、不得用 `… | tail` 当 rc；高危域争议项不允许自扮演豁免（`.adversarial/*/adjudication.json` 的 `highRiskNote` 已明示）。

---

## 9.5 安全补强（对抗评审 #9，第 1 轮接受）

- **托管凭证**：界面与文档明示建议使用**仅覆盖该 bucket `PutObject` 的 RAM 子账号最小权限**策略；规则层已支持 STS 形态（`podcast-hosting-upload.js:15-17`：用户给出 `securityToken` 时改走注入的引擎 uploader），长期 AK 可用但界面须标注风险面；`:get` 永不回显 secret（只回 masked + `configured`），`:save` 的 secret **缺席 = 保持不变**（先从 store 取旧值回填再校验），仅显式 clear 动作才覆写，落盘层**拒绝以空 secret 静默覆写已有 secret**。
- **公网 feed 覆盖必须有回滚，且「有没有保险」必须可见**：`uploadFeed` 前把上一版复制为本地 `feed.prev.xml`，并在 OSS 侧留一份带时间戳副本（注入 `clientImpl`）。**备份失败不阻断主流程，但 `backupCreated:false` 必须进结果态与横幅**，界面标注「本次未建立回滚点」——不得写成"仅记日志"（#27：v3 的 §9.5 与 §8.5 #18 同文冲突，此处为唯一口径）。提供【回滚上一版 feed】入口；写坏公网 feed 会即刻对所有订阅者生效，故回滚点是必经落地对象。

## 8.5 v3 折入：第 2 轮评审 + 出方自查（逐条可验收）

| 编号 | 来源 | 落点与验收 |
|---|---|---|
| #11 | codex round2 Critical | `channel.json` 的 `feedSync:{result,attemptedAt,errorCodes[]}`（字段形态以 §3 与 §8.6 #19 为准）；`episode:list`/`channel:list` 透出；横幅按持久态渲染；锁⑦：重启后 `partial` 仍在 |
| #12 | codex round2 | 不支持取消 + 相位闭集与规模下界断言 |
| #13 | codex round2 | 迁移触发点改 `ensureMigratedOnce`，冲突持久化不抛错；守 `ipc-handlers/podcast.js:69` |
| #14 | codex round2 | 刀 3 手柄必须实现全部结果态并逐格驱动（注入假装配器）；刀 4 不得改状态机，结构锁守 |
| #15 | codex round2 | 混合 feed：手工项按申报值透传、措辞用「申报」；`audioMimeFromUrl` 无法判定即输出 issue（`podcast-rss.js:237`）；混合夹具 |
| #16 | codex round2 | 显式否定 rebuttal-v1 #4「保证至少一个频道存在」；空库走 `empty` → 引导 `channel:create`；设计文档为唯一真源 |
| #17 | codex round2 | 现算 `{cap,count}` 禁用态，禁止跨动作缓存；契约注释 + 行为锁 |
| #18 | codex round2 | `backupCreated` 进结果态与横幅，false 时标注「本次未建立回滚点」，维持不阻断但必须可见 |
| M-1 | 出方自查 | 一键路径 `saveEpisode` **之前**调引擎 `validateEpisode`，不过即不落盘（禁止第二份判据）；反证：摘掉预校验必红 |
| M-2 | 出方自查 | `PODCAST_FEED_INVALID` 必须把带序号的 `issues[]`（第 N 期·字段·码）透出渲染层并给跳转；不得只报错码列表 |
| M-3 | 出方自查 | 历史坏集导致的阻断必须如实归因；夹具须预置「一条合法新集 + 一条历史坏集」，断言归因指向坏集 |
| #10 | codex round2 | 锁序改为 try-acquire + 持有期不重叠，结构锁按函数作用域配对检查（详见 §5.1.3） |

取证细节与行号见同目录 `evidence-v3-selfcheck.md`（落盘层零校验 → 频道级连带失效）与 `evidence-v2-addendum.md`（不变量 4 落地链、degraded 持久化真源）。

## 8.6 v4 闭合：第 3 轮 11 条（同名编号以本节为唯一口径）

| id | 缺陷 | v4 闭合机制（可验收） |
|---|---|---|
| #19 | `saveChannel:247` 整写会抹掉发布状态 | `channel.json` 拆 `{meta, feedSync}`；`saveChannel` 只可改 `meta`，`feedSync` 仅发布流程写。验收=行为锁⑥⑦ |
| #20 | busy 检测机制未定义，短临界区下防重入形同虚设 | **两把锁保持短临界区（只圈写点），防重入另立机制**：`publishInFlight` 进程内标记（键 = channelId），入口 try-acquire、`finally` 必清、崩溃随进程消失（由 §5.2 `reconcile` 行接管）；它**不是**长持锁。手工写路径不受该标记阻挡（不把用户锁在页面外）。验收：并发第二次调用必须拿到 `PODCAST_CHANNEL_BUSY` 且装配器一次都没被调用 |
| #21 | hosting 快照与使用之间的窗口 | 发布开始即把 `{endpoint,bucket,pathPrefix,credentialRef,snapshotHash}` 作为**同一份快照**写入 `feedSync.hostingSnapshot`，全程只用它；重试入口显式沿用上次快照，配置已变时提示「hosting 配置已变更，本次重试仍用上次配置」。结构锁：发布期间不得二次读取 hosting 配置 |
| #22 | 取消语义一刀切、缺进程中断行 | 见 §5.2 四行：`uploadAudio` 前可取消（零出站零计费）／之后不可取消且明示原因／关闭浮层不取消／崩溃由启动对账提示（只提示不自动修复） |
| #23 | 迁移只定义 conflict，硬失败无出口 | 完整性按**内容哈希**判定：全量一致=已完成；不一致且来源仍完整=静默续传；来源与目标各为不同合法内容才落 `conflict`。新增持久化 `migrationStatus:"error"`（复制中途失败）与错误码 `PODCAST_MIGRATION_IO_FAILED` 进 §6；只读通道保留、写路径与一键入口 fail-closed |
| #24 | M-1 校验传入对象、落盘合并结果，旧脏字段存活 | **预校验打在合并结果上**：读 `list[index]` → 按 `saveEpisode:285` **同一合并语义** merge → 再 `validateEpisode(merged)`；不合规整次拒绝不落盘。合并实现必须复用同一函数，禁止在播客侧抄一份 assign 顺序。验收=行为锁⑧ |
| #25 | `toIpcError:55-62` 只回 `{code,message}`，`issues[]` 被丢弃 | §4 契约表补错误体 `{code, message, issues[]}`；`toIpcError` 白名单扩 `PODCAST_FEED_INVALID` 并透传 `err.issues`（`podcast-rss.js:273` 已挂载）；preload 包裹层同步透传。验收=行为锁⑨ |
| #26 | 手工路径仍零校验，连带失效发生源未消除；存量数据会因 #15 变 blocked | 手工路径加**保存后即时校验**：落盘后立刻 `validateEpisode(stored)`，不过则**只出声不阻断**（保留既有"先登记本地文件"中间态语义），`episode:list` 返每期 `compliance` 供徽标。**存量过渡只有一条路径**（修 #26/#34：删除"或列明不合规期"分支）——一次性按 `:228` 旧默认回退值把 `mime` **固化进存量记录**，完成标记写 `index.json` 的 `stockStamp: {at, touched}`；`EPISODE_MIME_UNDETERMINED` 只对新写入生效，避免把存量整体打成 blocked |
| #27 | §9.5 与 §8.5 #18 同文冲突 | §9.5 已就地改写为唯一口径（不阻断但必须可见），删除"仅记日志"；本节前有优先级声明，杜绝两说 |
| #28 | §7 未纳入 §8.5 承诺的锁 | 行为锁 ⑥⑦⑧⑨ 已并入 §7 同一张表；手柄状态机与矩阵同 PR 的结构锁见 §8.5 #14、`{cap,count}` 现算见 §8.5 #17，验收入口不再分两处 |
| #29 | `audioMimeFromUrl` 从不返回「无法判定」 | 判据形态写实：未命中扩展名时返回 `null`（现实现 `podcast-rss.js:228` 默认回退 `audio/mpeg`，会把猜测当事实），`buildItem:237` 遇 `null` 输出 `EPISODE_MIME_UNDETERMINED`；默认回退仅保留给存量数据的一次性提示路径 |

> M-1/M-2/M-3（出方自查：落盘层零校验 → 一条坏单集卡死整频道）与 **#24/#25/#26** 是同一根因的三个面，v4 由后三者收口，不再单列。

## 9. 未决项（诚实列出，评审请重点打这里）

1. **口语化分段的边界**：把书面稿转成可播的口语稿，允许改写到什么程度？`rewrite-engine` 的去 AI 味链路**不得**复用为同一条（语义不同）。未定：是否需要"逐字播报模式"作为选项。
2. **TTS 计费预算归谁**：一键发布消耗用户模型额度，是否需要点击前显示预估字符数/费用并二次确认。
3. **音色选择的归属**：频道级默认音色还是全局一份？（多频道下不同节目大概率不同主讲音色。）
4. **feed 公网 URL 的稳定承诺**：`{pathPrefix}/{channelId}/feed.xml` 一旦提交给聚合端就不可改路径——是否在 UI 上把该 URL 标为"已提交地址，改动会导致订阅失效"。
5. **是否输出 `podcast:transcript`**：文字稿是本项目强项，一期带字幕/文字稿是 Podcasting 2.0 域；本期是否做。
6. **刀 3 与刀 4 的先后**：当前按"最便宜先做"排为 3→4，但刀 3 依赖刀 2（托管），意味着首期用户可见价值要等三刀完成。是否存在可先行的、只依赖刀 1 的中间价值（例如"多频道 + 只挂外链单集"）。
