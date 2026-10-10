# 设计：播客 RSS 频道接入一键发布

完整设计真源：`01-docs/DESIGN-PODCAST-ONECLICK-PUBLISH-2026-10-10.md`（本 change 的 design 视图）与 `.adversarial/podcast-oneclick-publish/proposal-v5.md`（含 5 轮对抗评审的逐条处置）。本文只登记**不可从代码推出的决策与理由**，避免与上述两份形成第三处真源。

## 已锁决策（用户逐条确认，2026-10-10）

| # | 决策 | 为什么不是另一个选项 |
|---|---|---|
| D-1 | 一键 = 端到端出一期，**音频对象与 feed.xml 两个对象都更新** | 只更新音频不更新 feed ⇒ 聚合端下次抓取仍看不到新期，用户会以为功能坏了；Apple/小宇宙均无逐期上传 API（Apple 官方口径：提交 RSS 地址 + 手动刷新抓取） |
| D-2 | 多频道 | 单频道下"这一期进哪个频道"无解；P0 的 `channel.json` 是单份 |
| D-3 | 重复点 = 原地更新同一期 | 每次新建 ⇒ 同稿堆重复节目；弹窗 ⇒ 一键变两击且 4 处入口重复实现 |
| D-4 | 全局一份托管凭证 + 按频道路径前缀 | 每频道一份 ⇒ 凭证管理面翻倍；全局+覆写 ⇒ 两套解析优先级 |
| D-5 | 成片取全混音 | 播客一期要含 BGM/音效才像节目；**显式不回退旁白**：回退会把"听感不一致"变成静默行为 |
| D-6 | 共用手柄 + 正交执行链 | 统一"交付通道"抽象层先行、易被误用为平台也走这层；进平台勾选违反 ADR-0008 且被 `rpa-view-manager` 的 `mode != 'dom-only'` 静默归入 API 轨 |
| D-7 | 云端 TTS 适配器 | ChatTTS=AGPL-3.0、IndexTTS 许可 NOASSERTION ⇒ 不可进闭源分发包；本地大模型体积与 GPU 现实不允许 |
| D-8 | 达上限保留 `EPISODES_FULL` 报错，**绝不自动挤出** | 静默把已发布一期从公网 feed 摘掉 = 听众丢节目，比报错严重；且与 `saveEpisode:296` 现语义矛盾 |
| D-9 | 共用手柄前置到刀 3 | 刀 5 才收敛 ⇒ 刀 3/4 先写临时入口再返工，并多走一轮像素基线周期 |

## 关键取舍与踩过的坑（评审纠正过，防重演）

1. **落盘层原本零校验**：`saveEpisode` 只判对象形态与上限，单集校验实际发生在 `engineBuildFeed → validateFeed → validateEpisodeList`。后果是一条坏单集会**卡死整个频道**的发布（列表级校验），且与 D-3 幂等叠加后重试永远失败。修法：一键路径预校验打在**合并结果**上（`strict`），手工路径保存后即时校验**只出声不阻断**（保留"先登记本地文件"的既有合法中间态）。
2. **`channel.json` 必须两段分离**：`saveChannel` 是整写，把 `feedSync` 平铺进去会让"改一次频道名"抹掉发布状态（partial 横幅重启即失忆）。
3. **两把锁 + 一个进程内标记**：`index.json` 是跨频道全局态，按 channelId 加键盖不住它；但把锁长持到整场发布会把用户手工编辑一起锁在门外 ⇒ 写点用短临界区串行，防重入用 `publishInFlight`。**同键不可重入**：迁移必须收在 index 锁外，否则自死锁（实测被自己的用例抓到）。
4. **迁移不改写 guid**：补写新形态会让聚合端把每期认成新节目，听众看到节目单重复。
5. **`channelId` 用不可变 `ch_*`**：托管路径含它，改它等于改掉已提交给 Apple 的 feed URL；`default` 只能作显示名。
6. **不变量"实测三处一致"只约束一键产出**：外链单集没有本地文件可探测，且 HEAD 读回会破坏"缺省不注入 headImpl / 测试零出站"两条既有锁；存储侧损坏如实记为默认路径不覆盖。
7. **对抗评审自身也会引入缺陷**：v4 因"§8.6 宣称已改某节、该节实文未改"使 consistency 从 7 掉到 6；此后每版都跑"宣称 vs 实文"探针。

## 进程与状态

`podcast:publish:progress` 是**新事件名**（`start`/`done` 双边界），绝不并入 `stores/publishProgress.js`；preload 暴露 `onPodcastPublishProgress(cb)` 并返回取消函数，composable 在 `onBeforeUnmount` 注销。浮层为应用级模态 ⇒ 必须经 `useEmbeddedViewSuspension` 挂起内嵌视图并登记 owner。
