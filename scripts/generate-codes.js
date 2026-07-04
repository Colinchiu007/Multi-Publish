#!/usr/bin/env node
/**
 * 兑换码生成工具 (CLI)
 *
 * 用法:
 *   node scripts/generate-codes.js                   # 生成 1 个兑换码
 *   node scripts/generate-codes.js --count 10         # 生成 10 个
 *   node scripts/generate-codes.js --plan pro --duration lifetime  # 带元数据
 *   node scripts/generate-codes.js --output codes.txt # 输出到文件
 *   node scripts/generate-codes.js --help             # 帮助
 */

var path = require("path")
var redemptionCodes = require("../apps/desktop/electron/redemption-codes")

var args = process.argv.slice(2)

// ── 帮助 ──────────────────────────────
if (args.indexOf("--help") >= 0 || args.indexOf("-h") >= 0) {
  console.log("")
  console.log("  📋 兑换码生成工具")
  console.log("")
  console.log("  用法:")
  console.log("    node scripts/generate-codes.js [选项]")
  console.log("")
  console.log("  选项:")
  console.log("    --count <n>       生成数量（默认 1）")
  console.log("    --plan <name>     方案类型（pro / lifetime，默认 pro）")
  console.log("    --duration <d>    时长（lifetime / yearly / monthly，默认 lifetime）")
  console.log("    --output <file>   输出到文件（每行一个）")
  console.log("    --secret <key>    自定义签名密钥（需与验证端一致）")
  console.log("    --help, -h        显示帮助")
  console.log("")
  process.exit(0)
}

// ── 解析参数 ──────────────────────────
function getArg(name) {
  var idx = args.indexOf(name)
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1]
  return null
}

var count = parseInt(getArg("--count") || "1", 10)
var plan = getArg("--plan") || "pro"
var duration = getArg("--duration") || "lifetime"
var outputFile = getArg("--output")
var secret = getArg("--secret")

// 自定义密钥
if (secret) {
  process.env.REDEMPTION_SECRET = secret
}

// ── 生成 ──────────────────────────────
var metadata = { plan: plan, duration: duration }
var codes = redemptionCodes.generateBatch(count, metadata)

// ── 输出 ──────────────────────────────
var output = codes.join("\n")

if (outputFile) {
  var fs = require("fs")
  fs.writeFileSync(path.resolve(outputFile), output + "\n", "utf-8")
  console.log("✅ 已生成 " + count + " 个兑换码 → " + outputFile)
  console.log("⚠️  密钥: " + (secret || "默认 (REDEMPTION_SECRET 环境变量)"))
} else {
  console.log("\n📋 兑换码 (" + count + " 个, " + plan + "/" + duration + "):")
  console.log("")
  codes.forEach(function(code, i) {
    console.log("  " + (i + 1) + ".  " + code)
  })
  console.log("")
}
