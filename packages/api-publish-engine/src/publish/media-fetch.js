'use strict'
/**
 * 媒体 URL 拉取（决策 D1 的「URL 模式」）
 *
 * 平台链以 `fs.readFileSync(taskData.video.path)` 读本地文件，调用方与服务端不在
 * 同一文件系统，故 HTTP 发布面需要一条「把远端媒体落到本地再交给平台链」的通道。
 *
 * 四道防线，逐条对应一类已知事故模式：
 *   1. SSRF —— 共用 ssrf-guard（私有/保留网段、localhost、URL 内嵌凭据、
 *      **以及 DNS 解析结果逐个校验**；只做静态检查会漏掉「公网域名→127.0.0.1」）。
 *   2. 体积上限 —— 边收边计数，超限即中止。不设上限则超大文件会把服务打死。
 *   3. 临时文件生命周期 —— mkdtemp 独立目录 + 显式清理；成功、失败、异常都清。
 *   4. 失败不留痕 —— 中途失败要删掉半截文件，否则临时目录逐次累积。
 *
 * ⚠️ 本模块只把远端媒体变成**本地可读文件**，不解析内容、不信任媒体类型声明。
 * 平台链照旧按自己的协议处理；若某天需要按 MIME 决定分支，那属于平台链职责。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { assertOutboundUrl } = require("../ssrf-guard");
const { errorCode } = require("../error-codes");

/** 单个媒体文件的体积上限（默认 512 MiB）。够覆盖绝大多数短视频，又不至于打死进程。 */
const DEFAULT_MAX_MEDIA_BYTES = 512 * 1024 * 1024;

/** 单次拉取允许的最大重定向跳数。超过即失败——防自重定向/跳转环导致的无限爬取。 */
const MAX_REDIRECTS = 5;

/** 从 URL 或 Content-Type 推断扩展名；无法判定时用 .bin（平台链通常不依赖扩展名）。 */
function extensionFor (contentType, url) {
  var type = String(contentType || "").split(";")[0].trim().toLowerCase();
  var map = {
    "video/mp4": ".mp4", "video/quicktime": ".mov", "video/x-matroska": ".mkv",
    "video/webm": ".webm", "image/jpeg": ".jpg", "image/png": ".png",
    "image/gif": ".gif", "image/webp": ".webp",
  };
  if (map[type]) return map[type];
  try {
    var ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  } catch (e) { /* URL 已校验过，这里只是取扩展名，取不到无所谓 */ }
  return ".bin";
}

/**
 * 只认 SSRF 已校验过的地址的 lookup。
 *
 * 用途：消除「校验时解析一次、连接时又解析一次」的 TOCTOU 窗口。DNS rebinding
 * 场景下攻击者让第一次解析答公网（通过校验）、第二次答内网（连接），SSRF 防护
 * 就被完全绕开——这不是「DNS 层的问题」，而是本模块必须自己钉住的。
 *
 * https 时 Node 用 `servername` 做 SNI 与证书校验，与实际连到哪个 IP 无关，
 * 故钉 IP 不会破坏 TLS。
 */
function makePinnedLookup (hostname, addresses) {
  const list = Array.isArray(addresses) && addresses.length ? addresses : [hostname];
  let i = 0;
  return function pinnedLookup (host, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const addr = list[i++ % list.length];
    const family = require("net").isIP(addr);
    if (typeof options === "object" && options && options.all) {
      cb(null, list.map((a) => ({ address: a, family: require("net").isIP(a) })));
      return;
    }
    cb(null, addr, family);
  };
}

function mediaError (message, code) {
  const err = new Error(message);
  err.code = code === undefined ? errorCode.request_error : code;
  return err;
}

/**
 * 把远端媒体下载到临时目录。
 *
 * @param {string} url  http/https URL
 * @param {{maxBytes?:number, timeoutMs?:number, lookup?:Function, label?:string}} [opts]
 * @returns {Promise<{path:string, bytes:number, contentType:string, cleanup:Function}>}
 *          cleanup 必须被调用（finally），否则临时文件泄漏
 */
async function fetchMediaToTemp (url, opts) {
  opts = opts || {};

  const label = opts.label || "media";
  const maxBytes = opts.maxBytes || DEFAULT_MAX_MEDIA_BYTES;
  const timeoutMs = opts.timeoutMs || 60000;

  // 防线 1：SSRF（含 DNS 解析结果）。**必须钉住 addresses**——
  // 校验与连接之间若各解析一次，中间存在 TOCTOU 窗口（DNS rebinding）：
  // 校验那次答公网、连接那次答内网，SSRF 被完全绕过（已实测从内网读出数据）。
  const verified = await assertOutboundUrl(url, { label: label + " URL", lookup: opts.lookup });
  const parsed = verified.url;
  const verifiedAddresses = verified.addresses;

  const transport = parsed.protocol === "https:" ? https : http;
  const headers = { Accept: "*/*", "User-Agent": "multi-publish-engine/media-fetch" };
  if (opts.headers && typeof opts.headers === "object") {
    for (const k of Object.keys(opts.headers)) headers[k] = opts.headers[k];
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let dir = null;
    let req = null;
    // 重定向跳数上限。此前**没有任何跳数限制**——注释写着「3xx 未给 Location
    // 直接判失败，不做无限跳」，但那是两回事：自重定向（Location 指回自己）
    // 每跳都会真实做一次 DNS 查询 + 新建 TCP 连接，永不 settle，finally 永不执行。
    // 实测 maxBytes=1024 时 6 秒跳 4395 次、服务端吐约 900MB（3xx 体不计入上限）。
    const hops = Number.isInteger(opts.hops) ? opts.hops : 0;
    if (hops >= MAX_REDIRECTS) {
      reject(mediaError(label + " exceeded max redirects (" + MAX_REDIRECTS + ")", errorCode.request_error));
      return;
    }

    /** 统一出口：无论哪条路径失败，先清临时目录再抛，避免半截文件残留。 */
    const fail = (err) => {
      if (settled) return;
      settled = true;
      if (req) { try { req.destroy(); } catch (e) { /* 已结束 */ } }
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 尽力清理 */ } }
      reject(err);
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    req = transport.request(
      {
        protocol: parsed.protocol,
        // __connectHost 仅测试用；正常路径取自已通过 SSRF 校验的 hostname
        hostname: (opts.__connectHost || parsed.hostname).replace(/^\[|\]$/g, ""),
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers,
        // 测试专用连接目标覆盖。仅供本包测试把公网域名指向本机假服务器使用。
        // **绝不**从请求体/配置读取（见 assertNoTestHookFromBody 的守卫），
        // 生产路径下 opts 只能来自代码常量，调用方无法触达。
        ...(opts.__connectHost ? { host: opts.__connectHost } : {}),
        // **把 SSRF 已校验过的地址钉到连接上**，消除 rebinding 窗口。
        // 实现方式是给 http.request 一个只认这些地址的 lookup：Node 会用它
        // 决定连哪个 IP（SNI/certificate 仍走原 hostname，不受影响）。
        lookup: makePinnedLookup(parsed.hostname, verifiedAddresses),
        // ⚠️ 测试钩子 __connectHost 优先于上面那个（仅本包测试可用）。
        //
        // 注入的 lookup 是给 SSRF 校验用的（回答「这个域名解析到哪」），
        // 而 http.request 拿同一个 lookup 是去**建立连接**的——一旦注入的是
        // 假地址（如测试里用 93.184.216.34），连接就会打到一个根本不监听该地址
        // 的主机上，表现为永久挂起直到超时。
        //
        // 上面这个 makePinnedLookup 就是「用真实 DNS 判定后的地址」——不再让
        // http.request 自行解析一次（那会重开 rebinding 窗口）。
        // 代价：公网域名无法直接指向本机假服务器，故测试需要 __connectHost
        // 把连接目标改到本机；该键外部不可触达（见调用图：两个 HTTP 入口都只传
        // body，不传 fetchOpts）。
        //
        // 测试钩子 __connectHost 优先于上面的钉住地址（仅本包测试可用）。
      },
      (res) => {
        const status = res.statusCode || 0;
        // 只跟随 30x；3xx 未给 Location 直接判失败，不做无限跳
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          // 跳转目标必须重新过一遍 SSRF：这是最经典的绕过口（首跳合法、二跳内网）
          // 3xx 的响应体不喂给媒体文件，但仍必须 resume 掉，否则 socket 挂起；
          // 它不计入 maxBytes —— 本服务只对**最终落盘的文件**设上限，中间跳转体
          // 由上游服务器自己控制，跳数上限（MAX_REDIRECTS）才是这里的实际防线。
          // ⚠️ 必须包 try/catch：`new URL()` 对畸形 Location（如 `http://[`）
          // 会**同步抛出**。它在 http response 事件回调里，逃出去就是
          // uncaughtException —— 而引擎全局没有 uncaughtException 处理器，
          // 等于一个请求（甚至一次磁盘写满）就能终结整个多租户发布 API。
          let nextUrl
          try {
            nextUrl = new URL(res.headers.location, parsed.href).href
          } catch (e) {
            fail(mediaError(label + " redirect Location is malformed: " + res.headers.location, errorCode.request_error))
            return
          }
          fetchMediaToTemp(nextUrl, Object.assign({}, opts, { hops: hops + 1 }))
            .then(done, fail)
            .catch(fail)
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          fail(mediaError(label + " URL returned HTTP " + status, errorCode.request_error));
          return;
        }

        // 防线 2：体积上限边收边计数，不信任 Content-Length（可伪造/可缺失）
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.resume();
          fail(mediaError(
            label + " exceeds maxBytes (" + declared + " > " + maxBytes + ")",
            errorCode.data_error));
          return;
        }

        // 同理：mkdtempSync 在磁盘满 / /tmp 只读 / fd 耗尽时会同步抛，
        // 也是常规运维事件，不该带走整个进程。
        try {
          dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-media-"));
        } catch (e) {
          res.resume()
          fail(mediaError(label + " cannot create temp dir: " + (e && e.code ? e.code : e.message), errorCode.io_error))
          return
        }
        const file = path.join(dir, "asset" + extensionFor(res.headers["content-type"], parsed.href));

        let bytes = 0;
        const out = fs.createWriteStream(file);
        let writeErr = null;
        res.on("data", (chunk) => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > maxBytes) {
            writeErr = mediaError(
              label + " exceeds maxBytes (streamed past " + maxBytes + ")",
              errorCode.data_error);
            res.destroy();
            try { out.destroy(); } catch (e) { /* 已关闭 */ }
            fail(writeErr);
            return;
          }
          out.write(chunk);
        });
        res.on("error", (e) => fail(mediaError(label + " stream error: " + e.message, errorCode.request_error)));
        out.on("error", (e) => fail(mediaError(label + " write error: " + e.message, errorCode.io_error)));
        // res 读完 → 关闭 WriteStream。
        // 手动 out.write 的模式下必须显式 end()：此前依赖 res.pipe(out) 代劳，
        // 去掉 pipe 后若不 end，WriteStream 永不收尾，finish/close 都不触发，
        // 请求会挂到超时。
        res.on("end", () => { try { out.end(); } catch (e) { fail(mediaError(label + " stream close error: " + e.message, errorCode.io_error)); } });
        // ⚠️ 必须等 'close'（fd 已释放、数据已落盘）才交出路径，不能只等 'finish'。
        // finish 只保证数据已交给 WriteStream，缓冲区可能尚未 flush；此时调用方
        // 紧接着 readFileSync 会读到短文件——实测出现字节序列异常。
        out.on("close", () => {
          if (settled) return;
          done({
            path: file,
            bytes: bytes,
            contentType: res.headers["content-type"] || "",
            // 显式交还清理权：调用方必须在 finally 里调用，失败路径已由 fail 兜底
            cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* 已清理 */ } },
          });
        });
        // ⚠️ **不要**再调 res.pipe(out)。
        // 上面已在 'data' 里手动 out.write(chunk)（体积上限必须边收边判，
        // pipe 会绕开这个计数），若同时 pipe 同一数据流，每个 chunk 会被写两遍
        // ——落盘字节翻倍，且平台链拿到的是损坏媒体。两者只能取其一。
      }
    );

    // 防线 3 的一部分：超时兜底，避免慢速 drip 长期占住 socket
    req.setTimeout(timeoutMs, () => {
      fail(mediaError(label + " URL timed out after " + timeoutMs + "ms", errorCode.request_error));
    });
    req.on("error", (e) => fail(mediaError(label + " request error: " + e.message, errorCode.request_error)));
    req.end();
  });
}

/**
 * 便捷包装：拉取并返回 taskData 形状所需的本地路径 + 自动清理函数。
 * 供 HTTP 发布面把 body.video_url / body.cover_url 翻译成平台链认识的本地路径。
 */
async function resolveMediaRef (url, opts) {
  return fetchMediaToTemp(url, opts);
}

/** 批量拉取（图文多图场景）；任一失败则全部清理并抛错，不留半截产物。 */
async function fetchMediaSetToTemp (urls, opts) {
  opts = opts || {};
  const items = Array.isArray(urls) ? urls : [];
  const fetched = [];
  try {
    for (let i = 0; i < items.length; i++) {
      // 逐项透传 opts：lookup / __connectHost / maxBytes / headers 都必须带下去，
      // 否则批量路径与单项路径行为不一致（测试里表现为第 2 项起 SSRF 判定失败）。
      fetched.push(await fetchMediaToTemp(items[i], Object.assign({}, opts, { label: (opts.label || "media") + "[" + i + "]" })));
    }
  } catch (e) {
    fetched.forEach((f) => { try { f.cleanup(); } catch (x) { /* 尽力清理 */ } });
    throw e;
  }
  return {
    paths: fetched.map((f) => f.path),
    cleanup: () => fetched.forEach((f) => { try { f.cleanup(); } catch (x) { /* 尽力清理 */ } }),
  };
}

module.exports = {
  MAX_REDIRECTS,
  fetchMediaToTemp,
  fetchMediaSetToTemp,
  resolveMediaRef,
  DEFAULT_MAX_MEDIA_BYTES,
  extensionFor,
};