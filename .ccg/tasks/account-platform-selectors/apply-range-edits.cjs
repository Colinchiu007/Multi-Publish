#!/usr/bin/env node
const fs = require('fs')
const targetPath = process.argv[2]
const specPath = process.argv[3]
if (!targetPath || !specPath) { console.error('用法: node apply-range-edits.cjs <目标文件> <编辑清单JSON>'); process.exit(2) }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const ranges = spec.ranges
if (!Array.isArray(ranges) || ranges.length === 0) { console.error('清单必须包含 ranges 数组'); process.exit(2) }
const original = fs.readFileSync(targetPath, 'utf8')
const hasBom = original.charCodeAt(0) === 0xfeff
const hasCrlf = original.includes('\r\n')
let lines = original.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')
const sorted = ranges.slice().sort((a, b) => b.from - a.from)
for (const range of sorted) {
  const from = Number(range.from), to = Number(range.to), replace = Array.isArray(range.replace) ? range.replace : []
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) { console.error('非法行范围: from=' + from + ' to=' + to); process.exit(2) }
  console.log('替换行 ' + from + '-' + (to - 1) + '（原 ' + (to - from) + ' 行）')
  lines.splice(from - 1, to - from, ...replace)
}
let text = lines.join('\n')
if (hasCrlf) text = text.replace(/\n/g, '\r\n')
if (hasBom) text = '\uFEFF' + text
fs.writeFileSync(targetPath, text, 'utf8')
console.log('OK: ' + ranges.length + ' 个行范围已应用 -> ' + targetPath)
