/**
 * tagSuggest 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    title: 'Smart Tag Suggestions',
    tabAll: 'All',
    moreTags: 'Full tags in the {platform} tab',
    contentTags: 'Content tags (describe the article topic)',
    trafficTags: 'Traffic tags (related to trending topics)',
    platformTags: 'Per-platform tags',
    copyTags: 'Copy tags',
    loadingAI: 'AI is analyzing tags...',
    loadingLocal: 'Extracting keywords...',
    sourceAI: 'AI generated',
    sourceLocal: 'Local extraction',
    calibrated: 'Calibrated with hot library ✓',
    notCalibrated: 'Not calibrated',
    aiNotConfigured: 'AI not configured',
    fallbackNotice: 'AI generation failed, switched to local extraction',
    hotMatch: 'Matched trending topic: {tag} (heat {heat})',
    emptyContent: 'Tags are analyzed automatically after you enter content',
    analysisFailed: 'Tag analysis failed',
    retry: 'Retry',
    applyTagHint: 'Click to apply this tag',
    tagsCopied: (ctx) => 'Copied ' + ctx.named('platform') + ' tags',
  }
