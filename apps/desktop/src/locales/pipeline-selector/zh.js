/**
 * pipelineSelector 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    retry: '重试',
    stages: (ctx) => ctx.named('count') + ' 阶段',
    catGenerated: 'AI 生成',
    catTalkingHead: '说话头像',
    catCinematic: '电影感',
    catAnimation: '动画',
    catScreenRecording: '屏幕录制',
    catHybrid: '混合',
    catCustom: '自定义',
    costLow: '低消耗',
    costMedium: '中等',
    costHigh: '高消耗',
    available: '可用',
    inDevelopment: '开发中',
    availableHint: '流水线可用',
    inDevelopmentHint: '开发中，暂不可用',
    textIneligible: '该流水线类型不适用',
  }
