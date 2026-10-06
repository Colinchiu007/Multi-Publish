'use strict'
/**
 * article → API taskData 形状翻译（薄转发）
 *
 * ⚠️ 权威实现在 @multi-publish/api-publish-engine 的 src/publish/task-data.js，
 *    本文件只做转发。请勿在此重新实现形状翻译。
 *
 * 历史（本文件曾是单一实现，2026-10-06 下沉到引擎包）：
 *   2026-09-28 活体取证（live-acceptance-pass-20260928.md 残余①）——
 *   RpaView 的 API-first 分支曾把裸 article 直接传给 publishViaApi。适配器
 *   契约要求 taskData.video.path（嵌套对象），而 article 是扁平 video_path
 *   字段，kuaishou/bilibili 等视频平台 API 轨全部 fail-closed
 *   （`taskData.video.path required`）并回退 DOM 轨。当时把 publisher-router
 *   的内联映射提取到本文件，供 publisher-router 与 rpa-view-manager 两路共用。
 *
 * 为何继续下沉（2026-10-06）：
 *   HTTP 发布 API（publish-api-server 的 /api/v1/publish 与 /api/v1/batch-publish）
 *   是**第三条**喂 taskData 的路径。若服务端另写一份映射，就等于埋下第三份实现，
 *   重复放大上面那次形状漂移事故的风险面。引擎不依赖 desktop、desktop 依赖引擎，
 *   依赖方向决定了权威实现只可能在引擎侧。
 *
 * 保留本文件的原因：publisher-router / rpa-view-manager 及既有测试均按此路径
 * require（`./api-task-data`），转发可让三路共用同一实现且不扰动调用方。
 */
const { buildApiTaskData } = require('@multi-publish/api-publish-engine/src/publish/task-data')

module.exports = { buildApiTaskData }