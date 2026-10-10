/**
 * publishType 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    title: '选择发布类型',
    close: '关闭',
    supportCount: (ctx) => '支持平台 (' + ctx.named('count') + ')',
    supportedAria: '支持的平台',
    typeVideo: '视频发布',
    typeImage: '图文发布',
    typeArticle: '文章发布',
    typeArticleImage: '图文文章发布',
    typeWechat: '公众号',
  }
