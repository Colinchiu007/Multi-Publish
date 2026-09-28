'use strict'
/**
 * article → API taskData 形状翻译（单一实现）
 *
 * 消费方：publisher-router（API 直调）与 rpa-view-manager（API-first 分支）。
 *
 * 根因（2026-09-28 活体取证，live-acceptance-pass-20260928.md 残余①）：
 * RpaView 的 API-first 分支曾把裸 article 直接传给 publishViaApi——适配器
 * 契约要求 taskData.video.path（嵌套对象）而 article 是扁平 video_path 字段，
 * kuaishou/bilibili 等视频平台 API 轨全部 fail-closed
 * （`taskData.video.path required`）并回退 DOM 轨。publisher-router 一直
 * 正确构造 taskData（内联映射），本模块把该映射提取为两路共用的单一实现。
 *
 * 形状契约（与适配器校验对齐）：
 * - 视频模式（article.video_path 存在）：taskData.video.path 必填；
 *   duration/width/height 可选（快手/B站链实测只消费 path），缺省 0。
 * - 图文模式：images/author 透传（百家号/头条文章链消费）。
 * - 平台特有字段透传清单与 publisher-router 既有清单逐项一致。
 */
function buildApiTaskData (article, videoInfo) {
  article = article || {}
  videoInfo = videoInfo || null

  const taskData = {
    title: article.title,
    content: article.content,
    tags: article.tags,
    draft: article.draft === true,
    // AI 生成内容声明：默认勾选（AI 生成内容），仅显式 false 时取消勾选
    aiGenerated: article.aiGenerated !== false,
  }

  const videoPath = article.video_path
  if (videoPath) {
    taskData.video = {
      path: videoPath,
      duration: Number(videoInfo && videoInfo.duration) || 0,
      width: Number(videoInfo && videoInfo.width) || 0,
      height: Number(videoInfo && videoInfo.height) || 0,
    }
    if (article.cover_path) taskData.cover = article.cover_path
  } else {
    // 图文：正文内联图片与作者透传给文章链消费
    if (Array.isArray(article.images) && article.images.length) taskData.images = article.images
    if (article.author) taskData.author = article.author
  }

  // 平台特有字段透传到 API taskData（adapter 按需消费；B站 tid/copyright、
  // YouTube categoryId/privacy、TikTok privacy_level、百家号 original/location）
  // P2-1 合集/播放列表、P3-1/P3-2/P3-4 商品/任务透传——清单与 publisher-router 一致
  const PASSTHROUGH_KEYS = [
    'category', 'copyright', 'categoryId', 'privacy', 'privacyLevel',
    'original', 'location',
    'collectionId', 'playlistId', 'collection',
    'goods', 'taskId',
  ]
  for (const key of PASSTHROUGH_KEYS) {
    if (article[key] !== undefined) taskData[key] = article[key]
  }

  return taskData
}

module.exports = { buildApiTaskData }
