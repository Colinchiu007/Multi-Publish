'use strict'

function emitStageProgress (onProgress, {
  percent,
  messageKey,
  messageParams,
  summaryKey,
  summaryParams,
  detail,
  message = 'Working…',
  summary,
}) {
  if (typeof onProgress !== 'function') return
  onProgress({
    percent,
    message,
    messageKey,
    ...(messageParams ? { messageParams } : {}),
    ...(summary ? { summary } : {}),
    ...(summaryKey ? { summaryKey } : {}),
    ...(summaryParams ? { summaryParams } : {}),
    ...(detail ? { detail } : {}),
  })
}

function emitStageStart (onProgress, options = {}) {
  emitStageProgress(onProgress, {
    percent: 0,
    messageKey: options.messageKey || 'stageProgress.stageWorking',
    messageParams: options.messageParams,
    message: options.message || 'Working…',
  })
}

function emitStageItem (onProgress, done, total, options = {}) {
  if (!Number.isInteger(done) || !Number.isInteger(total) || total < 1) return
  const percentStart = Number.isFinite(options.percentStart) ? options.percentStart : 0
  const percentEnd = Number.isFinite(options.percentEnd) ? options.percentEnd : 100
  const boundedStart = Math.max(0, Math.min(100, percentStart))
  const boundedEnd = Math.max(boundedStart, Math.min(100, percentEnd))
  emitStageProgress(onProgress, {
    percent: Math.round(boundedStart + Math.max(0, Math.min(done, total)) / total * (boundedEnd - boundedStart)),
    messageKey: options.messageKey || 'stageProgress.stageItems',
    messageParams: { ...(options.messageParams || {}), done, total },
    message: options.message || 'Processing items…',
    detail: { done: Math.max(0, Math.min(done, total)), total, kind: options.kind || 'segment' },
  })
}

function emitStageComplete (onProgress, options = {}) {
  emitStageProgress(onProgress, {
    percent: 100,
    messageKey: options.messageKey || 'stageProgress.stageComplete',
    messageParams: options.messageParams,
    summaryKey: options.summaryKey || 'stageProgress.stageSummary',
    summaryParams: options.summaryParams,
    message: options.message || 'Stage complete.',
    summary: options.summary || 'Stage complete.',
    detail: options.detail,
  })
}

module.exports = {
  emitStageProgress,
  emitStageStart,
  emitStageItem,
  emitStageComplete,
}
