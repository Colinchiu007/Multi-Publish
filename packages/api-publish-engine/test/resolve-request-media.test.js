'use strict'
/**
 * resolve-request-media 回归锁
 *
 * 关注三件事：
 *   1. 互斥：路径与 URL 同时给出必须拒绝，不做隐式仲裁。
 *   2. 落盘：URL 拉下来的文件在 taskData 里必须是真实可读路径，且 video.path 指向它。
 *   3. 清理：cleanup 之后临时文件消失；且失败路径上**不留痕**。
 */
const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const { resolveRequestMedia } = require("../src/publish/resolve-request-media")
const { fetchMediaToTemp } = require("../src/publish/media-fetch")

function fakeLookup (address) {
  return async function () { return [{ address: address, family: require("net").isIP(address) }] }
}

let pass = 0
let failCount = 0
async function t (name, fn) {
  try { await fn(); pass++; console.log("  ✅ " + name) }
  catch (e) { failCount++; console.log("  ❌ " + name + ": " + e.message) }
}

function tmpMediaDirs () {
  return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("mp-media-"))
}

async function main () {
  console.log("--- 互斥：路径与 URL 同时给 → 拒绝 ---")

  await t("video_path + video_url 同时给 → 400", async () => {
    const r = await resolveRequestMedia({ platform: "kuaishou", video_path: "/tmp/x.mp4", video_url: "http://cdn.example.com/a.mp4" })
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 400)
    assert.match(r.message, /mutually exclusive/)
  })

  await t("cover_path + cover_url 同时给 → 400", async () => {
    const r = await resolveRequestMedia({ cover_path: "/tmp/c.png", cover_url: "http://cdn.example.com/c.png" })
    assert.strictEqual(r.ok, false)
    assert.match(r.message, /mutually exclusive/)
  })

  await t("images + image_urls 同时给 → 400", async () => {
    const r = await resolveRequestMedia({ images: ["/tmp/a.png"], image_urls: ["http://cdn.example.com/a.png"] })
    assert.strictEqual(r.ok, false)
    assert.match(r.message, /mutually exclusive/)
  })

  await t("互斥失败时不留下任何临时目录", async () => {
    const before = tmpMediaDirs().length
    await resolveRequestMedia({ video_path: "/tmp/x.mp4", video_url: "http://cdn.example.com/a.mp4" })
    assert.strictEqual(tmpMediaDirs().length, before)
  })

  console.log("\n--- 纯本地路径路径（无 URL）行为不变 ---")

  await t("仅本地路径 → ok，video.path 指向该文件", async () => {
    const f = path.join(os.tmpdir(), "rrm-local-" + Date.now() + ".mp4")
    fs.writeFileSync(f, "local-bytes")
    try {
      const r = await resolveRequestMedia({ platform: "kuaishou", video_path: f })
      try {
        assert.strictEqual(r.ok, true)
        assert.strictEqual(r.taskData.video.path, f)
        assert.strictEqual(typeof r.cleanup, "function")
      } finally { r.cleanup() }
    } finally { try { fs.unlinkSync(f) } catch (e) {} }
  })

  await t("不可解析的本地路径仍 400（沿用既有契约）", async () => {
    const r = await resolveRequestMedia({ video_path: "/nope/definitely-missing.mp4" })
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 400)
  })

  console.log("\n--- URL 模式：落盘 + 形状 + 清理 ---")

  const payload = Buffer.from("url-mode-bytes")
  const raw = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "video/mp4" })
    res.end(payload)
  })
  await new Promise((r) => raw.listen(0, "127.0.0.1", r))
  const port = raw.address().port
  const mediaUrl = "http://cdn.example.com:" + port + "/clip.mp4"
  const fetchOpts = { lookup: fakeLookup("93.184.216.34"), __connectHost: "127.0.0.1" }

  try {
    await t("URL → taskData.video.path 指向真实落盘文件，且字节一致", async () => {
      const r = await resolveRequestMedia({ platform: "kuaishou", video_url: mediaUrl }, fetchOpts)
      try {
        assert.strictEqual(r.ok, true)
        const p = r.taskData.video.path
        assert.ok(p && p.indexOf("mp-media-") !== -1, "video.path 应指向临时目录，实际 " + p)
        assert.ok(fs.existsSync(p), "临时文件应真实存在")
        assert.ok(fs.readFileSync(p).equals(payload), "落盘字节应与源一致")
        assert.strictEqual(r.taskData.video_path, undefined,
          "taskData 不应凭空长出扁平 video_path（形状翻译只产 video/cover）")
      } finally { r.cleanup() }
    })

    await t("draft / aiGenerated 开关在 URL 路径下不被形状二次推导吃掉", async () => {
      const r = await resolveRequestMedia({ platform: "kuaishou", video_url: mediaUrl, draft: true, aiGenerated: false }, fetchOpts)
      try {
        assert.strictEqual(r.taskData.draft, true)
        assert.strictEqual(r.taskData.aiGenerated, false)
      } finally { r.cleanup() }
    })

    await t("cleanup 后临时目录消失", async () => {
      const before = tmpMediaDirs().length
      const r = await resolveRequestMedia({ video_url: mediaUrl }, fetchOpts)
      const dir = path.dirname(r.taskData.video.path)
      assert.ok(fs.existsSync(dir))
      r.cleanup()
      assert.ok(!fs.existsSync(dir), "cleanup 后目录应删除")
      assert.strictEqual(tmpMediaDirs().length, before)
    })

    await t("cleanup 幂等", async () => {
      const r = await resolveRequestMedia({ video_url: mediaUrl }, fetchOpts)
      r.cleanup(); r.cleanup()
    })

    await t("image_urls 数组 → taskData.images 为落盘路径数组", async () => {
      const r = await resolveRequestMedia({ platform: "baijiahao", image_urls: [mediaUrl, mediaUrl] }, fetchOpts)
      try {
        assert.strictEqual(r.ok, true)
        assert.strictEqual(r.taskData.images.length, 2)
        r.taskData.images.forEach((p) => assert.ok(fs.existsSync(p), "每个图都应落盘"))
      } finally { r.cleanup() }
    })

    console.log("\n--- URL 模式的防线（由 media-fetch 保证，此处验证透传）---")

    await t("私网 URL 被拒，且不留临时目录", async () => {
      const before = tmpMediaDirs().length
      const r = await resolveRequestMedia({ video_url: "http://127.0.0.1:1/x.mp4" }, fetchOpts)
      assert.strictEqual(r.ok, false)
      assert.match(r.message, /internal\/private network/)
      assert.strictEqual(tmpMediaDirs().length, before)
    })

    await t("体积超限被拒，且不留临时目录", async () => {
      const before = tmpMediaDirs().length
      const r = await resolveRequestMedia({ video_url: mediaUrl }, Object.assign({}, fetchOpts, { maxBytes: 4 }))
      assert.strictEqual(r.ok, false)
      assert.match(r.message, /exceeds maxBytes/)
      assert.strictEqual(tmpMediaDirs().length, before, "超限失败不得残留临时目录")
    })

    await t("video_url 成功但 cover_url 失败 → 已下载的视频被清理", async () => {
      const before = tmpMediaDirs().length
      const r = await resolveRequestMedia(
        { video_url: mediaUrl, cover_url: "http://127.0.0.1:1/c.png" }, fetchOpts)
      assert.strictEqual(r.ok, false)
      assert.strictEqual(tmpMediaDirs().length, before,
        "部分失败后残留 " + (tmpMediaDirs().length - before) + " 个临时目录")
    })
  } finally {
    await new Promise((r) => raw.close(r))
  }

  console.log("\n========== resolve-request-media " + pass + "/" + (pass + failCount) + " ==========")
  if (failCount) process.exit(1)
}

main().catch((e) => { console.error("❌", e); process.exit(1) })