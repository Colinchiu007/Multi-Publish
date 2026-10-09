/**
 * projectLibrary 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    // 危险操作确认门禁（docs/frontend-interaction-spec.md §2，2026-09-16）
    deleteConfirmTitle: '删除项目',
    deleteConfirmMessage: '即将永久删除项目「{name}」，该项目下的看板与生产记录会一并移除，且不可恢复。',
    deleteConfirmButton: '确认删除',
    empty: {
      title: '暂无项目',
      message: '开始第一次视频生产后，项目档案会显示在这里',
      action: '浏览流水线',
    },
  }
