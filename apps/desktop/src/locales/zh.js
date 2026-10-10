import accountsCloudSyncZh from './accounts-cloud-sync/zh'
import identityDiagnosticsZh from './identity-diagnostics/zh'
import signerZh from './signer/zh'
import tabsZh from './tabs/zh'
import commonZh from './common/zh'
import loginGateZh from './login-gate/zh'
import providerCrudZh from './provider-crud/zh'
import publishDraftsZh from './publish-drafts/zh'
import navZh from './nav/zh'
import tabBarZh from './tab-bar/zh'
import memberCenterZh from './member-center/zh'
import collectionZh from './collection/zh'
import createZh from './create/zh'
import story2videoZh from './story2video/zh'
import pipelinesZh from './pipelines/zh'
import dashboardZh from './dashboard/zh'
import promptEvalZh from './prompt-eval/zh'
import homeZh from './home/zh'
import publishPageZh from './publish-page/zh'
import accountsPageZh from './accounts-page/zh'
import modelProvidersZh from './model-providers/zh'
import stageProgressZh from './stage-progress/zh'
import filmEngineeringZh from './film-engineering/zh'
import rewritePageZh from './rewrite-page/zh'
import viralAnalysisZh from './viral-analysis/zh'
import hotTopicsZh from './hot-topics/zh'
import automationZh from './automation/zh'
import videoCloneZh from './video-clone/zh'
import userErrorsZh from './user-errors/zh'
import calendarPageZh from './calendar-page/zh'
import publishHistoryZh from './publish-history/zh'
import publishTypeZh from './publish-type/zh'
import videoConfigZh from './video-config/zh'
import pipelineSelectorZh from './pipeline-selector/zh'
import errorDialogZh from './error-dialog/zh'
import rewriteEngineZh from './rewrite-engine/zh'
import autoPipelineZh from './auto-pipeline/zh'
import commentsZh from './comments/zh'
import intelligenceZh from './intelligence/zh'
import tagSuggestZh from './tag-suggest/zh'
import updateZh from './update/zh'
import perfInsightsZh from './perf-insights/zh'
import publishDestinationZh from './publish-destination/zh'
import emptyStatesZh from './empty-states/zh'
import contentCategoriesZh from './content-categories/zh'
import copyLibraryZh from './copy-library/zh'
import publishZh from './publish/zh'
import accountsZh from './accounts/zh'
import projectLibraryZh from './project-library/zh'
import onboardingZh from './onboarding/zh'
import sidebarZh from './sidebar/zh'
import settingsZh from './settings/zh'
import historyPageZh from './history-page/zh'

export default {
  signer: { ...signerZh },
  tabs: { ...tabsZh },
  common: { ...commonZh },
  loginGate: { ...loginGateZh },
  providerCrud: { ...providerCrudZh },
  publishDrafts: { ...publishDraftsZh },
  nav: { ...navZh },
  tabBar: { ...tabBarZh },
  sidebar: { ...sidebarZh },
  copyLibrary: { ...copyLibraryZh },
  publish: { ...publishZh },
  accounts: { ...accountsZh },
  projectLibrary: { ...projectLibraryZh },
  onboarding: { ...onboardingZh },
  settings: { ...settingsZh },
  create: { ...createZh },
  // 运行进度文案（CreateView formatDuration / elapsed 命名插值；2026-08-10 补齐缺键）
  story2video: { ...story2videoZh },
  pipelines: { ...pipelinesZh },
  dashboard: { ...dashboardZh },
  promptEval: { ...promptEvalZh },
  home: { ...homeZh },
  publishPage: { ...publishPageZh },
  accountsPage: { ...accountsPageZh },
  calendarPage: { ...calendarPageZh },
  historyPage: { ...historyPageZh },
  publishHistory: { ...publishHistoryZh },
  publishType: { ...publishTypeZh },
  videoClone: { ...videoCloneZh },
  modelProviders: { ...modelProvidersZh },
  // i18n-sync-hardening（2026-08-13）：user-facing-error.js 文案单源收口，模块不再持有 zh/en 文案
  userErrors: { ...userErrorsZh },
  videoConfig: { ...videoConfigZh },
  pipelineSelector: { ...pipelineSelectorZh },
  errorDialog: { ...errorDialogZh },
  stageProgress: { ...stageProgressZh },
  filmEngineering: { ...filmEngineeringZh },

  collection: { ...collectionZh },
  rewriteEngine: { ...rewriteEngineZh },
  autoPipeline: { ...autoPipelineZh },
  comments: { ...commentsZh },
  intelligence: { ...intelligenceZh },

  tagSuggest: { ...tagSuggestZh },

  memberCenter: { ...memberCenterZh },

knowledgeBase: {
    title: '知识库',
    empty: {
      viral: {
        title: '暂无爆款内容',
        message: '采集或新增爆款内容后，可在此统一管理并做模式分析',
        action: '新增爆款',
      },
      personal: {
        title: '暂无知识内容',
        message: '添加个人知识后，可在创作时自动引用你的表达风格',
        action: '添加内容',
      },
    },
    tabViral: '爆款库',
    viralSubtitle: '爆款内容库 — 搜集管理自媒体爆款内容',
    tabPattern: '模式分析',
    patternSubtitle: '爆款模式卡片 — LLM 提取的结构化表达模式（钩子/情绪曲线/叙事结构/CTA/金句/标题公式）',
    patternFilterAll: '全部状态',
    patternStatusPending: '分析中',
    patternStatusDone: '已完成',
    patternStatusFailed: '失败',
    patternRefresh: '刷新',
    patternColId: '条目',
    patternColStatus: '状态',
    patternColHook: '钩子类型',
    patternColCurve: '情绪曲线',
    patternColNarrative: '叙事结构',
    patternColCta: 'CTA 方式',
    patternColFormula: '标题公式',
    patternColAttempts: '尝试',
    patternColActions: '操作',
    patternDetail: '详情',
    patternDetailTitle: '模式卡片详情',
    patternHookAnalysis: '钩子分析',
    patternGoldenQuotes: '金句',
    patternLastError: '最后错误',
    patternReextract: '重新分析',
    patternReextractQueued: '已加入重新分析队列',
    patternReextractFailed: '重新分析失败，请稍后重试',
    patternHook_suspense: '悬念式',
    patternHook_conflict: '冲突式',
    patternHook_counterintuitive: '反常识',
    patternHook_question: '提问式',
    patternHook_story: '故事式',
    patternHook_data: '数据式',
    patternHook_empathy: '共情式',
    patternHook_other: '其他',
    patternCurve_rise: '逐步升温',
    patternCurve_fall: '逐步下沉',
    patternCurve_rise_fall: '先扬后抑',
    patternCurve_fall_rise: '先抑后扬',
    patternCurve_wave: '波浪起伏',
    patternCurve_flat: '平铺直叙',
    patternNarrative_total_subtotal: '总分总',
    patternNarrative_problem_solution: '问题-方案',
    patternNarrative_chronological: '时间线',
    patternNarrative_contrast: '对比',
    patternNarrative_list: '清单',
    patternNarrative_story_lesson: '故事+道理',
    patternCta_question: '提问式互动',
    patternCta_challenge: '挑战式',
    patternCta_resource: '资源引导',
    patternCta_follow: '关注引导',
    patternCta_comment: '评论引导',
    patternCta_none: '无 CTA',
    personalSubtitle: '个人知识资产 — 管理IP人设、背景、经历、观点',
    filesSelected: '已选择 {count} 个文件',
    batchImportComingSoon: '批量导入功能即将上线',
    exportComingSoon: '飞书导出功能即将上线，请先在设置页配置飞书 API',
    tabPersonal: '个人知识库',
    patternQueueBacklog: '模式提取排队中（{n} 条延后处理），分析功能不受影响',
    engagementRecrawled: '互动数据已自动回采更新',
    addViral: '添加爆款',
    addViralManual: '手动添加爆款',
    collectByLink: '用链接采集',
    addPersonal: '添加内容',
    batchImport: '批量导入',
    exportToFeishu: '导出到飞书',
    searchPlaceholder: '搜索...',
    edit: '编辑',
    delete: '删除',
    confirmDelete: '确定要删除这条内容吗？删除后不可恢复。',
    addSuccess: '已添加到知识库',
    updateSuccess: '已更新',
    deleteSuccess: '已删除',
    noFeishuConfig: '尚未配置飞书 API，请先在设置页的飞书 API 标签页中添加 App ID 和 App Secret。',
    colIndex: '序号',
    colTitle: '标题',
    colCover: '封面',
    colAuthor: '博主',
    colLink: '链接',
    colContent: '正文',
    colTags: '话题标签',
    colLikes: '点赞数',
    colCollections: '收藏数',
    colComments: '评论数',
    colRatio: '赞藏比',
    colPublishedAt: '发布时间',
    colPlatform: '平台',
    colActions: '操作',
    colCategory: '类别',
    catPersonalIpPersona: '个人IP人设',
    catPersonalBackground: '个人背景',
    catPersonalStories: '个人故事',
    catGrowthExperience: '成长经历',
    catEmotionalExperience: '情感经历',
    catWorkExperience: '工作经历',
    catProjectExperience: '项目经验',
    catPersonalOpinions: '个人观点',
    catFamilyStories: '家人故事',
    formTitle: '标题',
    formContent: '正文',
    formLink: '链接',
    formAuthor: '博主',
    formPlatform: '平台',
    formTags: '话题标签',
    formCategory: '类别',
    contentRequired: '正文内容不能为空',
    categoryRequired: '请选择知识类别',
    useViralLibrary: '结合爆款库',
    useViralLibraryHint: '从爆款库中提取风格模式优化改写',
    usePersonalKnowledge: '结合个人经历',
    usePersonalKnowledgeHint: '从个人知识库中引用素材丰富改写',
    addToViral: '加入爆款库',
    addedToViral: '已加入爆款库',
    feishuApi: '飞书 API',
    feishuInstructions: '使用说明',
    feishuShow: '显示',
    feishuHide: '隐藏',
    feishuTesting: '测试中...',
    feishuSaving: '保存中...',
    feishuInstrLine1: '1. 访问 open.feishu.cn 创建企业自建应用',
    feishuInstrLine2: '2. 在"凭证与基础信息"中获取 App ID 和 App Secret',
    feishuInstrLine3: '3. 在"权限管理"中开启 docx:document 和 drive:drive 权限',
    feishuInstrLine4: '4. 发布应用并获取管理员审批',
    feishuInstrLine5: '5. 将 App ID 和 App Secret 填入上方并保存',
    feishuAppId: 'App ID',
    feishuAppSecret: 'App Secret',
    feishuTestConnection: '测试连接',
    feishuTestSuccess: '连接成功',
    feishuTestFailed: '连接失败',
    feishuSaveConfig: '保存配置',
    feishuSaveSuccess: '飞书配置已保存',
    feishuExportConfirm: '将导出全部内容到飞书云文档，是否继续？',
    feishuExportSuccess: '导出成功',
    batchSuccess: '成功导入 {count} 个文件',
    fileTooBig: '文件过大（超过 5MB），请选择更小的文件',
    fileNotSupported: '不支持的文件格式（仅支持 .txt .md .doc .docx）',
    loadFailed: '加载失败，请重试',
    fileTooLarge: '文件 {name} 超过 5MB 限制',
    importResult: '导入完成：共 {total} 个文件，成功 {succeeded} 个，失败 {failed} 个',
    importFailed: '文件导入失败',
    exportTitlePrompt: '请输入飞书文档标题',
    exportTitleDefault: '知识库导出',
    exportSuccess: '导出成功，飞书文档 ID：{docId}，共 {count} 条',
    exportFailed: '飞书导出失败',
  },

  // 自动更新（侧边栏「新版本」入口 + 全局结果提示）
  // 需要插值的文案写成 Message Function：CSP 禁止运行时编译，普通字符串不插值（见 src/i18n/index.js）
  update: { ...updateZh },

  perfInsights: { ...perfInsightsZh },

  // ── 文案改写页面 ──
  rewritePage: { ...rewritePageZh },

  // ── 爆款分析页（viral-rewrite-integration）──
  viralAnalysis: { ...viralAnalysisZh },

  // ── 发布去向弹窗 ──
  publishDestination: { ...publishDestinationZh },

  // ── 热门选题页面 ──
  // ── EmptyState 空状态集中文案（存量硬编码迁移）──
  emptyStates: { ...emptyStatesZh },

  // ── 统一内容类别（2026-10-03）：运营中心「内容类别管理」下发前的内置回退名 ──
  contentCategories: { ...contentCategoriesZh },

  hotTopics: { ...hotTopicsZh },

  // ── 自动化模块（2026-10-03）：定时 / 启动触发的自动化任务 ──
  automation: { ...automationZh },

  // ── 应用壳层（App.vue）全局提示（2026-10-09）────────────────────────
  // App 级监听 scheduler:dispatch-failed：定时任务到点但入队失败时，无论用户
  // 停在哪个页面都立即弹错误 toast。此前只有发布日历页监听，用户排完期去了
  // 别的页面就收不到任何提示，失败只静静躺在发布历史里。
  appShell: {
    // 与 calendarPage.scheduleDispatchFailed 职责不同：那条在日历页内弹并刷新日历；
    // 这条是全局兜底（文案不提「重新排期」操作——用户可能不在排期语境，只告知事实）。
    scheduleDispatchFailed: '定时发布未能发出：{platform} {reason}。详情见「发布记录」。',
  },

  podcast: {
    pageTitle: '播客RSS频道',
    pageSubtitle: '经 RSS 订阅把播客收录进小宇宙 / Apple / Spotify 等聚合端：配置频道一次 → 逐期追加单集 → 生成并自检 Feed → 向分发端提交 Feed 地址',
    channel: {
      sectionTitle: '频道设置',
      sectionHint: '频道元信息只需配置一次，生成 Feed 时写入。带校验的字段以自检结果为准。',
      fieldTitle: '频道标题',
      fieldSubtitle: '副标题',
      fieldLink: '站点地址',
      fieldDescription: '频道简介',
      fieldLanguage: '语言',
      fieldAuthor: '作者/主播名',
      fieldOwnerName: '所有者名称',
      fieldOwnerEmail: '所有者邮箱',
      ownerEmailPrivacy: '该邮箱会公开出现在 RSS 中（写入 itunes:email），聚合端与订阅者均可见。',
      fieldExplicit: '分级',
      fieldEpisodeType: '更新方式',
      fieldCoverUrl: '封面地址',
      fieldCoverSize: '封面尺寸',
      fieldCategory: '分类',
      fieldSubCategories: '子分类',
      categoryPlaceholder: '请选择顶级分类',
      subCategoriesHint: '可选，最多一个（聚合端按「顶级/子级」单层归类）；切换顶级分类会清空已选子分类',
      subCategoryNone: '不指定子分类',
      fieldAudioSource: '音频来源',
      save: '保存频道设置',
      saved: '频道设置已保存',
    },
    explicit: {
      yes: 'Explicit（有成人内容）',
      no: '未分级',
      clean: 'Clean（干净版）',
    },
    channelFeedType: {
      episodic: '随更（节目型）',
      serial: '按时间序（连续剧型）',
    },
    audioSource: {
      url: '外链直连（https 音频地址）',
      oss: '托管直传（对象存储）',
    },
    episodeType: {
      full: '正片',
      trailer: '预告片',
      bonus: '加更',
    },
    episodes: {
      sectionTitle: '单集管理',
      empty: '暂未添加单集。点击「新增单集」添加第一期。',
      add: '新增单集',
      addTitle: '新增单集',
      editTitle: '编辑单集',
      edit: '编辑',
      delete: '删除',
      confirmDelete: '确定删除这一期吗？',
      deleteYes: '确认删除',
      deleteNo: '取消',
      save: '保存单集',
      saved: '单集已保存',
      deleted: '单集已删除',
      cancel: '收起',
      fieldTitle: '单集标题',
      fieldDescription: '节目简介',
      fieldAudioUrl: '音频直链（https）',
      fieldLocalFilePath: '本地音频文件路径',
      fieldDurationSec: '时长（秒）',
      fieldSizeBytes: '字节数',
      fieldPubDate: '发布时间（ISO）',
      fieldExplicit: '分级',
      fieldEpisodeType: '类型',
      fieldGuid: 'GUID',
      explicitInherit: '沿用频道设置',
      guidHint: '唯一标识，不可为空；新增时已自动生成',
    },
    publish: {
      sectionTitle: '发布与自检',
      sectionHint: '把频道设置与单集合成为 RSS 并写入用户数据目录；自检通过后再向分发端提交 Feed 地址。',
      buildFeed: '生成 Feed',
      verifyFeed: '自检 Feed',
      feedBuilt: 'Feed 已生成：共 {count} 期',
      feedBuiltNotify: 'Feed 生成成功',
      copyPath: '复制文件路径',
      copied: '路径已复制',
      copyFailed: '复制失败，请手动复制路径',
      verifyPassed: '自检通过：共 {count} 期',
      verifyFailed: '自检发现 {count} 个问题',
    },
    endpoints: {
      sectionTitle: '分发端提交指引',
      sectionHint: 'RSS 聚合端没有发布 API，请按各端指引人工提交 Feed 地址；小宇宙首次收录需要等待其抓取周期。',
      manualFirstSubmit: '需先人工首次提交',
      submitLink: '前往提交页',
      docLink: '官方文档',
      noSubmitUrl: '暂无公开提交地址，请按指引步骤操作',
      empty: '未能读取分发端目录',
    },
    errors: {
      PODCAST_IPC_UNAVAILABLE: '播客服务暂不可用（未登录、许可证未激活，或主进程通道未挂载）',
      PODCAST_IPC_EXCEPTION: '播客服务调用失败，请重试',
      PODCAST_PAYLOAD_NOT_SERIALIZABLE: '表单数据无法序列化，请检查后重试',
      PODCAST_FEED_INVALID: 'Feed 校验未通过，请先按下列问题解决',
      CHANNEL_MISSING: '缺少频道配置',
      CHANNEL_TITLE_REQUIRED: '频道标题不能为空',
      CHANNEL_TITLE_TOO_LONG: '频道标题超出长度上限',
      CHANNEL_DESC_REQUIRED: '频道简介不能为空',
      CHANNEL_DESC_TOO_LONG: '频道简介超出长度上限',
      CHANNEL_SUBTITLE_TOO_LONG: '频道副标题超出长度上限',
      CHANNEL_LANGUAGE_INVALID: '语言需形如 zh-CN / en-US',
      CHANNEL_COVER_REQUIRED: '封面地址不能为空',
      CHANNEL_COVER_NOT_HTTPS: '封面必须使用 https 绝对地址',
      CHANNEL_COVER_SIZE_UNKNOWN: '需填写封面尺寸（形如 3000x3000）以便校验',
      CHANNEL_COVER_NOT_SQUARE: '封面必须为正方形',
      CHANNEL_COVER_SIZE_OUT_OF_RANGE: '封面边长超出允许范围（1400~3000）',
      CHANNEL_LINK_NOT_HTTPS: '站点地址必须使用 https 绝对地址',
      CHANNEL_AUTHOR_REQUIRED: '作者/主播名不能为空',
      CHANNEL_OWNER_EMAIL_INVALID: '所有者邮箱格式不正确',
      CHANNEL_EXPLICIT_INVALID: '频道分级取值不合法（yes/no/clean）',
      CHANNEL_FEED_TYPE_INVALID: 'feed 类型取值不合法（episodic/serial）',
      CHANNEL_CATEGORY_REQUIRED: '必须选择顶级分类',
      CHANNEL_CATEGORY_UNKNOWN: '未知顶级分类',
      CHANNEL_SUBCATEGORY_UNKNOWN: '未知子分类',
      CHANNEL_CATEGORY_TOO_DEEP: '分类最多两级',
      EPISODE_MISSING: '缺少单集数据',
      EPISODE_TITLE_REQUIRED: '单集标题不能为空',
      EPISODE_TITLE_TOO_LONG: '单集标题超出长度上限',
      EPISODE_DESC_TOO_LONG: '单集简介超出长度上限',
      EPISODE_SUBTITLE_TOO_LONG: '单集副标题超出长度上限',
      EPISODE_AUDIO_REQUIRED: '缺少音频地址：请填写 https 直链，或先配置托管直传',
      EPISODE_AUDIO_NOT_HTTPS: '音频必须使用 https 绝对地址',
      EPISODE_HOSTING_NOT_CONFIGURED: '仅有本地文件，尚未配置托管直传，无法生成公开音频地址',
      EPISODE_DURATION_INVALID: '时长须为规定范围内的整数秒',
      EPISODE_SIZE_INVALID: '字节数须为正整数',
      EPISODE_SIZE_REQUIRED: '必须填写音频字节数（enclosure length）',
      EPISODE_EXPLICIT_INVALID: '单集分级取值不合法（yes/no/clean）',
      EPISODE_TYPE_INVALID: '单集类型取值不合法（full/trailer/bonus）',
      EPISODE_PUBDATE_INVALID: '发布时间无法解析',
      EPISODE_COVER_NOT_HTTPS: '单集封面必须使用 https 绝对地址',
      EPISODE_MIME_INVALID: '音频 MIME 类型不受支持',
      EPISODE_GUID_TOO_LONG: 'GUID 过长',
      EPISODE_NUMBER_INVALID: '期号须为正整数',
      EPISODE_SEASON_INVALID: '季号须为正整数',
      EPISODES_EMPTY: '还没有单集：feed 至少需要一个单集',
      EPISODES_TOO_MANY: '单集数量超过上限',
      EPISODE_DUPLICATE: '存在重复的 guid 或音频地址',
      FEED_NO_ITEMS: 'Feed 中没有任何单集',
      FEED_MISSING_ITUNES_NS: 'Feed 缺少 itunes 命名空间',
      FEED_MISSING_XML_DECL: 'Feed 缺少 XML 声明',
      ENCLOSURE_MISSING: '存在缺少 enclosure 的单集',
      ENCLOSURE_NOT_HTTPS: '存在非 https 的 enclosure',
      ENCLOSURE_UNREACHABLE: '音频地址不可达，请检查托管或直链是否过期',
      ENCLOSURE_TYPE_MISMATCH: 'enclosure 指向的资源不是音频',
      ENCLOSURE_LENGTH_MISMATCH: '声明的字节数与实际大小不一致',
      DURATION_MISSING: '有单集缺少时长',
      fallback: '发生未知问题（{code}）',
    },
  },

}
