'use strict'
/**
 * capabilities/index.js — 发布前能力面统一出口（W4 §2）
 *
 * 平台发布链回答「怎么发出去」；本模块回答「发之前能不能发、发的是谁、挂哪个位置」。
 * 两者此前割裂：permission/POI 全部内嵌在链的最后一步，失败点被推到「视频已传完」之后。
 *
 * 覆盖矩阵（每一格都必须有 01-docs/rpa-api-publish/evidence 下的取证来源，
 *            没有取证的格子一律标 null 并在 CAPABILITY_MATRIX 注明原因，
 *            **不要为了填满矩阵去编端点**）：
 *
 *   平台              userInfo  publishPermission  poi        草稿箱
 *   douyin              ✅          ✅                ✅          —
 *   tencent_video       ✅          ✅（登录态口径）   —           —
 *   bilibili            ✅          ✅（专栏权限）     —           —
 *   kuaishou            ✅          ✅（登录态口径）   —           —
 *   xiaohongshu         ✅          —（未取证）       —           —
 *   baijiahao           —           —                ✅          ✅
 *
 * 为什么视频号/快手的 publishPermission 只答「登录态」：切片里没有独立的
 * 「发布权限」端点（只有 auth_data / authority/account/current 这类账号权威接口）。
 * 把它如实标成登录态口径，并在 reason 里说清口径边界 —— 宁可少答，不可假装答过。
 */

const douyin = require('./douyin-capabilities')
const bilibili = require('./bilibili-capabilities')
const kuaishou = require('./kuaishou-capabilities')
const shipinhao = require('./shipinhao-capabilities')
const xiaohongshu = require('./xiaohongshu-capabilities')
const baijiahao = require('./baijiahao-capabilities')

/**
 * 平台 → 能力面构造器。
 * 键与 index.js 的 REGISTRY 同名（tencent_video 是外部名，模块文件名沿用既有惯例）。
 */
const CAPABILITY_FACTORIES = Object.freeze({
  douyin: douyin.DouyinCapabilities,
  kuaishou: kuaishou.KuaishouCapabilities,
  tencent_video: shipinhao.ShipinhaoCapabilities,
  bilibili: bilibili.BilibiliCapabilities,
  xiaohongshu: xiaohongshu.XiaohongshuCapabilities,
  baijiahao: baijiahao.BaijiahaoCapabilities,
})

/** 能力矩阵的事实声明，供 HTTP 面与门禁自检消费（避免「以为支持」）。 */
const CAPABILITY_MATRIX = Object.freeze({
  douyin: Object.freeze({
    userInfo: 'GET /aweme/v1/creator/user/info/',
    publishPermission: 'GET /aweme/v1/life/video_api/post/permission/',
    poiRecommend: 'GET /aweme/v1/poi/recommend/',
    drafts: null,
  }),
  tencent_video: Object.freeze({
    userInfo: 'POST /cgi-bin/mmfinderassistant-bin/auth/auth_data',
    publishPermission: 'POST /cgi-bin/mmfinderassistant-bin/auth/auth_data (登录态口径)',
    poiRecommend: null,
    drafts: null,
  }),
  bilibili: Object.freeze({
    userInfo: 'GET /x/web-interface/nav + /x/member/web/account',
    publishPermission: 'GET /x/article/is_author (专栏权限)',
    poiRecommend: null,
    drafts: null,
  }),
  kuaishou: Object.freeze({
    userInfo: 'POST /rest/v2/creator/pc/authority/account/current',
    publishPermission: 'POST /rest/v2/creator/pc/authority/account/current (登录态口径)',
    poiRecommend: null,
    drafts: null,
  }),
  xiaohongshu: Object.freeze({
    userInfo: 'GET /api/galaxy/user/info',
    publishPermission: null,
    poiRecommend: null,
    drafts: null,
  }),
  baijiahao: Object.freeze({
    userInfo: null,
    publishPermission: null,
    poiRecommend: 'POST /pcui/Brain/CoordRcmd',
    drafts: 'GET /pcui/article/lists',
  }),
})

/**
 * 各平台**是否有取证可判定登录失效**（与 CAPABILITY_MATRIX 分开声明，不混在同一层）。
 *
 * 为什么要单列：能力矩阵的键名是与 EXPOSED_CAPABILITIES 对齐的一套词汇
 * （根因锁 test/publish-api-capabilities.test.js 断言二者同源），把
 * 「登录态判定能力」这种元信息塞进平台行会引入第二套词汇，正是当初
 * 矩阵键写成 `poi` 导致路由穿透 null 守卫的同一类错误。
 *
 * false 的平台在 cookie 失效时只会返回通用 400，客户端拿不到 401——
 * 这是已知且如实声明的缺口，不是漏实现。无取证时把任意非零码猜成
 * 「未登录」比不判更危险：会诱导客户端无谓地换号重试。
 */
const LOGIN_DETECTION = Object.freeze({
  douyin: false,        // 切片只证到 status_code=110（风控），登录失效码无取证
  tencent_video: true,  // LOGIN_EXPIRED_CODES = [300333, 300334]
  bilibili: true,       // BILI_CODE.NOT_LOGIN(-101) 及 -1025/-1026
  kuaishou: true,       // result == 109
  xiaohongshu: false,   // 切片无登录态判定依据
  baijiahao: false,     // 切片无登录态判定依据
})

/** 该平台是否能把「登录失效」与普通业务错误区分开（true 时能力面返回 401）。 */
function canDetectLoginExpired (platform) {
  return LOGIN_DETECTION[platform] === true
}

/** 平台是否具备任一能力面。 */
function supportsCapabilities (platform) {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_FACTORIES, platform)
}

/**
 * 构造能力面实例。opts 透传给构造器（cookie / client / signer / finderId …）。
 * @returns {object|null} 不支持的平台返回 null（调用方据此报 404，不静默返回空对象）
 */
function getCapabilities (platform, opts) {
  if (!supportsCapabilities(platform)) return null
  const Factory = CAPABILITY_FACTORIES[platform]
  return new Factory(opts || {})
}

/** 该平台实际可调用的能力名（据矩阵推导，不硬编码第二份清单）。 */
function listCapabilities (platform) {
  const row = CAPABILITY_MATRIX[platform]
  if (!row) return []
  return Object.keys(row).filter((k) => row[k] !== null)
}

module.exports = {
  CAPABILITY_FACTORIES,
  LOGIN_DETECTION,
  canDetectLoginExpired,
  CAPABILITY_MATRIX,
  supportsCapabilities,
  getCapabilities,
  listCapabilities,
  douyin,
  bilibili,
  kuaishou,
  shipinhao,
  xiaohongshu,
  baijiahao,
}