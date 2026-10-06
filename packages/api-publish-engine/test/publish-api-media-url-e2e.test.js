'use strict'
/**
 * HTTP 面端到端：URL 模式接入 /publish 与 /batch-publish 后，
 * 临时媒体必须在**任何**响应路径下都被清理（含 early return）。
 *
 * 动机：清理放在 finally 里，若有人日后把 finally 改成 catch、或在
 * finally 之前插入新的 early return，临时目录就会泄漏而单测察觉不到
 * （单测只验 resolveRequestMedia，不经过 HTTP 路由）。本测试从 HTTP 入口
 * 真跑一遍，并直接数 /tmp 下的残留目录。
 */
const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const { PublishApiServer } = require("../src/publish-api-server")

function mediaDirs () {
  return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-"))
}

function post (port, p, body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body)
    const req = http.request({
      hostname: "127.0.0.1", port, path: p, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(d) },
    }, (res) => {
      let data = ""
      res.on("data", (c) => { data += c })
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data || "{}") }) } catch (e) { resolve({ status: res.statusCode, body: data }) } })
    })
    req.on("error", reject)
    req.write(d)
    req.end()
  })
}

let pass = 0
let failCount = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log("  ✅ " + name) }
  catch (e) { failCount++; console.log("  ❌ " + name + ": " + e.message) }
}

async function main () {
  // 媒体源：裸 server 发真字节（fake-http 会改写二进制）
  const raw = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp4" })
    res.end(Buffer.from("e2e-media"))
  })
  await new Promise((r) => raw.listen(0, "127.0.0.1", r))
  const mediaUrl = "http://cdn.example.com:" + raw.address().port + "/clip.mp4"

  // 注意：HTTP 面无法注入 fetchOpts（那是测试钩子），故这里用「必然失败」的
  // URL 路径来验证清理，而非成功路径 —— 成功路径的落盘由
  // resolve-request-media.test.js 覆盖。这样零外发、也不依赖测试钩子。
  // ⚠️ 这组用例的清理路径必须真被触发，否则断言只是「碰巧没下载过所以没残留」。
  //
  // 上面那些 URL 全部是**注定失败**的（私网），media-fetch 在下载前就抛错，
  // 于是 resolveRequestMedia 的 catch 分支自己清了目录——HTTP 层的 finally
  // 根本没被验证到。要让 finally 有意义，必须让下载**真的成功**过，
  // 因此这里需要把 fetch 的测试钩子接到 HTTP 面。
  //
  // 钩子只能从 opts 传入，不能从请求体驱动（否则就成了绕过 SSRF 的后门）。
  // 故本测试用「包装 media-fetch 模块」的方式：让 HTTP 面内部的
  // resolveRequestMedia 走真下载，但把 URL 指向本机 server。
  console.log("--- 真下载后仍必须零残留（验证 HTTP 层 finally 而非 fetch 自身兜底）---")

// ⚠️ 钩子必须作用在 **resolve-request-media 的 exports** 上，不能改 media-fetch。
  // 原因：resolve-request-media.js:17 用解构赋值在加载时就把 fetchMediaToTemp
  // 固化成局部变量，此后 require.cache 里的任何替换都追不上它。踩过一次——
  // 替换 media-fetch 后「真下载」用例其实一次都没下载，7/7 全是假绿。
  const rrmPath = require.resolve("../src/publish/resolve-request-media")
  const realResolve = require(rrmPath)
  const realFetch = require("../src/publish/media-fetch")

  // 代理 resolveRequestMedia：给 fetchMediaToTemp 强制注入测试钩子
  const hookedResolve = Object.create(realResolve)
  hookedResolve.resolveRequestMedia = function (body, fetchOpts) {
    return realResolve.resolveRequestMedia(body, Object.assign({}, fetchOpts, {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      __connectHost: "127.0.0.1",
    }))
  }
  hookedResolve.URL_FIELDS = realResolve.URL_FIELDS
  require.cache[rrmPath].exports = hookedResolve

  // 自检：钩子未生效时必须当场失败，而不是让后面的断言假绿
  await t("钩子自检：代理后 URL 路径真的发生了下载", async () => {
    const before = mediaDirs().length
    const r = await hookedResolve.resolveRequestMedia({ platform: "kuaishou", video_url: mediaUrl })
    assert.strictEqual(r.ok, true, "应解析成功，实得 " + JSON.stringify(r).slice(0, 120))
    assert.ok(r.taskData.video && r.taskData.video.path,
      "video.path 应被填上真实落盘路径（说明下载真的发生了）")
    assert.ok(mediaDirs().length > before,
      "临时目录数未增加 ⇒ 钩子未生效、下载根本没发生，后续断言会假绿")
    r.cleanup()
  })

  const server = new PublishApiServer({ dryRun: true })
  await server.start(0)
  const port = server._server.address().port

  try {
    // 真下载路径：钩子已生效（替换发生在 server 创建之前），下载确实发生，
    // 故这两条真正验证「HTTP 层 finally 会清理」，而不是 fetch 自身兜底。
    await t("真下载成功但 platform 缺失 → early return 仍零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", { video_url: mediaUrl, cookie: "c" })
      assert.strictEqual(r.status, 400, "应因缺 platform 而 400")
      assert.strictEqual(mediaDirs().length, before,
        "early return 路径泄漏了 " + (mediaDirs().length - before) +
        " 个临时目录（HTTP 层 finally 清理未生效）")
    })

    await t("真下载成功且 platform 合法 → 正常响应后零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", { platform: "kuaishou", video_url: mediaUrl, title: "t", cookie: "c" })
      assert.ok(r.status >= 200 && r.status < 500, "意外状态 " + r.status + " body=" + JSON.stringify(r.body).slice(0, 120))
      assert.strictEqual(mediaDirs().length, before,
        "正常路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
    })

    console.log("--- /publish：URL 被拒时不留临时目录 ---")
    await t("私网 video_url → 400 且零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", { platform: "kuaishou", video_url: "http://127.0.0.1:1/x.mp4", cookie: "c" })
      assert.strictEqual(r.status, 400)
      assert.strictEqual(mediaDirs().length, before, "残留 " + (mediaDirs().length - before) + " 个临时目录")
    })

    await t("缺 platform + 带 URL → 400 且零残留（early return 路径）", async () => {
      const before = mediaDirs().length
      // platform 缺失时在媒体解析**之后**才校验，故 URL 已尝试拉取；
      // 这条专门盯住「解析成功但后续 early return」这条路径是否仍会清理。
      const r = await post(port, "/api/v1/publish", { video_url: mediaUrl, cookie: "c" })
      assert.strictEqual(r.status, 400)
      assert.strictEqual(mediaDirs().length, before,
        "early return 路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
    })

    console.log("\n--- /batch-publish：同样零残留 ---")
    await t("私网 video_url → 400 且零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/batch-publish", { platforms: ["zhihu"], video_url: "http://127.0.0.1:1/x.mp4", cookie: "c" })
      assert.strictEqual(r.status, 400)
      assert.strictEqual(mediaDirs().length, before)
    })

    await t("batch 缺 platforms + 带 URL → 400 且零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/batch-publish", { video_url: mediaUrl, cookie: "c" })
      assert.strictEqual(r.status, 400)
      assert.strictEqual(mediaDirs().length, before,
        "batch early return 路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
    })

    console.log("\n--- 互斥校验从 HTTP 面可见 ---")
    await t("video_path + video_url 同时给 → 400 且提示互斥", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", {
        platform: "kuaishou", video_path: "/tmp/x.mp4", video_url: "http://127.0.0.1:1/x.mp4", cookie: "c",
      })
      assert.strictEqual(r.status, 400)
      assert.match(r.body.error || "", /mutually exclusive/)
      assert.strictEqual(mediaDirs().length, before)
    })

    console.log("\n========== publish-api-media-url-e2e " + pass + "/" + (pass + failCount) + " ==========")
  } finally {
    await server.stop()
    require.cache[rrmPath].exports = realResolve
    await new Promise((r) => raw.close(r))
  }
  if (failCount) process.exit(1)
}

main().catch((e) => { console.error("❌", e); process.exit(1) })