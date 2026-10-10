/**
 * pipelineSelector 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    retry: 'Retry',
    stages: (ctx) => ctx.named('count') + ' stages',
    catGenerated: 'AI Generated',
    catTalkingHead: 'Talking Head',
    catCinematic: 'Cinematic',
    catAnimation: 'Animation',
    catScreenRecording: 'Screen Recording',
    catHybrid: 'Hybrid',
    catCustom: 'Custom',
    costLow: 'Low cost',
    costMedium: 'Medium',
    costHigh: 'High cost',
    available: 'Available',
    inDevelopment: 'In Development',
    availableHint: 'Pipeline available',
    inDevelopmentHint: 'In development, not available yet',
    textIneligible: 'This pipeline type is not applicable',
  }
