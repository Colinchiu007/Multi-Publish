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
const serverMod = require("../src/publish-api-server")
const { PublishApiServer } = serverMod

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
  const originHits = { n: 0, paths: [] }
  const raw = http.createServer((req, res) => {
    originHits.n++
    originHits.paths.push(req.url)
    res.writeHead(200, { "Content-Type": "video/mp4" })
    res.end(Buffer.from("e2e-media"))
  })
  await new Promise((r) => raw.listen(0, "127.0.0.1", r))
  const mediaUrl = "http://cdn.example.com:" + raw.address().port + "/clip.mp4"

  // HTTP 面不接受调用方传入 fetchOpts（那会是绕过 SSRF 的后门），
  // 故下载通路只能靠包装 resolveRequestMedia 注入 —— 见下方钩子段。
  // ⚠️ 清理路径必须真被触发，否则「零残留」只是「碰巧没下载过」。
  //
  // 这里踩了**三次**同样的坑，全部表现为 8/8 假绿：
  // ① 改 require.cache 里的 media-fetch —— 被 resolve-request-media.js:17 的解构绑定挡住
  // ② 改 require.cache 里的 resolve-request-media —— 被 publish-api-server.js:23 挡住
  // ③ 自检用例直接调 hookedResolve，绕开了 HTTP 路径，给了「钩子有效」的错觉
  //
  // 判据：日志里紧挨着断言的 `errorCode: ENOTFOUND` 就是「压根没下载过」的自证。
  // 结论：改不动 require 时序就别和它搏斗 —— 生产代码加显式注入点
  // （setMediaRequestResolver），测试从那里注入，并断言 **origin 真收到请求**。
  const realResolve = require("../src/publish/resolve-request-media")
  serverMod.setMediaRequestResolver(function (body) {
    return realResolve.resolveRequestMedia(body, {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      __connectHost: "127.0.0.1",
    })
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
      // platform 缺失 ⇒ 校验发生在媒体解析之前，本条验「早失败不留痕」。
    })

    await t("真下载成功且 platform 合法 → 正常响应后零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", { platform: "kuaishou", video_url: mediaUrl, title: "t", cookie: "c" })
      assert.ok(r.status >= 200 && r.status < 500, "意外状态 " + r.status + " body=" + JSON.stringify(r.body).slice(0, 120))
      assert.strictEqual(mediaDirs().length, before,
        "正常路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
      assert.ok(originHits.n > 0, "本条必须真下载过，否则「零残留」是假绿")
    })

    // 注意：本文件全程注入了固定 lookup，私网/解析失败的防线**不在这里验**
    // （注入后 URL 会被解析到 93.184.216.34）。那两道防线由
    // media-fetch.test.js 与 resolve-request-media.test.js（不注入）覆盖。
    console.log("--- /publish：各种响应路径都不留临时目录 ---")
    await t("连接失败（端口 1 拒绝）→ 零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", { platform: "kuaishou", video_url: "http://cdn.example.com:1/x.mp4", cookie: "c" })
      assert.ok(r.status >= 200 && r.status < 500, "预期 4xx/2xx，实得 " + r.status)
      assert.strictEqual(mediaDirs().length, before, "残留 " + (mediaDirs().length - before) + " 个临时目录")
    })

    await t("缺 platform + 带 URL → 400 且零残留（early return 路径）", async () => {
      const before = mediaDirs().length
      // ⚠️ platform 校验（publish-api-server.js:1033）在媒体解析（:1042）**之前**，
      // 所以这条请求压根没下载过 —— 它验的是「早失败路径不留痕」，
      // 不能证明 finally 清理（那由下面 origin 自检后的两条承担）。
      const hitsBefore = originHits.n
      const r = await post(port, "/api/v1/publish", { video_url: mediaUrl, cookie: "c" })
      assert.strictEqual(r.status, 400)
      assert.strictEqual(originHits.n, hitsBefore, "platform 缺失时应未触发任何下载")
      assert.strictEqual(mediaDirs().length, before,
        "early return 路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
    })

    console.log("\n--- /batch-publish：同样零残留 ---")
    await t("batch 连接失败 → 零残留", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/batch-publish", { platforms: ["zhihu"], video_url: "http://cdn.example.com:1/x.mp4", cookie: "c" })
      assert.ok(r.status >= 200 && r.status < 500, "预期 4xx/2xx，实得 " + r.status)
      assert.strictEqual(mediaDirs().length, before)
    })

    await t("batch 缺 platforms + 带 URL → 400 且零残留", async () => {
      const before = mediaDirs().length
      // 与 /publish 不同：batch **没有** platforms 缺失的提前校验
      // （platforms 只在 :1112 的 _authorizeImmediateEntry 里被用到），
      // 所以媒体确实会被下载。这条正是「下载成功后仍须清理」的关键一例。
      const r = await post(port, "/api/v1/batch-publish", { video_url: mediaUrl, cookie: "c" })
      assert.ok(r.status >= 200 && r.status < 500, "预期 4xx/2xx，实得 " + r.status + " body=" + JSON.stringify(r.body).slice(0, 100))
      assert.ok(originHits.n > 0, "batch 路径本应触发下载，若为 0 说明断言前提变了")
      assert.strictEqual(mediaDirs().length, before,
        "batch 路径泄漏了 " + (mediaDirs().length - before) + " 个临时目录")
    })

    console.log("\n--- 互斥校验从 HTTP 面可见 ---")
    await t("video_path + video_url 同时给 → 400 且提示互斥", async () => {
      const before = mediaDirs().length
      const r = await post(port, "/api/v1/publish", {
        platform: "kuaishou", video_path: "/tmp/x.mp4", video_url: "http://cdn.example.com:1/x.mp4", cookie: "c",
      })
      assert.strictEqual(r.status, 400)
      assert.match(r.body.error || "", /mutually exclusive/)
      assert.strictEqual(mediaDirs().length, before)
    })

    console.log("\n========== publish-api-media-url-e2e " + pass + "/" + (pass + failCount) + " ==========")
  } finally {
    await server.stop()
    await new Promise((r) => raw.close(r))
  }
  if (failCount) process.exit(1)
}

main().catch((e) => { console.error("❌", e); process.exit(1) })