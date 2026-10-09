/**
 * tagSuggest 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    title: '智能标签建议',
    tabAll: '汇总',
    moreTags: '完整标签见「{platform}」标签页',
    contentTags: '内容标签（描述文章主题）',
    trafficTags: '流量标签（关联热门话题）',
    platformTags: '各平台标签',
    copyTags: '复制标签',
    loadingAI: 'AI 正在分析标签...',
    loadingLocal: '正在提取关键词...',
    sourceAI: 'AI 生成',
    sourceLocal: '本地摘词',
    calibrated: '热门库校准 ✓',
    notCalibrated: '未校准',
    aiNotConfigured: 'AI 未配置',
    fallbackNotice: 'AI 生成失败，已切换到本地摘词模式',
    hotMatch: '匹配热门话题: {tag}（热度 {heat}）',
    emptyContent: '输入内容后自动分析标签',
    analysisFailed: '标签分析失败',
    retry: '重试',
    applyTagHint: '点击填入标签',
    tagsCopied: (ctx) => '已复制 ' + ctx.named('platform') + ' 标签',
  }
