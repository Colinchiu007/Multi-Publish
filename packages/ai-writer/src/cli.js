#!/usr/bin/env node
const fs = require("fs")
const path = require("path")
const AiWriter = require("./index")

function readStdin() {
  return new Promise(function(r) {
    const c = []
    process.stdin.setEncoding("utf-8")
    process.stdin.on("data", function(d) { c.push(d) })
    process.stdin.on("end", function() { r(c.join("").trim()) })
  })
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log("AI Writer CLI ? title gen / summary / enhance")
    console.log("Usage: ai-writer [command] [options]")
    console.log("")
    console.log("Commands:")
    console.log("  titles   Generate titles          --topic TOPIC [--count N]")
    console.log("  summary  Generate summary         --file PATH or stdin")
    console.log("  enhance  Enhance content          --file PATH [--style STYLE]")
    console.log("  env      Show current config")
    console.log("")
    return
  }
  const writer = new AiWriter()
  if (!writer.isConfigured()) {
    console.error("ERROR: Set OPENAI_API_KEY env var"); process.exit(1)
  }
  if (cmd === "env") {
    console.log("API URL:", writer.apiUrl)
    console.log("Model:", writer.model)
    console.log("API Key:", writer.apiKey ? writer.apiKey.slice(0,8)+"..." : "(not set)")
    return
  }
  if (cmd === "titles") {
    const ti = args.indexOf("--topic")
    const ci = args.indexOf("--count")
    const topic = ti >= 0 ? args[ti+1] : ""
    const count = ci >= 0 ? parseInt(args[ci+1]) : 5
    if (!topic) { console.error("ERROR: specify --topic"); process.exit(1) }
    const titles = await writer.generateTitles(topic, count)
    titles.forEach(function(t,i) { console.log((i+1)+". "+t) })
    return
  }
  const fi = args.indexOf("--file")
  let c = ""
  if (fi >= 0) { c = fs.readFileSync(path.resolve(args[fi+1]), "utf-8").trim() }
  else { c = await readStdin() }
  if (!c) { console.error("ERROR: no input"); process.exit(1) }
  const oi = args.indexOf("--output")
  const op = oi >= 0 ? args[oi+1] : null
  if (cmd === "summary") {
    const s = await writer.generateSummary(c)
    if (op) fs.writeFileSync(op, s, "utf-8")
    else console.log(s)
    return
  }
  if (cmd === "enhance") {
    const si = args.indexOf("--style")
    const style = si >= 0 ? args[si+1] : "polish"
    const e = await writer.enhanceContent(c, style)
    if (op) fs.writeFileSync(op, e, "utf-8")
    else console.log(e)
    return
  }
  console.error("unknown command:", cmd)
  process.exit(1)
}
if (require.main === module) {
  main().catch(function(e) { console.error(e.message); process.exit(1) })
}
module.exports = { main: main }
