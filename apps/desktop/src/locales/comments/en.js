/**
 * comments 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    tabTitle: (ctx) => ctx.named('platform') + ' comments',
    openedInTab: 'The comments page is open in the tab bar above — click its tab to view it',
    empty: {
      selectPlatform: {
        title: 'Select a platform',
        message: 'Choose a platform on the left to view its comments',
      },
      unsupported: {
        title: 'Not supported yet',
        message: '{platform} has no comments page configured',
      },
    },
  }
