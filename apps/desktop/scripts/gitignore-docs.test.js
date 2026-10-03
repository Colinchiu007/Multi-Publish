/**
 * gitignore-docs.test.js — 01-docs 忽略规则收窄的回归锁（2026-10-03）
 *
 * 历史陷阱：.gitignore 曾有「01-docs 下一层 .md」+「01-docs 递归 .md」两条忽略规则，
 * 把文档主目录整个划成忽略，迫使正式文档（PRD.md / learnings.md / PRD-*.md）必须
 * git add -f 才能入库。普通 add 静默失败 —— 不报错不提示，PR #2792 的两份 PRD/使用
 * 说明就这样「写了却从未入库」，合并后 PRD 链接 404（复盘见 01-docs/learnings.md 同名条目）。
 *
 * 本文件锁四条：
 * ① 正式文档名（PRD*.md / learnings.md / DESIGN.md）不得再被忽略
 * ② 真正的本地交付产物（*report* / *analysis* / *brief*）仍被忽略
 * ③ 已跟踪文档规模下界（防「解析退化成空集合」式假绿）
 * ④ PRD 主链抽样在跟踪集合里（PRD 链接不得指向未入库文件）
 *
 * 运行：node --test apps/desktop/scripts/gitignore-docs.test.js
 * 接线：.github/workflows/quality-gate.yml Gate 2b
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const { execSync } = require('child_process')
const path = require('path')

const REPO = path.resolve(__dirname, '../../..')

function git (args) {
  return execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8' }).trim()
}

/** 用 git 自己的判据回答「这条路径会被忽略吗」（与开发者的真实体验同源） */
function isIgnored (relPath) {
  try {
    execSync(`git check-ignore -q "${relPath}"`, { cwd: REPO, stdio: 'ignore' })
    return true
  } catch {
    return false // check-ignore 退出码 1 = 未被忽略
  }
}

test('正式文档不再被忽略（历史陷阱回归：普通 git add 必须能进）', () => {
  // ⚠️ 判据坑（本锁第一版就栽在这）：git check-ignore 对「已跟踪文件」恒返回
  // 「未忽略」—— ignore 规则只作用于未跟踪路径。拿已跟踪的正式文档去测，
  // 新旧两种规则下答案都是「否」⇒ 锁永远绿，反证时当场抓出（见 learnings）。
  // 正确做法：用「用户新写一份文档」的未跟踪探测名，这才是 add 时的真实处境。
  const newDocs = [
    '01-docs/PRD-SOME-NEW-FEATURE-2026-99-99.md',   // 模拟新增专项 PRD
    '01-docs/AUTOMATION-USAGE-SOME-FEATURE.md',      // 模拟新增使用说明
    '01-docs/PRD-NEW.md',
    '01-docs/learnings-2026-99-99.md',               // 模拟新增 learnings
  ]
  for (const p of newDocs) {
    assert.ok(!isIgnored(p), `${p}（未跟踪新文档）不应被忽略 —— 否则普通 git add 会静默跳过它`)
  }
  // 已跟踪主文档不被误删出库（ignore 不影响已跟踪文件，但删了规则也救不回）
  assert.ok(!isIgnored('01-docs/PRD.md'))
})

test('本地交付产物仍被忽略（不把临时报告冲进版本库）', () => {
  const transient = [
    '01-docs/AUTH-REPORT-2026-01-01.md',
    '01-docs/perf-analysis-draft.md',
    '01-docs/meeting-brief.md',
  ]
  for (const p of transient) {
    assert.ok(isIgnored(p), `${p} 应保持忽略（本地交付产物，非项目文档）`)
  }
})

test('01-docs 已跟踪文档规模下界（防忽略规则误伤导致整层退出版本库）', () => {
  const tracked = git('ls-files "01-docs/*.md"').split('\n').filter(Boolean)
  // 2026-10-03 实测 390 篇；断言下界而非精确值，正当增删不应红
  assert.ok(tracked.length > 100, `01-docs 已跟踪文档应 > 100 篇，实测 ${tracked.length}`)
  // 主文档必须在跟踪集合里
  assert.ok(tracked.includes('01-docs/PRD.md'), '01-docs/PRD.md 应在版本库中')
  assert.ok(tracked.includes('01-docs/learnings.md'), '01-docs/learnings.md 应在版本库中')
})

test('PRD 文档主链抽样在跟踪集合里（PRD 链接不得指向未入库文件）', () => {
  const tracked = git('ls-files "01-docs/*.md"').split('\n').filter(Boolean)
  // 历史事故（#2792）：CHANGELOG/PRD 引用了文档、文档却从未入库
  const mustBeTracked = [
    '01-docs/PRD-AUTOMATION-CONTENT-CATEGORY-2026-10-03.md',
    '01-docs/PRD-HOT-TOPICS-CATEGORY-SUPPLY-2026-09-20.md',
    '01-docs/PRD-HREF-SCHEME-GUARD-2026-09-29.md',
  ]
  for (const p of mustBeTracked) {
    assert.ok(tracked.includes(p), `${p} 应已入库（PRD 里的链接不得指向不存在的文件）`)
  }
})
