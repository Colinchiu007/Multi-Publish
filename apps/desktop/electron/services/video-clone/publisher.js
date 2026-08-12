// @ts-check
/**
 * 视频克隆 publisher adapter（切片 4c）
 * - 无 publisherRouter / 未启用 → { status: 'skipped', reason: 'no-publisher-router' }（不失败）
 * - 有 router → 构造发布任务并调用 router.publish；抛错 → VIDEOCLONE_PUBLISH_FAILED
 * 注：真实账号/平台发布属外部验收（PublisherRouter 契约），本层仅接线契约。
 */
function createVideoClonePublisher({ publisherRouter = null, enabled = true } = {}) {
  return async ({ media, report }) => {
    if (enabled !== true || !publisherRouter || typeof publisherRouter.publish !== 'function') {
      return { status: 'skipped', reason: 'no-publisher-router' }
    }
    try {
      const task = {
        title: (report && report.narrative && report.narrative.plot) || '视频克隆成片',
        content: (report && report.script && report.script.fullText) || '',
        video_path: media && media.path,
        platform: [],
        accounts: [],
        source: 'video-clone',
      }
      const result = await publisherRouter.publish(task)
      return { status: 'published', raw: result }
    } catch (e) {
      const err = new Error(e && e.message)
      err.code = 'VIDEOCLONE_PUBLISH_FAILED'
      throw err
    }
  }
}

module.exports = { createVideoClonePublisher }
