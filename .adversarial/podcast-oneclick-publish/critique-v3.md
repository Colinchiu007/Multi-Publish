{
  "schemaVersion": 1,
  "round": 3,
  "critic": "codex",
  "dimensionScores": {
    "completeness": 7,
    "consistency": 7,
    "clarity": 8,
    "feasibility": 7,
    "security": 8
  },
  "issues": [
    {
      "id": 19,
      "target": "v3 §5.2:186 / §3:116-118 / §8.5 #11 —— #11 闭合载体自身漏洞",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "lastFeedResult/lastFeedAttemptAt/lastFeedErrorCodes 落 channel.json 后，既有 saveChannel 语义会把它整写清掉：saveChannel（apps/desktop/electron/services/podcast-channel-service.js:234-254）以 Object.assign({}, channel, {createdAt, updatedAt}) 生成 stored（:247-250），previous 只用于取 createdAt（:245/:248），不含 lastFeed*；渲染层改频道名走 saveChannel 传干净对象 ⇒ 三字段被覆盖，partial 横幅与【只重试上传 feed】随改名消失——正是 #11 要防的「静默失忆」从另一扇门回归。且 v3 未定义 lastFeed* 的写入者与保留语义；§3 树（:116）channel.json 注释「沿用 validateChannel 白名单，逐字不变」与三字段同文件的归属两处口径不一（validateChannel 本身不剥离未知键，packages/shared-utils/src/podcast-rss.js:83-122，机械上不冲突，但设计文本未澄清）。",
      "suggestion": "明确 lastFeed* 仅由发布流程写入、saveChannel 改字段级合并（或 channel.json 双段结构：channel 元数据 + feedSync 元数据）；§3 树补列三字段；行为锁「rename 后 partial 横幅仍在」与「重启后 partial 仍在」同列。"
    },
    {
      "id": 20,
      "target": "v3 §5.1.3:166-168 / §5.2:191 —— busy 判定与 channel 锁粒度两读互相矛盾",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "「同频道已有发布在跑 → PODCAST_CHANNEL_BUSY」（:191）的检测机制未定义，channel 锁存在两种读法：§5.1.3（:166）说锁覆盖 episodes.json 所有写者、「经服务层同一收口点（saveEpisode:275 / removeEpisode:316 内部原本无锁）」= 短临界区；此时两次并发一键发布在时间上错开，锁从不同时占用，busy 永不触发，防重入形同虚设。若改读为「整个发布期间持有 channel 锁」，则发布期间手工增删必被 busy 拒绝，但降级矩阵无此行；且与「唯一合法形态……两个持有期不重叠」（:168）的表述未说明分钟级长持有是否合法。结构锁只断言「不存在已持 channel 再取 index」，两种粒度都能通过，锁不死锁但语义二义。",
      "suggestion": "二选一并写死：① 发布级进行中标记（进程内存 + 崩溃即清，发布入口 try-acquire 该标记而非依赖写点锁）；② 明确 channel 锁长持有为合法形态并写明手工写路径在发布期间的 busy 行为，补进 §5.2 矩阵与结构锁粒度断言。"
    },
    {
      "id": 21,
      "target": "v3 §5.1.3:168 —— hosting 快照读取与使用之间的窗口",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "「持 index 读 hosting 快照 → 释放 index → 持 channel 写 episodes」的合法形态下，快照读出后到分钟级发布实际 PUT 之间，hosting 配置可被另一路径修改（换 bucket/pathPrefix/凭证），本次发布继续用旧快照上传音频；更实际的是 partial 后【只重试上传 feed】重试时若重新读配置，音频对象在旧前缀、后续发布按新配置走，跨前缀不一致且无任何记录（audioUrl 已固化进 episodes.json，旧凭证一旦失效旧期音频全部 404）。v3 未定义发布全程钉住快照、结果态记录所用 hosting 配置、重试绑定同一份快照。",
      "suggestion": "partial 持久化补 hostingSnapshotRef（或快照本体）；发布全程使用同一快照；重试入口显式沿用上次快照并提示「hosting 配置已变更，本次重试仍用上次配置」；结构锁断言发布临界区内不二次读 hosting 配置。"
    },
    {
      "id": 22,
      "target": "v3 §5.2:187（不支持取消）/ §5:156-158 数据流 —— 计费与进程级中断未覆盖",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "① TTS 分块合成发生在 uploadAudio 之前（§5 数据流 :156-158），该相位取消本可零孤儿、零额外成本——rebuttal-v2 #12 的论据「中断点上 OSS 已传对象归属不可判定」只适用于上传之后的相位，一刀切禁取消使用户无法中止已计费任务；§9 未决项 2 自己承认 TTS 计费敏感，却与「不可取消」正交未接。② 矩阵 :187 只处理「关闭浮层/切走页面」，应用退出/崩溃中途（进程死亡）无任何行：音频可能已上传、期未挂、partial 未持久化 ⇒ 静默孤儿，仅靠 §5.3 OSS 生命周期策略兜底，应用内无任何提示与恢复通道。",
      "suggestion": "至少给相位边界取消：uploadAudio 前任一相位可取消（不产生任何出站对象），uploadAudio 后维持不可取消并沿用现有文案；§5.2 补「进程中断」行——启动时以 lastFeedAttemptAt 与 episodes 现状做一次对账提示（如实声明只提示不自动修复）。"
    },
    {
      "id": 23,
      "target": "v3 §3:124-128（#13 残留）—— 迁移只定义 conflict 态，硬失败无出口",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "第 2 轮 #13 的主体（注册期冲突）已闭合：registerHandlers（apps/desktop/electron/ipc-handlers/podcast.js:65-81）全程不触盘、getService 惰性构造，ensureMigratedOnce 挂在首个需要频道数据的 handler 调用内，与 ：68 约束可同真（独立复核成立）。但建议③未被吸收：migrationStatus 仅有 \"conflict\"（v3:125），复制中途 fs 硬错误（EPERM/磁盘满/进程死亡）无持久化状态、无「哪些只读通道保留」的可用态矩阵；且半复制目标会在重跑时命中「目标已存在且内容不同」（:128）判据，被误判为 conflict 迫使用户面对一个本可自动续传的手工裁决。",
      "suggestion": "迁移目标完整性用内容哈希判定：全量一致=已完成、不一致且来源仍完整=静默续传、来源与目标各为不同合法内容才落 conflict；硬失败落持久化 migrationStatus:\"error\"，只读通道保留、写路径 fail-closed，错误码进 §6 表。"
    },
    {
      "id": 24,
      "target": "v3 §8.5 M-1 —— 预校验对象与落盘对象不同一",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "M-1 校验的是传入 episode，落盘的是合并结果：saveEpisode 合并分支 Object.assign({}, list[index], episode)（podcast-channel-service.js:285）。旧记录中传入对象未覆盖的坏字段（上次尝试遗留的非法 mime/coverUrl 等）在合并中存活——预校验绿灯、落盘仍坏、channel 级阻断照旧发生。evidence-v3-selfcheck §2.3 自己指出「坏字段不会被清掉」，但 M-1 修的是「新集先校验」，没有修「合并产物不校验」；对一键路径，若上次 partial 遗留脏字段而本次对象不含该键，重试依然带着脏字段进 buildFeed。",
      "suggestion": "一键路径预校验合并结果（读出 list[index] 先 merge 再 validateEpisode），或一键写入改整对象替换语义（一键产物字段完备，不需要保留旧键）；行为锁从「非法单集不落盘」升级为「非法合并产物不落盘」，变异反证改为注入「旧脏字段 + 新合法对象」夹具。"
    },
    {
      "id": 25,
      "target": "v3 §8.5 M-2 —— issues[] 在现有 IPC 错误管道中已被丢弃，传输载体缺失",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "服务层 err.issues 存在（podcast-rss.js:273 err.issues = check.issues，字段路径带序号，at() :137）；但 toIpcError（apps/desktop/electron/ipc-handlers/podcast.js:55-62）只返回 {code, message}，PODCAST_FEED_INVALID 未列入 :59 的白名单 → 落 :62 REQUEST_ERROR，且 message 只有码列表（podcast-rss.js:271 拼接 codes），序号与字段路径全部丢失。v3 §4 契约表（:135-142）未列错误体扩展，M-2 的「带序号 issues[] 透出渲染层」没有任何传输载体，属承诺无落地路径。",
      "suggestion": "§4 契约表补错误体形态 {code, message, issues[]}，toIpcError 白名单扩 PODCAST_FEED_INVALID（透传 err.issues），preload 包裹层同步；ipc-contract.test.js 补「issues 数组逐条到达渲染层」断言（不是只断言错误码出现）。"
    },
    {
      "id": 26,
      "target": "v3 §8.5 M-1/M-3 —— 历史坏集的「预防」只堵一键路径，#15 落地反使存量数据变 blocked",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "手工路径 saveEpisode 仍零校验（podcast-channel-service.js:271-309；:266-267 的「先登记本地文件」中间态理由成立），v3 未给手工路径任何替代防线（如保存后即时对可校验子集出声、episode:list 附每期校验态），坏数据仍可持续进入 ⇒ 频道级连带失效的发生源未消除，M-3 只治了归因，「历史坏集卡死整频道」只解决一半。另：#15 落地后（audioMimeFromUrl 无法判定即 issue），存量手工单集中「无 mime + 不可识别扩展名」者从静默默认（podcast-rss.js:228 返回 audio/mpeg）变成整频道 blocked——升级动作本身引入新的阻断面，存量数据过渡/灰度未写。",
      "suggestion": "手工路径至少加「保存后即时校验 + 列表校验态徽标」（不阻断中间态登记，只出声）；#15 的 issue 判定只对新增/编辑动作生效并给存量数据一次性迁移（无法判定的补写 mime 或批量提示），写进 §7 夹具。"
    },
    {
      "id": 27,
      "target": "v3 §9.5:251 vs §8.5:264 —— 备份失败口径同文冲突",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§9.5（:251）「注入 clientImpl，备份失败仅记日志不阻断主流程」与 §8.5 #18（:264）「backupCreated 进结果态与横幅，false 时标注『本次未建立回滚点』……必须可见」不可同真：「仅记日志」即不可见。同一文档两处真源，实现者按 §9.5 写就复刻第 2 轮 #18——这正是第 1 轮 #16 已定性过的「两份材料各自成为真源」同族错误，这次发生在 proposal 内部两节之间。",
      "suggestion": "§9.5 同步改写为「备份失败不阻断主流程，backupCreated=false 进结果态与横幅（见 §8.5 #18）」，删除「仅记日志」。"
    },
    {
      "id": 28,
      "target": "v3 §7:226-227 vs §8.5 —— 锁清单与 §8.5 承诺脱节",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "#14（手柄状态机与刀 4 结构锁）、#17（现算禁用行为锁）、#11（重启后 partial 仍在）三把锁只出现在 §8.5 表内，§7 的结构锁清单（:226）与行为锁清单（:227 ①-⑤）均未纳入——验收入口分散两处，后续实现者只读 §7 会漏掉三把已承诺的锁。",
      "suggestion": "§7 两张清单补列：⑥ 手柄状态机枚举变更必须与矩阵测试同 PR；⑦ 删除一期后不刷新列表不得解除禁用；⑧ 重建服务实例后 partial 状态可恢复。"
    },
    {
      "id": 29,
      "target": "v3 §8.5 #15 —— 「audioMimeFromUrl 无法判定」在现实现中不存在",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "audioMimeFromUrl 对未知扩展名返回默认 'audio/mpeg'（podcast-rss.js:228），从不返回「无法判定」；#15 引用的 :237（ep.mime || audioMimeFromUrl(url)）只是输出落点，「mime 缺省且扩展名未命中映射表」的判据需要新增实现（改函数签名返回 null 或在调用点比对扩展名命中与否），v3 未写该判据形态，落点引用与判据实现是两件事。",
      "suggestion": "§8.5 #15 补一句判据形态：audioMimeFromUrl 返回 null 表示未命中（默认回退移除或由调用点显式降级），buildItem 对 null 输出 EPISODE_MIME_UNDETERMINED issue。"
    }
  ],
  "retracted": [
    {
      "issueId": 10,
      "reason": "机制闭合：v3 §5.1.3（:168）重写为「两把锁均为 try-acquire，固定顺序 index → channel；channel try-acquire 失败必须立即释放 index 再整体拒绝；唯一合法形态是持 index 读快照 → 释放 → 持 channel 写 episodes，持有期不重叠；结构锁断言源码中不存在已持 channel 再取 index 的调用序列」——与第 2 轮建议逐点对应，「先 index 后 channel」与「禁止持 index 等 channel」的矛盾消除，形态可机械断言。建议中的并发释放回归测试未入 §7 清单，降级记 Info #28。"
    },
    {
      "issueId": 11,
      "reason": "机制闭合：v3 §5.2（:186）给出字段名 lastFeedResult/lastFeedAttemptAt/lastFeedErrorCodes、透出通道（episode:list/channel:list）、横幅按持久态渲染与重启锁三件套（§8.5 :257），不再是「要记住」。残留缺口（saveChannel 整对象覆盖会清掉字段）不影响「载体存在」的判定成立，另记 #19。"
    },
    {
      "issueId": 12,
      "reason": "机制闭合：采纳建议①「不支持取消」，§5.2（:187）补「用户中途关闭浮层/切走页面 → 任务照常跑完并按持久化终态落盘」行 + 浮层明示文案 + 相位枚举闭集与规模下界断言，防偷加 cancelled 的锁位已占。计费中止与进程级中断属该决策的新边界，另记 #22。"
    },
    {
      "issueId": 14,
      "reason": "机制闭合：§8.5（:260）写明刀 3 手柄必须实现全部结果态并用注入假装配器的单测逐格驱动矩阵（含刀 4 才触发的 TTS 格），刀 4 只换数据源不得改状态机、由结构锁守——返工从「转移」变为「前置消化」。锁未入 §7 清单记 Info #28。"
    },
    {
      "issueId": 15,
      "reason": "机制闭合：§8.5（:261）给齐三件——手工项按申报值透传（措辞「申报」）、audioMimeFromUrl 无法判定即输出 issue 且钉死落点 podcast-rss.js:237（独立复核：buildItem 的 mime 派生确在 :237，静默默认在 :228）、一键+手工混合夹具。判据实现形态缺失记 Info #29，存量数据过渡记 #26。"
    },
    {
      "issueId": 16,
      "reason": "机制闭合：§8.5（:262）显式否定 rebuttal-v1 #4「保证至少一个频道存在」，空库走 channel:list 的 empty 出口引导 channel:create，设计文档定为唯一真源——出方文本冲突的消除方式与建议一致。"
    },
    {
      "issueId": 17,
      "reason": "机制闭合：§5.2（:189）写明 {cap,count} 每次发布动作发起前现算、禁止跨动作缓存（点名 #17），§8.5（:263）补契约注释位置与行为锁承诺。锁未入 §7 清单记 Info #28。"
    },
    {
      "issueId": 18,
      "reason": "机制闭合：§8.5（:264）backupCreated 进结果态与横幅、false 时标注「本次未建立回滚点」、维持不阻断但必须可见——「无保险」不再藏进日志。§9.5 旧句未同步造成的同文冲突另记 #27。"
    }
  ],
  "notes": {
    "selfCorrectionVerification": [
      "saveEpisode 不做单集校验：属实。podcast-channel-service.js:271-309 仅 :272-274 判对象形态、:296-298 判 ITEMS_MAX，:285/:300 Object.assign 全量落盘；imports :27-31 无 validateEpisode/validateEpisodeList。",
      "engineBuildFeed 先跑 validateFeed：属实。podcast-rss.js:269 首语句 validateFeed → :190-194 → validateEpisodeList :171-188 → validateEpisode :136；:270-274 抛 PODCAST_FEED_INVALID 且 err.issues 带序号路径（at() :137）。",
      "ipc-handlers/podcast.js 注册期不碰 userData 与 ensureMigratedOnce 兼容：属实。registerHandlers :65-81 仅注册 handler，getService :71-81 惰性构造，构造函数（podcast-channel-service.js:116-129）只存配置、resolvePodcastDir :142-158 惰性解析，迁移触发在首个频道数据 handler 调用内，注册路径全程不触盘。"
    ],
    "dimensionRationale": "第 2 轮 9 条中 8 条机制级闭合（#13 主体闭合、硬失败残留另记），出方自查 M-1/M-2/M-3 方向正确且证据链经独立复核全部属实；但闭合方案自身引入 5 个机制级新缺口（#19/#20/#21/#24/#25）与 1 处同文冲突（#27），故各维在 v2 基础上小幅上调而不给高分：completeness 7、consistency 7、clarity 8（§8.5 逐条验收表清晰）、feasibility 7（busy/快照/issues 传输三处机制未定义）、security 8（凭证与回滚面无回归）。"
  }
}