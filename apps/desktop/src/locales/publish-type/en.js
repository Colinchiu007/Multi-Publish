/**
 * publishType 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    title: 'Select publish type',
    close: 'Close',
    supportCount: (ctx) => 'Supported platforms (' + ctx.named('count') + ')',
    supportedAria: 'Supported platforms',
    typeVideo: 'Video publish',
    typeImage: 'Image & text publish',
    typeArticle: 'Article publish',
    typeArticleImage: 'Article & image publish',
    typeWechat: 'WeChat Official Account',
  }
