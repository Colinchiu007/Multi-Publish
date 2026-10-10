{
  "schemaVersion": 1,
  "round": 1,
  "critic": "opencode",
  "dimensionScores": {
    "completeness": 6,
    "consistency": 4,
    "clarity": 6,
    "feasibility": 6,
    "security": 6
  },
  "issues": [
    {
      "id": 1,
      "target": "proposal §3 / §6",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "§3 目录布局以 channelId 作目录名（channels/<channelId>/），迁移把既有频道写入 channels/default/，而 §3/§6 规定 channelId 须匹配 ^ch_[a-z0-9]{4,16}$；default 无 ch_ 前缀，迁移产物会被自己的写前校验拒绝。且 channelId 的载体（目录名还是 channel.json 内字段）未定义，不可变性无从落地。",
      "suggestion": "明确 channelId 载体（目录名 + channel.json 冗余 id 字段），迁移时生成合法 ch_ id 并保留 default 作兼容别名，或放宽正则允许 default；同步 §6 校验点与迁移测试。"
    },
    {
      "id": 2,
      "target": "proposal §5 不变量2 / §5 数据流",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "不变量2 要求 degraded 旁白 fail-closed 不进上传，但 §5 数据流（extractMix → ffprobe → 上传）没有任何一步消费 degraded 信号；现存唯一判定点在渲染层 ResultView.vue:648-657 的 degradedAssetKinds（仅弹提示 :884-888），刀3 成片路径拿不到该信号，含静音占位的音频会被照常上传，fail-open。",
      "suggestion": "把 degraded 判定下沉到主进程上传前（读项目段 audioMeta.degraded 作 gate），或在 extractMix 结果上加 ffprobe 静音检测；§5.2 降级矩阵补「degraded 成片混音 → failed」行并加回归测试锁住拒绝路径。"
    },
    {
      "id": 3,
      "target": "proposal §5.1.3 / §3 数据模型",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "§5.1.3 只按 channelId 串行化，但 §3 的 index.json（hosting 配置 + defaultChannelId）是跨频道全局共享状态；两个频道各自的锁互不覆盖对 index.json 的读改写，并发写会丢失更新（defaultChannelId/hosting 相互覆盖）。",
      "suggestion": "为 index.json 读改写增加独立全局锁（或把 hosting/defaultChannelId 拆进各频道目录），§5.1.3 补「全局状态需全局锁」条款并加并发回归测试。"
    },
    {
      "id": 4,
      "target": "proposal §4 IPC 面",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "§4 要求既有 8 通道一律加必填 channelId，但 endpoints:list（apps/desktop/electron/ipc-handlers/podcast.js:142 → listPodcastEndpoints()）是频道无关的分发端目录，加 channelId 语义不成立；channel:get 需要 channelId 而 defaultChannelId 只能来自新通道 channel:list（usePodcastChannel.js:207 现无参调用 channelGet），零频道/未迁移状态的引导顺序未定义；channel:save（podcast.js:103）与新增 channel:create 的职责边界未界定。",
      "suggestion": "逐通道声明哪些必填 channelId、哪些读默认频道；定义空库引导顺序（无默认频道时 get 返回什么码）；写明 save=更新既有、create=新建+分配 id 的边界。"
    },
    {
      "id": 5,
      "target": "proposal §5 不变量4 / 刀2",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "不变量4 要求 durationSec/sizeBytes 来自 ffprobe 实测（validateEpisode 强校验 packages/shared-utils/src/podcast-rss.js:153-159），但刀2 手工单集走外链音频、本地无文件可探测，用户手填的时长/字节数无法满足「实测」语义；不变量与刀次能力不自洽。",
      "suggestion": "为外链音频定义替代证据（如 HEAD Content-Length + 用户确认），或把不变量4 限定为本地上传音频；§5.2 降级矩阵补「外链无实测数据」行。"
    },
    {
      "id": 6,
      "target": "proposal §5.2 / §4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "§5.2 提出「超上限时挤出最老一期 + confirm」，但 §4 接口面没有 preflight/容量查询通道，ITEMS_MAX=1000（podcast-rss.js:20）未暴露给渲染层；服务层 saveEpisode 直接抛 EPISODES_FULL（podcast-channel-service.js saveEpisode），confirm 无可行执行路径（挤出动作、被挤对象、原子性均未定义）。",
      "suggestion": "要么在 episode:list 返回 {count, max} 并新增显式 evict 接口，要么把挤出降级为「报错+引导删除」；确认写入 §4 接口表与 §5.2。"
    },
    {
      "id": 7,
      "target": "proposal §2.3 / §9.6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§2.3 声称每刀独立可交付，但 §9.6 承认刀3 依赖刀2（成片单集依赖上传/托管通道）；共用手柄收敛排在刀5，意味着刀3/刀4 落地时入口需二次改造并触发第二次视觉基线周期，与「独立可交付」矛盾。",
      "suggestion": "把刀3 的依赖显式声明为「依赖刀2 的托管上传」，或把共用手柄前移到刀2；明确哪些刀合并后才算独立可交付。"
    },
    {
      "id": 8,
      "target": "proposal §7 视觉回归",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "§7 只提新增浮层用例，未提第二份清单登记：QG Visual 只执行 apps/desktop/tests/visual-testing/scripts/run-pixel-tests.js 的 pixelTests（:10-55，已含 podcast-channel :55），只登记 views/all-views.visual.test.js 的 viewTests 会得到必然的绿；暗色档靠 THEME=dark 重跑同一清单（run-pixel-tests.js:70-74）而非新增 -dark 条目。",
      "suggestion": "§7 明确「两份清单都登记 + 以 CI 日志中该用例名出现次数 > 0 为证据」，并写明暗色是 THEME 重跑而非新增条目，避免漏登记。"
    },
    {
      "id": 9,
      "target": "proposal §0.1 / §2.2 托管与发布",
      "severity": "Warning",
      "dimension": "security",
      "finding": "托管凭证是用户自带长期 AK（apps/desktop/electron/services/podcast-hosting-upload.js:15-17 注释明示无 securityToken），§0.1/§2.2 未建议 RAM 子账号最小权限或 STS 短期凭证；feed:publish 覆盖公网 feed.xml 无上一版备份/回滚语义，写坏即对所有订阅端生效。",
      "suggestion": "§2.2 增加凭证最小权限指引（RAM 子账号仅 put 该前缀、可选 STS）；feed:publish 前对既有 feed.xml 留备份或写临时文件后原子 rename，失败可回滚。"
    }
  ],
  "retracted": []
}
