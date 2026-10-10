{
  "schemaVersion": 1,
  "round": 1,
  "proposer": "claude",
  "responses": [
    {
      "issueId": 1,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "a3c808c6c0a1ec01",
      "modification": "§3 改为：迁移为 legacy 频道分配一个合规且不可变的 ch_<16hex>（与手工建频道同一生成器），目录名 = 该 channelId；`default` 只允许作为 UI 显示名，绝不进 id、目录名或对象 key。channelId 的唯一载体是 index.json 的 channels[].id，落盘层写前校验与对象 key 派生共用同一判据（禁止第二份）。",
      "persuade": "下一轮请核对 v2 的 §3/§6 是否已无 `channels/default/` 残留，且 id 载体只有一处定义。"
    },
    {
      "issueId": 2,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "89aac29c09535ff8",
      "modification": "§5 数据流新增前置步骤 readDegradedFlags：一键管线在主进程从项目持久化数据读 segment.audioMeta.degraded 集合，与渲染层 ResultView.vue:648-657 的 degradedAssetKinds 复用同一真源与同一判据（禁止在渲染层另立判据、也禁止主进程重抄一份）；任一 degraded 即 fail closed，错误码 PODCAST_AUDIO_DEGRADED_SOURCE。明确渲染层那条提示只是显示、不构成防线。配套行为锁 + 变异反证（摘掉读取即红）。",
      "persuade": "请核对 v2 是否给出主进程可消费的 degraded 读取路径与锁，而非停留在\"上传前检查\"的措辞。"
    },
    {
      "issueId": 3,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "a8d9cbe94dd48761",
      "modification": "新增第二把锁：withPodcastIndexLock()（全局单键）串行化 index.json 的 hosting 与 defaultChannelId 读改写；withPodcastChannelLock(channelId) 只管 episodes.json。规定唯一加锁顺序（先 index 后 channel，禁止反向，禁止持 index 锁时再等 channel 锁的另一条路径）并把该顺序写成结构锁；两把键各自的等待语义均为\"已被持则立即 PODCAST_CHANNEL_BUSY / PODCAST_INDEX_BUSY\"。",
      "persuade": "请核对 v2 是否显式写出锁序与死锁规避，而不是只加一把全局锁（那会把跨频道并行吃掉）。"
    },
    {
      "issueId": 4,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "a36980b677cba6a0",
      "modification": "§4 撤回\"8 通道一律必填 channelId\"，改为逐通道判：podcast:endpoints:list 保持无参（频道无关的分发端目录，ipc-handlers/podcast.js:142 → listPodcastEndpoints）；channel:get/episode:list/episode:save/episode:remove/feed:build/feed:verify 必填 channelId；channel:save 与 channel:create 切分职责（create 只分配 id 与骨架、save 只改元信息且不得改 id）。空频道引导环解法：registry 在构造期完成迁移并保证至少一个频道存在，渲染层空态只经 channel:list 的 empty 出口，不允许 channel:get 承担\"首次建频道\"。",
      "persuade": "请核对 v2 的接口表是否逐通道标注，且 endpoints:list 不再出现在必填清单里。"
    },
    {
      "issueId": 5,
      "decision": "partially_accepted",
      "evidenceLevel": "L2",
      "evidence": "接受\"适用范围必须限定\"，拒绝\"把刀 2 手工外链单集也纳入 ffprobe 实测\"。依据：validateEpisode 已在 packages/shared-utils/src/podcast-rss.js:153-159 强校验 durationSec 为 1~上限整数、sizeBytes 存在且为正整数（EPISODE_SIZE_REQUIRED），外链单集已有形态校验；而外链音频的真实字节数由第三方服务器决定，本机唯一核对途径是 HEAD 探测， podcast-channel-service.js:120 的 _headImpl 缺省为 null（缺省不注入、零出站是 ADR/PRD 既定约束），把 HEAD 拉进默认路径会同时破坏\"缺省不注入\"与\"测试不出站\"两条既有锁。",
      "fingerprint": "99437d1ab04da64b",
      "modification": "不变量 4 改写为：仅约束**一键产出**的音频对象（实测字节 == ffprobe sizeBytes == putObject 实际发送字节，三处一致才允许 uploadFeed）；手工外链单集沿用既有 validateEpisode 语义不变。存储侧损坏如实记为默认路径不覆盖，归入注入才跑的可选巡检，不得声称已闭合。",
      "persuade": "如你认为\"外链也必须有实测防线\"，请给出一条不引入真实出站、且不违反缺省不注入的机制；否则请撤回该子项。"
    },
    {
      "issueId": 6,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "e5d1afaca230b2db",
      "modification": "按用户决定 D-8 撤销\"挤出最老一期 + confirm\"整条承诺（原稿与 saveEpisode 的 EPISODES_FULL 抛错语义矛盾，且静默下掉已发布内容比报错更严重）。改为：episode:list/channel:list 返回 {cap, count}，到上限时一键入口事前禁用并显示「已达上限 N 期，请先删除」；服务端仍保留 EPISODES_FULL 作为 fail-closed 兜底，两者判据同源（都取 ITEMS_MAX 同一导出，禁止第二份 1000）。",
      "persuade": "请核对 v2 的降级矩阵已无\"挤出\"行、且 cap 暴露通道与兜底码同源。"
    },
    {
      "issueId": 7,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "2307734942991a9d",
      "modification": "按用户决定 D-9 把共用手柄组件与浮层前置到刀 3（先只挂成片两入口），刀 4 直接复用，避免入口二次改造与第二个像素基线周期；§2.3 的\"每刀独立可交付\"表述改为\"每刀交付一个用户可用动作，刀 3 含入口基建\"，并如实写明刀 3 仍前置依赖刀 2。",
      "persuade": "请核对 v2 刀次表已无\"刀 5 才建手柄\"的排法。"
    },
    {
      "issueId": 8,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "30d15bdb8d525bab",
      "modification": "§7 补一条：新增浮层用例必须**同时**登记 apps/desktop/tests/visual-testing/scripts/run-pixel-tests.js 的 pixelTests（:10-55，既有 podcast-channel 已在 :55）与 views/all-views.visual.test.js 的 viewTests，通过证据是 CI 日志中该用例名出现次数 > 0；只登记前者等于没跑。",
      "persuade": "请核对 v2 是否点名第二份清单文件与行号范围。"
    },
    {
      "issueId": 9,
      "decision": "accepted",
      "evidenceLevel": null,
      "evidence": null,
      "fingerprint": "07a70b5ee0684943",
      "modification": "安全两处补齐：① 托管配置界面与文档明示建议使用仅覆盖该 bucket PutObject 的 RAM 子账号最小权限策略，并写明规则层已支持 STS 形态（podcast-hosting-upload.js:15-17：给出 securityToken 时改走注入的引擎 uploader），长期 AK 属可用但需在界面标注风险；② uploadFeed 前把上一版本复制为本地 feed.prev.xml，并在 OSS 侧留一份带时间戳副本（注入 clientImpl，失败仅记日志不阻断），提供【回滚上一版 feed】入口——写坏公网 feed 会即刻对所有订阅者生效，该回滚不是可选项。",
      "persuade": "请核对 v2 是否把 feed 回滚写成必经的落地对象，而非\"建议\"。"
    }
  ]
}
