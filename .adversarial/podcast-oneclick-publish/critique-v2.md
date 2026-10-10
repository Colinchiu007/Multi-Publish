{
  "schemaVersion": 1,
  "round": 2,
  "critic": "codex",
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 7,
    "security": 8
  },
  "issues": [
    {
      "id": 10,
      "target": "proposal §5.1.3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "加锁顺序条款自相矛盾：原文「唯一加锁顺序：先 index 后 channel，禁止反向，禁止持 index 锁再去等另一把 channel 锁」——「先 index 后 channel」的标准含义（持 index 期间获取 channel）正是后半句禁止的形态。按字面执行唯一合规律是「取 index→释放→取 channel」，但发布流程需在同一临界区内读 index（hosting）与写 episodes（channel），两半条款无法同时满足；且「已被持则立即拒绝」语义未写明 try-acquire 失败后是否释放已持的另一把锁：若 A 持 index 后 try channel 失败而不释放 index，B 持 channel 后 try index 必然也被拒，双请求互相放逐。结构锁要守的是一条自相矛盾的规则，实现者必然各按自己的理解写，机械守卫反而固化分歧。",
      "suggestion": "把语义改写为可机械断言的形式：「两把锁均为 try-acquire，顺序先 index 后 channel；channel 获取失败必须立即释放 index 后整体拒绝（PODCAST_INDEX_BUSY/PODCAST_CHANNEL_BUSY）；结构锁断言源代码中不存在『已持 channel 锁的调用栈内调用 withPodcastIndexLock』路径」，并配并发回归测试（A 持 channel、B 先拿 index 再抢 channel 必须整体失败且释放干净）。"
    },
    {
      "id": 11,
      "target": "proposal §5.1.1 / §3 / §5.2",
      "severity": "Critical",
      "dimension": "completeness",
      "finding": "partial 终态没有持久化载体，重启即失忆。不变量 1 承诺 feed 上传失败时报 partial 并提供【只重试上传 feed】，但 partial 只存在于当次 progress 事件与渲染层瞬态；§3 channel.json 本地缓存只有 lastFeedPublicUrl / lastFeedPublishedAt，没有任何 feed 滞后标记。可执行失败场景：一键发布到 saveEpisode 成功、uploadFeed 失败（OSS 抖动/超时，PUT_TIMEOUT_MS=120000，podcast-hosting-upload.js:36）→ 用户关闭浮层或重启应用 → 界面上这期看起来一切正常，公网 feed 永久缺这一期，应用内再无任何入口提示或重试通道。这正是用户被承诺「不得报成功」要防的事故形态，却从另一个门漏了出去。",
      "suggestion": "把 feed 同步结果（lastFeedResult: success|partial|failed + lastFeedAttemptAt）持久化进 channel.json（或 index.json），channel:list 返回，Podcast 页按状态渲染「公网 feed 未同步」横幅并从状态恢复【只重试上传 feed】入口；补行为锁：模拟 feed 上传失败后重建服务实例，partial 可恢复、重试成功后标记翻转为 success。"
    },
    {
      "id": 12,
      "target": "proposal §4 事件/进度 / §5.2 降级矩阵",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "降级矩阵缺「用户取消/放弃」终态，长任务无取消语义。podcast:episode:publishFromSource 是分钟级任务（ffmpeg 抽混音 + 音频 PUT 与 feed PUT 各自 120s 超时预算），§4 只定义 start/done 双边界，没有取消通道、没有 cancelled/abandoned 结果态、没有相位枚举闭集。失败场景：用户点发布后关掉浮层/切走页面——任务是继续跑完（结果落在哪里、浮层没了给谁看）还是中断？若中断，音频已上传、期未挂、feed 未动的中间产物算哪一格？§1.1 明确播客不进 publish:progress 终态体系，意味着这套终态必须自建，但 v2 只建了半套。",
      "suggestion": "二选一并写进 §5.2：① 不支持取消（推荐）——任务跑完按正常终态落盘，进度面板声明「关闭浮层不会取消」，矩阵补「用户中途离开 → 结果照常持久化」行；② 支持取消——定义中断点产物归属与加锁释放，矩阵补 cancelled 行并同步 §4 相位枚举闭集。"
    },
    {
      "id": 13,
      "target": "proposal §3 迁移 / §5.1.3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "「注册期单飞」与现行构造约束冲突，且迁移锁与运行时锁是两套机制。现行 ipc-handlers/podcast.js:68 明文「服务实例惰性解析：注册动作本身不得触碰 userData 目录（测试环境同样走这条注册路径）」，getService() 在首条 IPC 调用时才构造（:71-79）。v2 只写「主进程 registry 构造时用 index.lock 文件锁完成一次迁移」，未钉死构造时机：若沿用惰性构造，「注册期迁移」实际发生在第一条 IPC（通常恰是 channel:list 读路径）内部，与「读路径绝不再隐式执行复制建目录」字面冲突，第 1 轮 #1/#4 的闭合被打了折扣。另外迁移用 index.lock 文件锁、运行时用 withPodcastIndexLock() 进程内互斥，两者是否同一把锁的两层未定义；迁移抛 fs 错误时构造失败，全部 podcast 通道的可用态（哪些只读通道保留、错误码是什么）也未定义。",
      "suggestion": "① 明确 registry 在 app ready 前显式 eager 构造（并声明这取代 podcast.js:68 对本服务的惰性约束，或迁移下沉到首个写路径前的一次性显式触发点）；② 声明 index.lock 与 withPodcastIndexLock 的关系（建议同一收口：运行时锁内层持文件锁，或迁移期独占文件锁、注册完成后进程内互斥接管）；③ 迁移失败落 migrationStatus:\"error\"，只读通道保留、一键入口禁用，错误码进 §6 表。"
    },
    {
      "id": 14,
      "target": "proposal §2.3 刀 3 / D-9",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "D-9 把手柄前置到刀 3 消除了入口返工，但把返工风险转移到了手柄状态机内部：刀 3 只挂成片两入口，其真实数据永远无法驱动降级矩阵中属于刀 4 的结果态（TTS 超时/超预算的 retryable、无凭证 blocked 的 TTS 分支语境），手柄状态机在只有成片路径数据的条件下定型，刀 4 接入时必然补态改机——「共享手柄」承诺退化成二次改造，且此时刀 3 已过像素基线，改状态机可能再次触发视觉与 IPC 契约面返工。刀 3 同时承担最难技术链（degraded 读取+抽混音+三处一致+双对象上传）与全部入口基建，任何一半失败都堵死整刀交付。",
      "suggestion": "刀 3 验收标准写明：共用手柄状态机必须实现 §5.2 全部结果态（含 retryable），用注入假装配器的单测把矩阵每一格都驱动一遍（含刀 4 才会触发的行）；刀 4 只允许换数据源与触发条件，不允许改手柄状态机——写进结构锁（手柄状态枚举变更需同时更新矩阵测试）。"
    },
    {
      "id": 15,
      "target": "proposal §5.1.4 / §6 / §3 guid 规则",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "不变量 4 收窄为一键产出后，同一 feed 内两类单集的一致性无人守：手工外链单集的 mime 走 buildItem 的 audioMimeFromUrl(url) URL 猜测回退（podcast-rss.js:236）、sizeBytes 是用户申报值（仅 validateEpisode 正整数校验，podcast-rss.js:156-159），而一键单集全实测——validateFeed 不区分两来源；guid 三种风格在同一 feed 混用（mpub:<channelId>:… 作用域 guid / crypto.randomUUID()（podcast-channel-service.js:301）/ buildItem:238 回退 audioUrl）也无任何断言。evidence-v2-addendum A3 自己承认该口径缺口「待 PRD 定」，即 v2 未闭合。失败场景：Apple 校验 enclosure length 与实际不符打回时，无从区分是手工申报错误还是一键装配缺陷；手工项 mime 猜测失败时输出什么也未定义。",
      "suggestion": "§6 增一条 feed 级校验声明：手工项按申报值透传、不做实测（呼应 A3 的界面措辞约束）；validateFeed 对 audioMimeFromUrl 无法判定的手工项输出 issue 而非静默默认；测试固定「一键+手工混合 feed」用例，断言两种来源共存时的输出形态与 guid 风格清单是预期内的三态。"
    },
    {
      "id": 16,
      "target": "rebuttal-v1 #4 vs proposal §4",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "rebuttal-v1 对 #4 的修改文本承诺「registry 在构造期完成迁移并保证至少一个频道存在」，与 v2 §4 channel:list 保留的 empty 出口不可同真：若构造期强制建频道，empty 恒为假、且该强制频道的 id/名字从何而来未定；v2 本身并未写这句承诺。实现者若照 rebuttal 而非 v2 建「幽灵默认频道」，会复现第 1 轮 #1 否决过的 default 语义。",
      "suggestion": "以 v2 为准（空库走 channel:list empty → 渲染层引导 channel:create），在 v3 或 PRD 显式否定 rebuttal-v1 #4 中「保证至少一个频道存在」一句，防止两份材料各自成为真源。"
    },
    {
      "id": 17,
      "target": "proposal D-8 / §5.2 ITEMS_MAX 行",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "事前禁用的 {cap, count} 刷新时机未定义：渲染层在删除单集、切换频道、或用户在播客页另一入口手工加集之后，若沿用上次 episode:list 的 count，会误禁（可用而禁）或放行（满了却点进去）。服务端 EPISODES_FULL 兜底存在，故只是体验缺陷而非数据缺陷。",
      "suggestion": "composable 约定：每次发布动作发起前以当次 episode:list / channel:list 返回值现算禁用态，不缓存跨动作的 count；写进 usePodcastEpisodePublish 的契约注释。"
    },
    {
      "id": 18,
      "target": "proposal §9.5 feed 回滚",
      "severity": "Info",
      "dimension": "security",
      "finding": "OSS 侧时间戳备份「失败仅记日志不阻断」意味着该次发布是无回滚点覆盖：validateFeed 前置降低了写坏概率，但备份失败 + 上传内容意外损坏叠加时，所有订阅者拿到坏 feed 且无退路，用户不知道本次没有保险。",
      "suggestion": "备份动作结果回传结果态（backupCreated: true|false），UI 在 backupCreated=false 时标注「本次未建立回滚点」；是否阻断可维持不阻断，但必须可见。"
    }
  ],
  "retracted": [
    {
      "issueId": 1,
      "reason": "机制闭合：v2 §3 迁移产物改为合规 ch_<16hex>（与手工建频道同一生成器）、目录名=channelId、default 仅作 UI 显示名，全文已无 channels/default/ 残留；§6 把 channelId 唯一载体钉死为 index.json 的 channels[].id（目录名与之相等），写前校验与对象 key 派生共用同一判据，不可变性有了落点。"
    },
    {
      "issueId": 2,
      "reason": "机制闭合：v2 不变量 2 新增主进程前置步骤 readDegradedFlags，判据 audioMeta.degraded===true 来自项目持久化数据（独立复核成立：story2video-project-service.js:965/:1107/:1770/:1818 经 safeAssetMeta 落盘，ResultView.vue:652 渲染层同判据），任一 degraded 即 PODCAST_AUDIO_DEGRADED_SOURCE 阻断上传，且 §7 有「摘掉 degraded 判定必红」的行为锁与变异反证；渲染层提示被明确定性为显示非防线。"
    },
    {
      "issueId": 3,
      "reason": "机制闭合：v2 新增 withPodcastIndexLock() 全局单键覆盖 index.json 的 hosting/defaultChannelId 读改写，withPodcastChannelLock(channelId) 覆盖 episodes.json 全部写者（含手工增删与迁移），等待语义改为立即拒绝并点名不复用 account-state-lock.js:41-48 的 30s 等待。原缺陷（全局状态被按频道键漏盖）已消除；遗留的锁序条款措辞矛盾是 v2 新引入问题，另记 #10，不影响本条撤回。"
    },
    {
      "issueId": 4,
      "reason": "机制闭合：v2 §4 撤回「8 通道一律必填」，改为逐通道表（channel:get/episode:*/feed:build/feed:verify 必填，endpoints:list 保持无参——独立复核 podcast.js:143 确为无参频道无关目录），channel:create/:save 职责切分（create 只分配 id 与骨架、save 不得改 id）；引导环由「构造期迁移 + channel:list 的 empty 显式出口」消除，主进程不猜默认值。rebuttal 文本与 v2 在「至少一个频道存在」上的出入另记 #16（Info），不动摇本条闭合。"
    },
    {
      "issueId": 5,
      "reason": "机制闭合（partially_accepted 的限定成立）：v2 不变量 4 明确仅约束一键产出，三处一致（fs.stat == ffprobe sizeBytes == putObject 返回 size）经独立复核有真实落地链（podcast-hosting-upload.js:205 statSync、:207 Content-Length、:226 return {status,size}）；手工外链单集沿用 validateEpisode（podcast-rss.js:153-159），出站探测缺口因 _headImpl 缺省 null（podcast-channel-service.js:120）与测试零出站约束而如实记为不覆盖，未谎称闭合。rebuttal 的 persuade 条件（给出不出站机制或撤回）成立，本子项撤回；混合 feed 一致性缺口另记 #15。"
    },
    {
      "issueId": 6,
      "reason": "机制闭合：D-8 整条撤销挤出+confirm，改为 {cap,count} 暴露（episode:list/channel:list 返回）+ 一键入口事前禁用 + 服务端 EPISODES_FULL 兜底，判据同源（同一 ITEMS_MAX 导出，podcast-rss.js:20，禁第二份 1000），§5.2 补齐 blocked 行。pre-flight 通道缺失问题随挤出承诺一并消失；count 陈旧的小缺口另记 #17（Info）。"
    },
    {
      "issueId": 7,
      "reason": "机制闭合：D-9 把共用手柄与浮层前置到刀 3（先挂成片两入口），刀 4 复用不再新建组件，§2.3 表述改为「每刀交付一个用户可用动作，刀 3 含入口基建」并如实声明刀 3 前置依赖刀 2——原「独立可交付与依赖矛盾」的表述缺陷已消除；返工风险向手柄状态机内部的转移另记 #14。"
    },
    {
      "issueId": 8,
      "reason": "机制闭合：v2 §7 明确「必须同时登记两份清单」并点名 views/all-views.visual.test.js 的 viewTests 与 run-pixel-tests.js 的 pixelTests（独立复核 pixelTests 列表与 podcast-channel 条目确在 :55），通过证据定为 CI 日志中用例名出现次数 > 0，只登记前者定义为等于没跑。"
    },
    {
      "issueId": 9,
      "reason": "机制闭合：v2 §9.5 补齐 RAM 子账号最小权限指引 + STS 形态（独立复核 podcast-hosting-upload.js:15-17 securityToken 注释与分流属实）、secret 永不回显/save 缺席保持/拒绝空 secret 静默覆写；feed 回滚升格为「必经落地对象」：uploadFeed 前本地 feed.prev.xml + OSS 时间戳副本 + 显式回滚入口。备份失败不阻断的残余风险降级为可见性问题，另记 #18（Info）。"
    }
  ]
}
