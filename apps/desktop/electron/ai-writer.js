/**
 * AiWriter — AI 辅助写作模块
 *
 * 调用 OpenAI 兼容 API 生成标题/摘要/内容润色
 * 支持自定义 API URL（可用于本地 LLM / 代理中转）
 *
 * IPC 注册: ipc-handlers/ai.js
 * 前端组件: components/AiWriterPanel.vue
 */

var axios = require("axios")
var log = require("./logger")

var DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions"
var DEFAULT_MODEL = "gpt-3.5-turbo"

/**
 * @param {Object} opts
 * @param {string} opts.apiKey  — OpenAI API Key
 * @param {string} opts.apiUrl  — 自定义 API 端点（默认 OpenAI）
 * @param {string} opts.model   — 模型名（默认 gpt-3.5-turbo）
 */
function AiWriter(opts) {
  opts = opts || {}
  this.apiKey = opts.apiKey || process.env.OPENAI_API_KEY || ""
  this.apiUrl = opts.apiUrl || process.env.AI_API_URL || DEFAULT_API_URL
  this.model = opts.model || DEFAULT_MODEL
}

/**
 * 检查 AI 服务是否已配置
 */
AiWriter.prototype.isConfigured = function() {
  return !!this.apiKey
}

/**
 * 通用 LLM 调用
 */
AiWriter.prototype._call = async function(systemPrompt, userPrompt) {
  if (!this.isConfigured()) {
    log.warn("AiWriter", "API Key not configured")
    throw new Error("AI 服务未配置，请在 Provider 设置中添加 API Key")
  }
  try {
    var res = await axios.post(this.apiUrl, {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }, {
      headers: {
        "Authorization": "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    })
    return res.data.choices[0].message.content.trim()
  } catch (e) {
    log.error("AiWriter", "API call failed: " + (e.response?.data?.error?.message || e.message))
    throw e
  }
}

/**
 * 生成标题建议
 * @param {string} topic — 主题或内容摘要
 * @param {number} count — 建议数量
 * @returns {Promise<string[]>}
 */
AiWriter.prototype.generateTitles = async function(topic, count) {
  count = count || 5
  try {
    var systemPrompt = "你是一个社交媒体内容创作助手。根据给定的主题，生成 " + count + " 个吸引人的标题。"
    var userPrompt = "主题: " + topic + "\n\n请生成 " + count + " 个标题，每行一个，用数字编号。标题要吸引点击、适合社交媒体发布。"
    var result = await this._call(systemPrompt, userPrompt)
    return this._parseNumberedList(result)
  } catch (e) {
    log.warn("AiWriter", "generateTitles failed: " + e.message)
    return []
  }
}

/**
 * 生成摘要
 * @param {string} content — 正文
 * @returns {Promise<string>}
 */
AiWriter.prototype.generateSummary = async function(content) {
  if (!content || content.length < 10) return ""
  try {
    var systemPrompt = "你是一个内容摘要助手。用 2-3 句话概括以下内容的核心观点。"
    var userPrompt = "内容:\n" + content.slice(0, 3000)
    return await this._call(systemPrompt, userPrompt)
  } catch (e) {
    log.warn("AiWriter", "generateSummary failed: " + e.message)
    return ""
  }
}

/**
 * 内容润色/增强
 * @param {string} content — 原始内容
 * @param {string} style — 风格 (polish / concise / engaging)
 * @returns {Promise<string>}
 */
AiWriter.prototype.enhanceContent = async function(content, style) {
  style = style || "polish"
  if (!content || content.length < 5) return content
  try {
    var styleGuide = {
      polish: "优化语法和表达，保持原意不变",
      concise: "精简到核心信息，去除冗余",
      engaging: "改为更有吸引力的社交媒体风格",
    }
    var systemPrompt = "你是一个内容润色助手。" + (styleGuide[style] || styleGuide.polish)
    var userPrompt = "请润色以下内容:\n\n" + content.slice(0, 4000)
    return await this._call(systemPrompt, userPrompt)
  } catch (e) {
    log.warn("AiWriter", "enhanceContent failed: " + e.message)
    return content
  }
}

/**
 * 解析编号列表 "1. xxx\n2. xxx\n3. xxx" → ["xxx", "xxx", "xxx"]
 */
AiWriter.prototype._parseNumberedList = function(text) {
  if (!text) return []
  var items = []
  // Normalize escaped newlines
  text = text.replace(/\\\\n/g, "\n")
  var lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (!line) continue
    // Remove leading number/bullet: "1. " "2、 " "- " etc
    var cleaned = line.replace(/^[\d#\-\*]+[.、)\s]*\s*/, "").trim()
    if (cleaned) items.push(cleaned)
  }
  return items
}

module.exports = AiWriter
