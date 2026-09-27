"use strict"

// 质量节拍 vendored 契约镜像漂移锁：
// .quality-rhythm/integrations/openspec/spec-contract.md 是 openspec/specs/openspec-integration/spec.md
// 分发到其他仓库时的契约副本。真源每次增删 Requirement 或 Scenario，镜像必须同步——
// 此前只有人肉同步（#2479 只补了其中一句），本锁负责把它变成会红的东西。

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const LIVE_SPEC = path.join(__dirname, "..", "openspec", "specs", "openspec-integration", "spec.md")
const MIRROR_SPEC = path.join(
  __dirname,
  "..",
  ".quality-rhythm",
  "integrations",
  "openspec",
  "spec-contract.md",
)

const REQUIREMENT_HEADING = /^### Requirement: (.+)$/

// 一个 Requirement 块 = 从该标题起到下一个任意级标题（# / ## / ### / ####不切开，
// 因为 Scenario 属于同一块）之前。这里以 ### 与 ## / # 为界，保证 Scenario 留在块内。
function readRequirementBlocks(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n")
  const blocks = new Map()
  let current = null
  for (const line of lines) {
    const heading = line.match(REQUIREMENT_HEADING)
    if (heading) {
      current = { title: heading[1].trim(), lines: [line] }
      blocks.set(current.title, current.lines)
      continue
    }
    if (current && /^#{1,3} /.test(line)) {
      current = null
      continue
    }
    if (current) current.lines.push(line)
  }
  for (const [title, body] of blocks) {
    while (body.length && body[body.length - 1].trim() === "") body.pop()
    blocks.set(title, body.join("\n"))
  }
  return blocks
}

function scenarioTitles(block) {
  return block
    .split("\n")
    .filter(line => line.startsWith("#### Scenario: "))
    .map(line => line.replace(/^#### Scenario: /, "").trim())
}

const live = readRequirementBlocks(LIVE_SPEC)
const mirror = readRequirementBlocks(MIRROR_SPEC)

test("真源 spec 与 vendored 镜像都解析出 Requirement（防止解析退化成空集合假绿）", () => {
  assert.ok(live.size >= 11, `真源解析到的 Requirement 数异常：${live.size}`)
  assert.ok(mirror.size >= 11, `镜像解析到的 Requirement 数异常：${mirror.size}`)
})

test("镜像不得自行发明或漏掉 Requirement", () => {
  assert.deepEqual(
    [...mirror.keys()].sort(),
    [...live.keys()].sort(),
    "vendored 契约镜像的 Requirement 清单与真源不一致",
  )
})

test("镜像每个 Requirement 块与真源逐行全等", () => {
  const drifted = []
  for (const title of [...live.keys()].sort()) {
    if (!mirror.has(title)) continue
    if (mirror.get(title) !== live.get(title)) drifted.push(title)
  }
  assert.deepEqual(
    drifted,
    [],
    `以下 Requirement 在真源已变更而 vendored 镜像未同步：${drifted.join("、")}`,
  )
})

test("镜像每个 Requirement 的 Scenario 清单与真源一致（漂移时报具体缺哪个）", () => {
  const diffs = []
  for (const title of [...live.keys()].sort()) {
    if (!mirror.has(title)) continue
    const liveSet = scenarioTitles(live.get(title)).sort()
    const mirrorSet = scenarioTitles(mirror.get(title)).sort()
    if (liveSet.join("|") !== mirrorSet.join("|")) {
      diffs.push(`${title}: 真源=[${liveSet.join(", ")}] 镜像=[${mirrorSet.join(", ")}]`)
    }
  }
  assert.deepEqual(diffs, [], "Scenario 清单漂移：\n" + diffs.join("\n"))
})

// 同一目录里还有一对「脚本 vendored 副本」：openspec-sync-check.js 由
// scripts/openspec-sync-check.test.js 自己守着，affected-report.js 此前无人守。
const BYTE_MIRRORS = [
  [
    "scripts/affected-report.js",
    ".quality-rhythm/skills/other/ci-hardening/scripts/affected-report.js",
  ],
]

test("vendored 脚本副本与仓库真源逐字节一致", () => {
  const root = path.join(__dirname, "..")
  for (const [source, copy] of BYTE_MIRRORS) {
    const srcFile = path.join(root, source)
    const copyFile = path.join(root, copy)
    const src = fs.readFileSync(srcFile, "utf8").replace(/\r\n/g, "\n").trimEnd()
    const dst = fs.readFileSync(copyFile, "utf8").replace(/\r\n/g, "\n").trimEnd()
    assert.ok(src.length > 0, `真源为空：${source}`)
    assert.equal(dst, src, `vendored 副本与真源不一致：${copy} <-> ${source}`)
  }
})
