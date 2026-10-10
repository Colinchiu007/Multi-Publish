/**
 * projectLibrary 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    // Dangerous-action confirm gate (docs/frontend-interaction-spec.md §2, 2026-09-16)
    deleteConfirmTitle: 'Delete project',
    deleteConfirmMessage: 'About to permanently delete the project "{name}". Its board and production records will be removed and this cannot be undone.',
    deleteConfirmButton: 'Delete',
    empty: {
      title: 'No projects yet',
      message: 'Project archives will appear here after your first video production',
      action: 'Browse pipelines',
    },
  }
