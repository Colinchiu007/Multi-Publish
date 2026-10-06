'use strict'
/**
 * media-fetch 回归锁：四道防线逐条验证。
 *
 * 全部打本机假 HTTP 服务器 + 注入 lookup，不触真实外网。
 */
const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const { startFakeServer } = require("./helpers/fake-http")
const { fetchMediaToTemp, fetchMediaSetToTemp, DEFAULT_MAX_MEDIA_BYTES } = require("../src/publish/media-fetch")

/**
 * 固定 lookup：让任意**域名**解析到指定地址。
 *
 * ⚠️ 假服务器只能听 127.0.0.1，而 127.0.0.1 被 SSRF 判为私网 —— 这正是
 * 「功能用例怎么写」的难点：URL 用 127.0.0.1 就必然被防线 1 拦下。
 * 解法是让 URL 主机名是**公网域名形态**（cdn.example.com），再用注入的
 * lookup 把它指到 127.0.0.1 去真正建立连接。静态检查看不到私网，
 * 连接目标却是私网 —— 这恰好也顺带证明了 lookup 注入通道可用。
 * 私网**字面量**被拒的场景由上一组用例直接覆盖，不靠这里。
 */
function fakeLookup (address) {
  return async function (hostname) {
    if (address === "nx") throw new Error("ENOTFOUND")
    return [{ address: address, family: require("net").isIP(address) }]
  }
}

/** 把假服务器地址改写成公网域名形态的 URL（端口保留），配合 fakeLookup 使用。 */
function publicUrl (server) {
  return String(server.url).replace("//127.0.0.1:", "//cdn.example.com:")
}

let pass = 0
let failCount = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log("  ✅ " + name) }
  catch (e) { failCount++; console.log("  ❌ " + name + ": " + e.message) }
}

async function main () {
  console.log("--- 防线 1：SSRF（静态检查 + DNS 解析结果）---")

  await t("私网 IP 字面量直拒", async () => {
    await assert.rejects(
      () => fetchMediaToTemp("http://127.0.0.1:1/x.mp4"),
      /internal\/private network/)
  })

  await t("localhost 直拒", async () => {
    await assert.rejects(() => fetchMediaToTemp("http://localhost:1/x.mp4"), /internal\/private network/)
  })

  await t("非 http(s) 协议直拒", async () => {
    await assert.rejects(() => fetchMediaToTemp("file:///etc/passwd"), /http:\/\/ or https:\/\//)
  })

  await t("URL 内嵌凭据直拒", async () => {
    await assert.rejects(() => fetchMediaToTemp("http://user:pass@example.com/x.mp4"), /without embedded credentials/)
  })

  await t("公网域名解析到私网 IP 时整体拒绝（静态检查放行、DNS 层拦截）", async () => {
    // 这条是静态 URL 检查抓不到的：域名长得完全正常，DNS 才暴露它指向 127.0.0.1
    await assert.rejects(
      () => fetchMediaToTemp("http://media.example.com/x.mp4", { lookup: fakeLookup("127.0.0.1") }),
      /internal\/private network/)
  })

  await t("解析结果混入私网地址时整体拒绝（不做「挑一个安全的」）", async () => {
    await assert.rejects(
      () => fetchMediaToTemp("http://media.example.com/x.mp4", {
        lookup: async () => ([
          { address: "93.184.216.34", family: 4 },
          { address: "10.0.0.5", family: 4 },
        ]),
      }),
      /internal\/private network/)
  })

  await t("DNS 解析失败时拒绝，不放行未知目标", async () => {
    await assert.rejects(
      () => fetchMediaToTemp("http://media.example.com/x.mp4", { lookup: fakeLookup("nx") }),
      /could not be resolved/)
  })

  console.log("\n--- 防线 2：体积上限（边收边计数，不信任 Content-Length）---")

  await t("Content-Length 超限：下载前即拒，不产生任何磁盘写入", async () => {
    const server = await startFakeServer([
      { method: "GET", match: /.*/, body: "x".repeat(1024) },
    ])
    try {
      await assert.rejects(
        () => fetchMediaToTemp(publicUrl(server) + "/big.mp4", {
          lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1", maxBytes: 512,
        }),
        /exceeds maxBytes/)
    } finally { await server.close() }
  })

  await t("流式超限（Content-Length 撒谎/缺失）：中途即中止并清理", async () => {
    // 假服务器若直接给 Content-Length 就测不到「边收边计数」这一路，
    // 故用裸 http 监听器分块推、且不声明 Content-Length。
    const big = Buffer.alloc(64 * 1024)
    const raw = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "video/mp4" }) // 故意不给 Content-Length
      let n = 0
      const timer = setInterval(() => {
        if (n >= 16) { clearInterval(timer); res.end(); return }
        res.write(big); n++
      }, 2)
    })
    await new Promise((r) => raw.listen(0, "127.0.0.1", r))
    const port = raw.address().port
    const tmpRoot = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-")).length
    try {
      await assert.rejects(
        () => fetchMediaToTemp("http://cdn.example.com:" + port + "/x.mp4", {
          lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1",
          maxBytes: 1024,
        }),
        /exceeds maxBytes/,
        "流式推送必须在超过 maxBytes 时中止")
    } finally {
      await new Promise((r) => raw.close(r))
      // 防线 3/4：失败后不得残留临时目录
      const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-")).length
      assert.strictEqual(after, tmpRoot, "失败后残留了临时目录: " + (after - tmpRoot))
    }
  })

  console.log("\n--- 防线 2b：正常下载与扩展名推断 ---")

  await t("正常下载落盘，扩展名按 Content-Type 推断，且字节逐字节一致", async () => {
    // 不用 fake-http：它的两条应答路径都会改写二进制（raw 走 utf8、非 raw 走
    // JSON.stringify），字节级比对在这里必然失真。故用裸 server 发真字节。
    const payload = Buffer.from([0x00, 0x1f, 0x8b, 0xff, 0x7f, 0x80, 0x41, 0x42, 0x00, 0xfe])
    const raw = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "video/mp4" })
      res.end(payload)
    })
    await new Promise((r) => raw.listen(0, "127.0.0.1", r))
    const port = raw.address().port
    try {
      const r = await fetchMediaToTemp("http://cdn.example.com:" + port + "/clip", {
        lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1",
      })
      try {
        assert.ok(fs.existsSync(r.path), "临时文件应存在")
        assert.strictEqual(path.extname(r.path), ".mp4", "扩展名应按 Content-Type 推断")
        assert.strictEqual(r.bytes, payload.length)
        assert.ok(fs.readFileSync(r.path).equals(payload),
          "落盘字节应与源字节逐字节一致（实得 " + fs.readFileSync(r.path).toString("hex") + "）")
      } finally { r.cleanup() }
    } finally { await new Promise((r) => raw.close(r)) }
  })

  await t("cleanup() 后文件与目录一并消失", async () => {
    const server = await startFakeServer([{ method: "GET", match: /.*/, body: "data" }])
    try {
      const r = await fetchMediaToTemp(publicUrl(server) + "/a", { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" })
      const dir = path.dirname(r.path)
      assert.ok(fs.existsSync(r.path))
      r.cleanup()
      assert.ok(!fs.existsSync(dir), "cleanup 后目录应被删除")
    } finally { await server.close() }
  })

  await t("cleanup 幂等（重复调用不抛）", async () => {
    const server = await startFakeServer([{ method: "GET", match: /.*/, body: "data" }])
    try {
      const r = await fetchMediaToTemp(publicUrl(server) + "/a", { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" })
      r.cleanup(); r.cleanup()
    } finally { await server.close() }
  })

  await t("非 2xx 状态码拒绝并清理", async () => {
    const server = await startFakeServer([{ method: "GET", match: /.*/, status: 404, body: "nope" }])
    try {
      await assert.rejects(
        () => fetchMediaToTemp(publicUrl(server) + "/missing", { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" }),
        /HTTP 404/)
    } finally { await server.close() }
  })

  console.log("\n--- 防线 3/4：批量拉取的部分失败不留痕 ---")

  await t("批量拉取中第 2 项失败：第 1 项的临时文件被清理", async () => {
    const server = await startFakeServer([
      { method: "GET", match: /ok/, body: "ok-bytes" },
      { method: "GET", match: /bad/, status: 500, body: "boom" },
    ])
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-")).length
    try {
      await assert.rejects(
        () => fetchMediaSetToTemp([publicUrl(server) + "/ok", publicUrl(server) + "/bad"], { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" }),
        /HTTP 500/)
      const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-")).length
      assert.strictEqual(after, before, "批量失败后残留临时目录 " + (after - before) + " 个")
    } finally { await server.close() }
  })

  await t("批量全成功：cleanup 一次清掉全部", async () => {
    const server = await startFakeServer([{ method: "GET", match: /.*/, body: "ok-bytes" }])
    try {
      const r = await fetchMediaSetToTemp([publicUrl(server) + "/1", publicUrl(server) + "/2"], { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" })
      assert.strictEqual(r.paths.length, 2)
      const dirs = r.paths.map((p) => path.dirname(p))
      dirs.forEach((d) => assert.ok(fs.existsSync(d)))
      r.cleanup()
      dirs.forEach((d) => assert.ok(!fs.existsSync(d), "cleanup 后应全部删除"))
    } finally { await server.close() }
  })

  console.log("\n========== media-fetch " + pass + "/" + (pass + failCount) + " ==========")
  if (failCount) process.exit(1)
}

main().catch((e) => { console.error("❌", e); process.exit(1) })