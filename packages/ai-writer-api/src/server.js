/**
 * AiWriter API Server ? HTTP REST API for @multi-publish/ai-writer
 *
 * Endpoints:
 *   GET  /api/ai/health       ? Health check
 *   POST /api/ai/titles       ? Generate titles     { topic, count? }
 *   POST /api/ai/summary      ? Generate summary     { content }
 *   POST /api/ai/enhance      ? Enhance content      { content, style? }
 *
 * Auth via X-API-Key header (default key from env AI_WRITER_API_KEY)
 *
 * Usage:
 *   node src/server.js              # Start on port 3487
 *   AI_WRITER_API_KEY=sk-xxx node src/server.js --port 8080
 */

var express = require("express")
var AiWriter = require("@multi-publish/ai-writer")

var DEFAULT_PORT = 3487
var API_KEY = process.env.AI_WRITER_API_KEY || "dev-key-change-me"

function createApp(options) {
  options = options || {}
  var apiKey = options.apiKey || API_KEY
  var app = express()

  app.use(express.json())

  // ??? Auth middleware ????????????????????????????
  app.use("/api/ai", function(req, res, next) {
    if (req.path === "/health") return next()  // skip auth for health
    var key = req.headers["x-api-key"]
    if (!key || key !== apiKey) {
      return res.status(401).json({ error: "Unauthorized. Set X-API-Key header." })
    }
    next()
  })

  // ??? Health ?????????????????????????????????????
  app.get("/api/ai/health", function(req, res) {
    res.json({ status: "ok", service: "ai-writer-api", version: "1.0.0" })
  })

  // ??? Generate Titles ????????????????????????????
  app.post("/api/ai/titles", async function(req, res) {
    try {
      var topic = req.body.topic
      if (!topic) return res.status(400).json({ error: "Missing required field: topic" })
      var count = req.body.count || 5
      var writer = new AiWriter({ apiKey: getWriterApiKey(req) })
      var titles = await writer.generateTitles(topic, count)
      res.json({ data: titles })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // ??? Generate Summary ???????????????????????????
  app.post("/api/ai/summary", async function(req, res) {
    try {
      var content = req.body.content
      if (!content) return res.status(400).json({ error: "Missing required field: content" })
      var writer = new AiWriter({ apiKey: getWriterApiKey(req) })
      var summary = await writer.generateSummary(content)
      res.json({ data: summary })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // ??? Enhance Content ????????????????????????????
  app.post("/api/ai/enhance", async function(req, res) {
    try {
      var content = req.body.content
      if (!content) return res.status(400).json({ error: "Missing required field: content" })
      var style = req.body.style || "polish"
      var writer = new AiWriter({ apiKey: getWriterApiKey(req) })
      var enhanced = await writer.enhanceContent(content, style)
      res.json({ data: enhanced })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return app
}

function getWriterApiKey(req) {
  return req.headers["x-openai-key"] || process.env.OPENAI_API_KEY || ""
}

// ??? Main ??????????????????????????????????????????
if (require.main === module) {
  var port = parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) || DEFAULT_PORT
  var app = createApp()
  app.listen(port, function() {
    console.log("AiWriter API server listening on port " + port)
    console.log("API Key: " + API_KEY.slice(0, 8) + "...")
  })
}

module.exports = createApp()
