/**
 * comments 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    tabTitle: (ctx) => ctx.named('platform') + '评论',
    openedInTab: '评论页已在顶部标签栏打开，点击上方标签即可查看',
    empty: {
      selectPlatform: {
        title: '选择平台',
        message: '从左侧选择一个平台查看评论',
      },
      unsupported: {
        title: '暂不支持',
        message: '{platform} 暂未配置评论页',
      },
    },
  }
