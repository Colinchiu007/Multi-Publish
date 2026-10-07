'use strict'
/**
 * 请求体媒体解析：本地路径 **或** URL
 *
 * 契约（2026-10-06 扩充）：
 *   ① `video_path` / `cover_path` —— 服务端本地路径（既有语义，未改）
 *   ② `video_url`  / `cover_url`  —— http(s) URL，由 media-fetch 拉取到临时目录
 *
 * ② 与 ① 同时给出时**拒绝**，不做「URL 优先」这类隐式仲裁：两种写法指向不同
 * 资源，静默取其一会让调用方以为自己控制的是另一个。
 *
 * 本模块只负责把媒体变成 taskData 能吃的本地路径；**临时文件的清理权交还调用方**
 * （返回的 cleanup 必须在 finally 里调用）。平台链读文件用
 * `fs.readFileSync(taskData.video.path)`，故必须在进入平台链之前就落盘。
 */
const { buildTaskDataFromRequest } = require("./publish-request");
const { fetchMediaToTemp, fetchMediaSetToTemp } = require("./media-fetch");

/** URL 类媒体字段 → taskData 里的目标字段（fetch 后要覆盖本地路径字段）。 */
const URL_FIELDS = [
  { url: "video_url", path: "video_path", label: "video" },
  { url: "cover_url", path: "cover_path", label: "cover" },
];

/**
 * 解析请求体媒体，返回 taskData 与清理函数。
 *
 * @param {object} body
 * @param {{maxBytes?:number, timeoutMs?:number}} [fetchOpts] 传给 media-fetch
 * @returns {Promise<{ok:true, taskData:object, cleanup:Function}
 *                 | {ok:false, status:number, error:number, message:string}>}
 *          **无论 ok 与否都必须调用 cleanup**（ok=false 时为 no-op）
 */
async function resolveRequestMedia (body, fetchOpts) {
  body = body && typeof body === "object" ? body : {};

  // 路径与 URL 同时给 → 拒绝，不做隐式仲裁
  for (const f of URL_FIELDS) {
    const hasUrl = typeof body[f.url] === "string" && body[f.url].trim() !== "";
    const hasPath = typeof body[f.path] === "string" && body[f.path].trim() !== "";
    if (hasUrl && hasPath) {
      const r = {
        ok: false, status: 400, error: require("../error-codes").errorCode.data_error,
        message: f.url + " and " + f.path + " are mutually exclusive",
      };
      r.cleanup = () => {};
      return r;
    }
  }

  // 图文模式的 images 同样支持 URL 数组
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls : null;
  if (imageUrls && Array.isArray(body.images) && body.images.length) {
    const r = {
      ok: false, status: 400, error: require("../error-codes").errorCode.data_error,
      message: "image_urls and images are mutually exclusive",
    };
    r.cleanup = () => {};
    return r;
  }

  const local = buildTaskDataFromRequest(body);
  if (!local.ok) {
    local.cleanup = () => {};
    return local;
  }

  const taskData = local.taskData;
  const fetched = [];
  const cleanup = () => {
    fetched.forEach((f) => { try { f.cleanup(); } catch (e) { /* 尽力清理 */ } });
    fetched.length = 0;
  };

  try {
    // 先 URL 后本地路径覆盖：URL 拉下来的临时文件写回 taskData 对应字段，
    // 形状翻译（buildApiTaskData）已经把它们当作本地路径处理过一轮，
    // 故这里只需把 URL 结果落到同名字段，**不重跑翻译**（重跑会丢 draft/aiGenerated
    // 等开关，也会造成两次形状推导）。
    for (const f of URL_FIELDS) {
      const raw = body[f.url];
      if (typeof raw !== "string" || raw.trim() === "") continue;
      const r = await fetchMediaToTemp(raw, Object.assign({}, fetchOpts, { label: f.label }));
      fetched.push(r);
      // URL 模式下 body 里没有本地路径，形状翻译不会产出 video/cover，
      // 故这里**直接建形状**（而不是改一个不存在的字段）。
      // 平台链只消费 taskData.video.path / taskData.cover。
      if (f.label === "video") {
        taskData.video = { path: r.path, duration: 0, width: 0, height: 0 };
      } else if (f.label === "cover") {
        taskData.cover = r.path;
      }
    }

    if (imageUrls && imageUrls.length) {
      const set = await fetchMediaSetToTemp(imageUrls, Object.assign({}, fetchOpts, { label: "image" }));
      fetched.push(set); // set 自身带 cleanup，形态一致
      taskData.images = set.paths;
    }
  } catch (e) {
    cleanup();
    const r = {
      ok: false,
      status: 400,
      error: typeof e.code === "number" ? e.code : require("../error-codes").errorCode.request_error,
      message: e.message,
    };
    r.cleanup = () => {};
    return r;
  }

  // buildApiTaskData 只产出 `video` 嵌套形状，**不**保留扁平的 `video_path`。
  // URL 模式下我用 taskData[f.path] 写回路径，对 video 而言那个键是 `video_path`
  // ——它此前不存在，于是静默写进了一个无人消费的新字段，真身 `video.path`
  // 仍指向原始（不存在）的值。修：video/cover 一律写回 `video`/`cover`，
  // 扁平路径字段只在本地路径模式下由调用方自行持有。
  if (fetched.length && taskData.video && taskData.video_path === undefined) {
    // video 形状已在上方 URL_FIELDS 循环里更新过；此处仅防御 video 缺失
    if (!taskData.video) taskData.video = { path: null, duration: 0, width: 0, height: 0 };
  }

  return { ok: true, taskData: taskData, cleanup: cleanup };
}

module.exports = { resolveRequestMedia, URL_FIELDS };