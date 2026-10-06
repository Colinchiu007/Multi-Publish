'use strict'
/**
 * HTTP 发布请求体 → 适配器 taskData
 *
 * 消费方：publish-api-server 的 POST /api/v1/publish 与 POST /api/v1/batch-publish。
 *
 * ── 契约（2026-10-06 冻结）────────────────────────────────────────────
 *
 * ① 请求体采用**扁平的 article 形状**，与桌面端 publisher-router 喂给
 *    buildApiTaskData 的形状逐字段一致（video_path / cover_path / images /
 *    author / draft / aiGenerated / 平台特有字段）。不为 HTTP 另造一套形状——
 *    那正是 2026-09-28「RpaView 裸传 article 导致视频平台 API 轨 fail-closed」
 *    那类漂移事故的成因。
 *
 * ② 媒体语义为**服务端本地路径**。适配器以 fs.readFileSync(taskData.video.path)
 *    读文件，调用方与服务端不在同一文件系统。URL 拉取（下载 + SSRF 防护 +
 *    体积上限 + 临时文件生命周期）是**独立后续项**，本模块刻意不假装支持：
 *    传入无法在服务端解析的路径时明确报错，而不是让请求走到链路深处才失败。
 *
 * ③ 本层**不复制平台知识**。哪些平台强制要求视频、哪些只收图文，由各 adapter
 *    自己 fail-closed 判定；HTTP 层不维护第二份平台能力表。
 *
 * 返回形状：{ ok: true, taskData } | { ok: false, status, error, message }
 */

const fs = require("fs");
const { errorCode } = require("../error-codes");
const { buildApiTaskData } = require("./task-data");

/** 请求体里允许直接透传给 article 的媒体与开关字段。
 * 刻意采用白名单：未声明字段不进 taskData（与 buildApiTaskData 的
 * PASSTHROUGH_KEYS 同源同精神——防请求体杂字段泄漏进发布链。 */
const ARTICLE_KEYS = [
  "title", "content", "tags", "author", "images",
  "video_path", "cover_path",
  "duration", "width", "height",
  "draft", "aiGenerated",
  // 平台特有透传（与 task-data.js 的 PASSTHROUGH_KEYS 对齐）
  "category", "copyright", "categoryId", "privacy", "privacyLevel",
  "original", "location",
  "collectionId", "playlistId", "collection",
  "goods", "taskId",
];

function fail (status, error, message) {
  return { ok: false, status: status, error: error, message: message };
}

/** 类型守卫：必须是字符串且 trim 后非空。 */
function isNonEmptyString (v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * 校验一个服务端需可读的媒体路径。
 * 只做「能否解析到可读文件」这一层；大小/时长/分辨率交给适配器与视频探测。
 */
function assertReadableFile (value, field) {
  if (!isNonEmptyString(value)) {
    return fail(400, errorCode.data_error, field + " must be a non-empty string");
  }
  if (!fs.existsSync(value)) {
    // 不回显原始路径之外的信息；但路径本身是调用方自己给的，回显有助于定位
    return fail(400, errorCode.io_error, field + " not found on server filesystem: " + value);
  }
  let st;
  try {
    st = fs.statSync(value);
  } catch (e) {
    return fail(400, errorCode.io_error, field + " is not readable on server filesystem: " + value);
  }
  if (!st.isFile()) {
    return fail(400, errorCode.io_error, field + " must point to a file, not a directory");
  }
  return null;
}

/**
 * 把 HTTP 请求体翻译成适配器 taskData。
 *
 * @param {object} body  已 JSON.parse 的请求体
 * @returns {{ok:true, taskData:object}|{ok:false, status:number, error:number, message:string}}
 */
function buildTaskDataFromRequest (body) {
  body = body && typeof body === "object" ? body : {};

  // --- 数组类字段的类型校验（早失败优于让适配器拿到脏数据） ---
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    return fail(400, errorCode.data_error, "tags must be an array");
  }
  if (body.images !== undefined && !Array.isArray(body.images)) {
    return fail(400, errorCode.data_error, "images must be an array");
  }

  // --- 媒体路径必须在服务端可解析（契约②） ---
  if (body.video_path !== undefined && body.video_path !== null && body.video_path !== "") {
    const bad = assertReadableFile(body.video_path, "video_path");
    if (bad) return bad;
  }
  if (body.cover_path !== undefined && body.cover_path !== null && body.cover_path !== "") {
    const bad = assertReadableFile(body.cover_path, "cover_path");
    if (bad) return bad;
  }

  // --- 白名单投影成 article，未声明字段一律丢弃 ---
  const article = {};
  for (const key of ARTICLE_KEYS) {
    if (body[key] !== undefined) article[key] = body[key];
  }

  // 缺省值与桌面端 article 语义对齐：tags 恒为数组，缺省空数组
  if (!Array.isArray(article.tags)) article.tags = [];
  if (article.title === undefined || article.title === null) article.title = "";
  if (article.content === undefined || article.content === null) article.content = "";

  // 视频探测信息：HTTP 侧拿不到 ffprobe（那是桌面端的职责），
  // 时长/宽高按 0 传递——快手/B站链实测只消费 path（见 task-data.js 契约注释）。
  const videoInfo = {
    duration: Number(article.duration) || 0,
    width: Number(article.width) || 0,
    height: Number(article.height) || 0,
  };

  return { ok: true, taskData: buildApiTaskData(article, videoInfo) };
}

module.exports = { buildTaskDataFromRequest, ARTICLE_KEYS };