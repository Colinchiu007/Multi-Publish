/**
 * AiWriter - AI auxiliary writing module (standalone package)
 */

const axios = require("axios")
const DEFAULT_API_URL = "https://api.openai.com/v1/chat/completions"
const DEFAULT_MODEL = "gpt-3.5-turbo"

function AiWriter(opts) {
  opts = opts || {}
  this.apiKey = opts.apiKey || process.env.OPENAI_API_KEY || ""
  this.apiUrl = opts.apiUrl || process.env.AI_API_URL || DEFAULT_API_URL
  this.model = opts.model || DEFAULT_MODEL
}

AiWriter.prototype.isConfigured = function() {
  return !!this.apiKey
}

AiWriter.prototype._call = async function(systemPrompt, userPrompt) {
  if (!this.isConfigured()) {
    throw new Error("AI service not configured. Set apiKey or OPENAI_API_KEY")
  }
  const res = await axios.post(this.apiUrl, {
    model: this.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  }, {
    headers: { "Authorization": "Bearer " + this.apiKey, "Content-Type": "application/json" },
    timeout: 30000,
  })
  return res.data.choices[0].message.content.trim()
}

AiWriter.prototype.generateTitles = async function(topic, count) {
  count = count || 5
  try {
    const sp = "You are a social media content assistant. Generate " + count + " catchy titles."
    const up = "Topic: " + topic + String.fromCharCode(10,10) + "Generate " + count + " titles, one per line."
    const result = await this._call(sp, up)
    return this._parseNumberedList(result)
  } catch (e) { return [] }
}

AiWriter.prototype.generateSummary = async function(content) {
  if (!content || content.length < 10) return ""
  try {
    const sp = "You are a summarizer. Summarize in 2-3 sentences."
    const up = content.slice(0, 3000)
    return await this._call(sp, up)
  } catch (e) { return "" }
}

AiWriter.prototype.enhanceContent = async function(content, style) {
  style = style || "polish"
  if (!content || content.length < 5) return content
  try {
    const guides = { polish: "Polish grammar and expression", concise: "Make concise", engaging: "Make engaging for social media" }
    const sp = "You are an editor. " + (guides[style] || guides.polish)
    const up = content.slice(0, 4000)
    return await this._call(sp, up)
  } catch (e) { return content }
}

AiWriter.prototype._parseNumberedList = function(text) {
  if (!text) return []
  const result = []
  const normalised = text.replace(/\\n/g, String.fromCharCode(10))
  const parts = normalised.split(String.fromCharCode(10))
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i].trim()
    if (!line) continue
    const cleaned = line.replace(/^[0-9#\-\*\.]+[\.\?\s\)]*\s*/, "").trim()
    if (cleaned) result.push(cleaned)
  }
  return result
}

module.exports = AiWriter