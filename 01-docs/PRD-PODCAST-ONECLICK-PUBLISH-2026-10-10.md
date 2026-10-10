# PRD · 播客 RSS 频道一键发布（文案/成片 → 一期 → 分发）

- 编号：PRD-PODCAST-ONECLICK-PUBLISH-2026-10-10
- 上游：`01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md`（P0 已合并 PR #3193 → `06737f999`）、`docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md`
- 设计真源：`.adversarial/podcast-oneclick-publish/proposal-v5.md`（本文与 v5 冲突时以 v5 为准，二者不得并存两说）
- 复杂度：**M+** · 必经 OpenSpec change `podcast-oneclick-publish` + QM-6 双模型外部评审
- 评审事实：5 轮跨家族对抗评审共 38 条（9/9/11/9，第 5 轮 critic 进程异常无结论）+ 外部 CCG 10 条；分数 min 轨迹 4→6→7→6；**未自称 converged**，v5 残留项的闭合改由实现期测试锁逐条钉死（§10）

---

## 1. 目标与非目标

**目标**：在所有"产出成稿"的位置，用户点一次即可把该份内容变成播客频道里的**一期**并让聚合端抓到——即一键完成「取音频 → 上传托管 → 追加/合并单集 → 重建 feed → 覆盖上传 feed」。

**非目标（本 PR 一律不做，做了即违规）**：
- 不把播客登记为第 16 个平台：`config/platforms.yaml`、`publish-capabilities.json`、`platform-definitions.js`（含四张表）、rpa-engine DOM 选择器**零改动**；`podcast-endpoints.test.js` 的「与平台契约面隔离」describe 必须持续绿。
- 不给 `publishMode` 加第四态（三态闭集回答的是"API 轨还是 DOM 轨"，RSS 是另一种通道种类）。
- 不接 `publish:batch` / `batch:create` / `taskQueue` / **`task-queue-frequency.js`（发布频率策略 v2 的日配额与紧急放行）** / `publish:progress` 相位枚举 / 发布历史。**播客一键发布不占任何平台日配额**。
- 不逆向聚合端私有写接口（违反 ToS，且无发布 API 可对接）。
- 不做跨频道音频对象去重（引用计数复杂度不值）。
- 不打包本地大模型 TTS（AGPL 的 ChatTTS、许可 NOASSERTION 的 IndexTTS 一律不进安装包）。

---

## 2. 已锁决策（用户逐条确认）

| # | 决策 | 否决掉的备选 |
|---|---|---|
| D-1 | 一键 = 端到端出一期，**音频与 feed.xml 两个对象都更新** | 只落草稿（feed 不更新则聚合端永看不到新期） |
| D-2 | **多频道**（单份 `channel.json` 改数据模型） | 单频道（多节目场景无解） |
| D-3 | 重复点击 = **原地更新同一期**（稳定 guid 命中 `saveEpisode` 合并） | 每次新建一期；弹窗问用户 |
| D-4 | 托管凭证 **全局一份 + 按频道路径前缀** | 每频道一份；全局+频道覆写 |
| D-5 | 成片取 **全混音**（ffmpeg 抽完整音轨） | 纯旁白；全混音回退旁白 |
| D-6 | 入口 = **共用手柄 + 正交执行链** | 统一交付通道抽象层；进平台勾选 |
| D-7 | 合成引擎 = **云端 TTS 适配器**（复用既有 6 家） | 打包本地模型；piper/kokoro 离线兜底（本期不做） |
| D-8 | 到 `ITEMS_MAX` **保留 `EPISODES_FULL` 报错，绝不自动挤出**；`{cap,count}` 暴露给渲染层做事前禁用 | 自动挤出最老一期（会静默下掉已发布内容） |
| D-9 | **共用手柄前置到刀 3**，刀 4 复用 | 刀 5 才收敛（入口返工 + 多走一轮像素基线） |

---

## 3. 架构：单元与边界

| 单元 | 位置 | 职责 | 注入依赖（测试零出站） |
|---|---|---|---|
| `podcast-channel-registry` | 主进程 | 多频道目录、默认频道、迁移、`{cap,count}`；持**两把锁** | `fs` |
| `podcast-hosting-service` | 主进程 | 凭证落盘、上传音频与 feed、备份与回滚 | `clientImpl` |
| `podcast-episode-assembler` | 主进程 | degraded 读取、抽混音/分块合成、拼接、ffprobe 实测、三处一致校验 | `ttsImpl`、`ffmpeg/ffprobe` |
| `usePodcastEpisodePublish` + `PodcastPublishAction.vue` | 渲染层 | 共用手柄与浮层 | `src/api/podcast-channel.js` |
| `podcast:episode:publishFromSource` | IPC | 编排上述三层，幂等 | — |

---

## 4. 数据模型（存储层）

```
<userData>/podcast/
  index.json        { version, defaultChannelId, migratedAt, migrationStatus?, stockStamp?,
                      channels:[{id,name,createdAt,updatedAt}],
                      hosting:{ provider,endpoint,bucket,pathPrefix,credentialRef } }
  channel.json      legacy（迁移后保留不删，仅作回滚依据）
  channels/<channelId>/
    channel.json    { meta:{…validateChannel 白名单逐字不变…},
                      feedSync:{ result, attemptedAt, errorCodes[], hostingSnapshot } }
    episodes.json   { version, episodes:[…] }（ITEMS_MAX 按频道计）
    feed.xml        本地构建缓存
```

**四条不可破**：
1. **`channelId` = 不可变短 id `^ch_[a-z0-9]{4,16}$`**，唯一载体是 `index.json` 的 `channels[].id`（目录名与之相等，落盘校验与对象 key 派生共用同一判据）。托管路径含 channelId ⇒ 改名会打断**已提交给 Apple/小宇宙的 feed URL**，故 `default` 只能作 UI 显示名。
2. **`feedSync` 与 `meta` 两段分离**：`saveChannel:247` 用 `Object.assign({}, channel, {createdAt,updatedAt})` 整写，若把发布状态平铺进 channel 对象，**用户改一次频道名就把发布状态抹掉**（评审 #19）。`feedSync` 仅由发布流程写。
3. **guid 作用域含 channelId**：`mpub:<channelId>:<sourceKind>:<sourceId>`，`sourceKind ∈ {project,draft,copy,rewrite,manual}`；不含 channelId 时"发到 B 频道"会搅浑 A 频道那期（合并只在单文件内发生）。播客页手工单集仍走 `crypto.randomUUID()`。
4. **迁移绝不改写既有 guid**：legacy 单集无 `guid` 值，`buildItem:238` 回退成 `audioUrl`；补写成新形态会让聚合端**把每一期认成新节目**（听众看到节目单重复一遍）。

---

## 5. 迁移（含硬失败出口）

- 落在 `ensureMigratedOnce()`，由**首个需要频道数据的调用**（读或写均可）触发；**恰好一次**靠 `index.lock` 文件锁 + `migratedAt` 双保险。
- `registerHandlers` 仍**绝不触碰 userData**（守 `ipc-handlers/podcast.js:69` 既有约束；v2 的"注册期单飞"已撤销）。
- **完整性按内容哈希三态判定**（§3 与 §8.6 同一判据，出现第二套即结构锁⑬变红）：全量一致=已完成；不一致且**来源仍完整**=静默续传；来源与目标各为不同合法内容才落 `migrationStatus:"conflict"`。复制中途 IO 失败落 `migrationStatus:"error"` + `PODCAST_MIGRATION_IO_FAILED`。
- 冲突/错误态：**只读通道保留**，写路径与一键入口 fail-closed；`podcast:channel:migrate:resolve`（`keep_legacy | keep_existing`，两分支均幂等）。
- legacy `channel.json` 与旧文件**一律不删**（R0 删除守卫 + 回滚依据）。

---

## 6. 接口契约

### 6.1 逐通道（**不是一律必填**）

| 域 | 通道 | channelId |
|---|---|---|
| 频道 | `podcast:channel:list`（返 `channels/defaultChannelId/empty/migrationStatus`）/ `:create`（只分配 id 与骨架）/ `:rename` / `:setDefault` / `:migrate:resolve` | 无参 / 各自见参数 |
| 既有 8 | `channel:get` / `episode:list` / `episode:save` / `episode:remove` / `feed:build` / `feed:verify` | **必填**，主进程不猜默认 |
| 既有 8 | `endpoints:list` | **保持无参**（分发端目录与频道无关） |
| 托管 | `podcast:hosting:get` / `:save` / `:check` | 全局 |
| 发布 | `podcast:feed:publish` / `podcast:episode:publishFromSource` | 必填 channelId |
| 事件 | `podcast:publish:progress`（`start`/`done` 双边界）；`onPodcastPublishProgress(cb)` 返回取消函数 | — |

- IPC 一律写字面量 `ipcMain.handle('podcast:…')`，**禁止** map 循环注册（`ipc-contract.test.js` 靠字面量 harvest）；注释中不得出现示例字面量（结构锁不剥注释）。
- 事件名必须新，**不得复用 `publish:progress`**（`stores/publishProgress.js` 是发布进度唯一承载）；`on…` 形态同构先例见 `preload/aggregation.js:38-39`；改 preload ⇒ 重打 `index.bundle.js` 并过 `check-ipc-bridge.js`。

### 6.2 错误体契约

```
{ code, message, issues?: [{ code, path, message }] }
```
`PODCAST_FEED_INVALID` **必须透传** `err.issues`（`podcast-rss.js:273` 已挂载，`path` 形如 `episodes[3].audioUrl`）。现 `toIpcError:55-62` 只回 `{code,message}` 且白名单无此码 ⇒ 落 `REQUEST_ERROR` 丢 issues，**刀 1 必须扩白名单并同步 preload**。

### 6.3 托管 `:save` 的分区合并

`secret` **缺席 = 保持不变**（先从 `credential-store` 取旧值回填再 `validateHosting`）；仅显式 clear 动作才覆写；落盘层**拒绝以空 secret 静默覆写已有 secret**（`validateHosting:65-67` 要求 AK/SK 非空，`:get` 永不回显 secret）。

---

## 7. 功能逻辑（按刀次）

### 刀 1 多频道 + 迁移 + 锁 + 契约
registry（index.json + 两段 channel.json）、迁移三态、`withPodcastIndexLock()` / `withPodcastChannelLock(channelId)` 收口 `episodes.json` **全部写者**（一键 + 手工增删）、`{cap,count}` 透出、8→6 通道加必填 channelId、`toIpcError` 透传 issues、播客页频道切换器与迁移横幅。

### 刀 2 托管直传接线
凭证加密落盘（`credential-store`，`index.json` 只存 `credentialRef`）→ `podcast:hosting:*` → `putObject`（`podcast-hosting-upload.js:201-226`，返回 `{status,size}`）→ `podcast:feed:publish` 覆盖上传 **feed.xml**（含本地 `feed.prev.xml` + OSS 时间戳副本）→ 页面入口与【回滚上一版 feed】。独立价值：手工加的单集也能一键托管出去。

### 刀 3 成片一键出期（含共用手柄）
1. `readDegradedFlags`：从项目持久化数据读 `segments[].audioMeta.degraded`（与 `ResultView.vue:648-657` **同真源同判据**，判据只认 `degraded === true`，**不得**拿 `source` 字符串当第二判据）；命中即 `PODCAST_AUDIO_DEGRADED_SOURCE`，**不上传**。
2. `extractMix`：ffmpeg 从成片抽**完整音轨**；无音轨/抽取失败 → fail closed 指名原因，**不回退旁白**。
3. `probe`：ffprobe 实测 `durationSec` / `sizeBytes` / 容器 → 显式写 `mime`（不得依赖 `buildItem:237` 的 URL 猜测）。
4. `uploadAudio`：用发布开始时锁定的 **hosting 快照**（全程不二次读配置）。
5. **三处一致校验**：`fs.stat` 字节 == ffprobe `sizeBytes` == `putObject` 返回 `size`；不等即 `PODCAST_AUDIO_MEASURE_FAILED` 并**阻断 `uploadFeed`**。存储侧损坏在默认零出站路径**不覆盖**（如实记欠账，不得声称已闭合）。
6. `attach`：**预校验打在合并结果上**（读 `list[index]` → 按 `saveEpisode:285` 同一合并语义 merge → `validateEpisode(merged)`），不合规整次拒绝不落盘；再走 guid 幂等合并。
7. `buildFeed` + `uploadFeed`（feed 本身已在 `engineBuildFeed:269` 前置 `validateFeed`，不过即抛码列表并透传 issues）。

### 刀 4 文案一键出期
口语化分段（**新建 prompt，不复用 `rewrite-engine` 的去 AI 味链路**——语义不同）→ 分块云端 TTS（每块 ≤ 引擎上限，块间显式静音 0.3–0.6s，禁止整篇喂）→ 拼接 → 归一 → `probe`/`uploadAudio`/`attach`/`buildFeed`/`uploadFeed` 同刀 3。**只换数据源与触发条件，不得改手柄状态机**（结构锁⑪）。音色默认值属**频道级**（未配置时回退全局默认音色并提示）。

### 刀 5 入口收敛
刀 3 已建好的 `<PodcastPublishAction>` 挂到 `CopyLibraryView.vue:174`、`RewriteView.vue:812`、`Publish.vue:358`（采集页仅文本类分支）。**不放**：`HotTopics`、`KeywordMonitor`、`PublishHistory:764`（重发会带同 guid 原地覆盖正在播那期）、`Home`/`FirstRun`（裸跳转无内容）、`FilmEngineering`（本页无发布挂载点）。

---

## 8. 状态机、交互逻辑、显示项

**相位闭集（结构锁⑪：变更必须与 §5.2 矩阵逐格测试同 PR，且断言规模下界）**：
`pickChannel → extractMix → probe → uploadAudio → attach → buildFeed → uploadFeed`，外加 `cancelled`。

**交互**：
- 入口收在各页既有"发布"动作的**次级项** ⇒ 默认态不改一个像素（否则 6 页 × 浅/暗 = 12 张基线漂移）。
- 浮层为应用级模态 ⇒ 必须经 `useEmbeddedViewSuspension` 挂起/恢复内嵌视图，并在 `overlay-view-suspension.test.js` 登记 owner；释放必须穷尽（`watch(visible)` false 分支 + `onBeforeUnmount` 兜底）。
- **取消按相位**：`uploadAudio` 之前任一相位可取消（零出站零计费）；之后不可取消并明示原因；关闭浮层**不**取消（浮层内明示）。
- `{cap,count}` 与迁移状态**每次发布动作发起前现算**，禁止跨动作缓存（行为锁⑦）。
- 崩溃/退出中断：启动时以 `feedSync.attemptedAt` 与 episodes 现状对账，**只提示不自动修复**。

**显示项**：频道切换器（名称 + `ch_` 短 id）、迁移状态横幅（conflict/error 各一句 + 处置按钮）、每期 `compliance` 徽标（手工路径保存后即时校验，只出声不阻断）、`feedSync` 横幅（partial = 「公网 feed 未同步」+【只重试上传 feed】）、`backupCreated:false` 时标注「本次未建立回滚点」、hosted feed 公网地址标注「已提交地址，改路径会使订阅失效」、`cap` 计数与事前禁用。

---

## 9. 数据校验（三层）

| 层 | 判据 | 备注 |
|---|---|---|
| 输入 | `validateChannel` / `validateEpisode`（白名单逐字不变，作用域限 `meta` 段）；`validateHosting` **直接复用** `podcast-hosting-upload.js:47`，禁止第二份 | 手工路径新增**保存后即时校验**（只出声不阻断） |
| 落盘 | registry 写前校验 `channelId` 形态与目录存在性；一键路径**预校验合并结果**（§7 刀 3 步骤 6） | 只校验传入对象会被合并语义放过旧脏字段（#24） |
| 出站 | `validateFeed` 前置于 `uploadFeed`（引擎 `buildFeed:269` 已内含）；不过即阻断，公网 feed 永不变脏 | `EPISODE_SIZE_REQUIRED`（`sizeBytes` 非空正整数）与时长整数判据在此层兜住 `length="NaN"` |

新增错误码（zh/en 成对 + 术语进 `i18n-glossary.md`）：`PODCAST_MIGRATION_IO_FAILED`、`EPISODE_MIME_UNDETERMINED`（`audioMimeFromUrl` 未命中改返回 `null`，默认回退仅留给存量一次性固化）、`PODCAST_AUDIO_DEGRADED_SOURCE`、`PODCAST_AUDIO_MEASURE_FAILED`、`PODCAST_CHANNEL_BUSY`、`PODCAST_INDEX_BUSY`、`PODCAST_CHANNEL_ID_INVALID`、`PODCAST_HOSTING_PREFIX_UNSAFE`（`pathPrefix` 不得空/不得以 `/` 开头/不得含 `..`）。

---

## 10. 测试策略（含反证）

- **行为锁**：① partial 不报成功；② 摘 degraded 判定必红；③ 锁超时排队者不得补写；④ `validateFeed` 不过则 `uploadFeed` 一次都不被调用；⑤ `durationSec` 不得来自常量或 LLM 估计；⑥ **改名不得抹掉 `feedSync`**；⑦ **重启后 partial 横幅仍在** + 删除一期不刷新列表不得解除禁用；⑧ **旧脏字段 + 新合法对象 → 合并产物非法时不落盘**；⑨ **`issues[]` 逐条到达渲染层**（非仅错误码出现过）。每条配"把锁本身改成 no-op 必须立刻变红"的变异反证。
- **结构锁**：字面量注册、`envelope` thunk 负向、浮层 owner 登记、`channelId` 传递链单一实现、`validateHosting` 单一实现、⑩ 发布期内不二次读 hosting、⑪ 相位枚举与矩阵测试同 PR、⑫ `toIpcError` 白名单含 `PODCAST_FEED_INVALID` 且透传、⑬ 迁移判据唯一。
- **单元**：registry 真实 fs（`os.tmpdir()` 隔离）；assembler 注入假 tts/ffmpeg/ffprobe；hosting 注入假 client；guid 派生表含跨频道不撞车负例；迁移含**从非空 legacy 出发** + 幂等重跑 + 三态 + 硬失败。
- **视觉 QM-4**：新浮层用例浅 + 暗各一张，**必须同时登记 `views/all-views.visual.test.js` 的 `viewTests` 与 `scripts/run-pixel-tests.js` 的 `pixelTests`（:10-55）**，通过证据 = CI 日志该用例名出现次数 > 0；首跑必红 → 同一次 run 的 `quality-gate-visual-reports` artifact 回填并逐张 SHA-256 自证；未触碰视图 0 px；不动 `PIXEL_THRESHOLD`、不加 mask、`KNOWN_DYNAMIC` 保持空。
- **QM-1**：改 `electron/` ⇒ 完整打包 + 启动 8 秒 + asar 清单 + `verify-worktree-deps.js`；`Access is denied` 先按命令行定位本 worktree 遗留进程逐个 kill（前后 `Get-Process electron` 计数必须相等）。
- **不出站**：`clientImpl` / `ttsImpl` / `headImpl` 一律注入且缺省跳过；`network-egress-guard` 全仓化，真实出站即红。

---

## 11. 降级矩阵（每格一句具体的话）

| 场景 | 结果态 | 文案要点 |
|---|---|---|
| 无凭证/凭证不完整 | `blocked` | 指名「未配置对象存储托管」+ 跳转托管配置 |
| provider=cos | `blocked` | 沿用 `PODCAST_HOSTING_PROVIDER_UNSUPPORTED` 原文 |
| 无音轨/抽取失败 | `failed` | 指名"成片无音轨"还是"ffmpeg 失败"，不回退旁白 |
| degraded 旁白 | `failed` | 「检测到静音占位旁白，已阻止上传」 |
| TTS 超时/超预算 | `retryable` | 「本轮合成未完成，这一期仍是草稿，不会出现在 feed 中」 |
| OSS 403/签名失败 | `retryable` | 只给错误码与计数，**日志禁记 AK/secret** |
| `validateFeed` 不过 | `blocked` | 逐条列出「第 N 期 · 字段 · 码」并给跳转 |
| 与本内容无关的历史坏集 | `blocked` | 「该频道有 N 期不符合规范，导致本期无法发布」并列出是哪些期 |
| feed 上传失败 | `partial` | 「已挂到本地频道，公网 feed 尚未更新」+【只重试上传 feed】；永不进成功分桶 |
| 两对象均已落 OSS | `success` | 「feed 已更新，聚合端下次抓取后生效（通常数小时至数天）」——**不得写"已即时生效"** |
| `uploadAudio` 前取消 | `cancelled` | 回滚临时文件，零出站 |
| `uploadAudio` 后要求中止 | `not-cancellable` | 明示不可中止 |
| 关闭浮层/切走页面 | 无新终态 | 「关闭不会取消本次发布」 |
| 崩溃/退出中断 | `reconcile` | 「上次发布疑似中断（第 N 期状态未知）」只提示 |
| 已达 `ITEMS_MAX` | `blocked` | 「已达上限 {cap} 期，请先删除」（不挤出） |
| 同频道已有发布在跑 | `busy` | `PODCAST_CHANNEL_BUSY`「该频道有一次发布正在进行，请等它结束」——立即拒绝不排队 |
| 备份失败 | `success` + 标注 | `backupCreated:false` → 「本次未建立回滚点」（不阻断但必须可见） |

**并发与锁**：`episodes.json` 全部写者共用 `withPodcastChannelLock(channelId)`；`index.json` 用 `withPodcastIndexLock()`；两把锁均 try-acquire，顺序 index → channel，channel 取不到**立即释放 index** 再拒绝，**两个持有期不得重叠**；`index.lock`（迁移文件锁）与运行时内存锁是两套机制、不得跨持。防重入靠 `publishInFlight` 进程内标记（try-acquire / `finally` 必清 / 崩溃随进程消失），**不是长持锁**，且不挡手工写路径。临界区抛错必须放行后来者；超时排队者不得补写。

---

## 12. 安全

- 长期 AK：界面与文档明示建议使用**仅覆盖该 bucket `PutObject` 的 RAM 子账号最小权限**；STS 形态规则层已支持（`:15-17`），长期 AK 可用但标注风险。
- `credential-store` 存 secret，`index.json` 只存 `credentialRef`；`:get` 永不回显；日志禁记 AK/secret/Cookie 值，只记计数与码。
- 路径：`pathPrefix` 判据防跨频道逃逸（§9）；对象 key 由 `deriveObjectKey:104` 单点派生。
- feed 覆盖：备份 + 回滚入口 + `backupCreated` 可见。

---

## 13. 未闭合（诚实记录，不是遗漏）

1. **第 5 轮对抗评审无有效结论**（critic 进程异常）⇒ v5 里 9 条残留项未经独立复核，闭合责任改由 §10 的测试锁承担；实现期每条都必须有指名用例。
2. 存储侧字节损坏在默认零出站路径**不覆盖**（归入注入才跑的巡检）。
3. 口语化分段的改写边界、TTS 计费二次确认、`podcast:transcript` 是否本期做 —— 属刀 4 前的开放项。
4. 外链单集的 `sizeBytes` 是**用户申报值**，界面措辞不得与一键路径共用"实测"二字。
5. P2 代托管、逆向聚合端接口：永久排除。
