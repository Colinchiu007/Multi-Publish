/**
 * publishHistory 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    empty: {
      records: {
        title: 'No publish history yet',
        message: 'Nothing has been published yet. After publishing you can review performance here',
        action: 'Create publish task',
      },
      filtered: {
        title: 'No matching records',
        message: 'No record matches the current filters — clear them to see all records',
        action: 'Clear filters',
      },
      drafts: {
        title: 'No drafts yet',
        message: 'Content being edited is saved as a draft so you can continue later',
        action: 'Create publish task',
      },
    },
  }
