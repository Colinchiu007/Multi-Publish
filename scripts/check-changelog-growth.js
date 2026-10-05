#!/usr/bin/env node
/**
 * check-changelog-growth.js — CHANGELOG 条目「只可增长」棘轮
 *
 * 动因（2026-10-05 实测）：`b531bdfe7`（PR #2884，一个 ai-taste 功能 PR）把 CHANGELOG.md 从
 * 7,474,293 字节 / 1,133 条整份替换成 9,155 字节 / 2 条，**丢掉 1,131 条历史**，并且全绿合入。
 * 之所以全绿：CHANGELOG.md 是 append-only 台账，却没有任何东西在守它的单调性 ——
 *   · doc-gate 只判「diff 里有没有白名单文档」，删空文档照样满足；
 *   · check-max-lines 的 SCAN_DIRS 不含根级 .md；
 *   · check-gate-record-debt 看的是执行记录，不是 CHANGELOG。
 *
 * 判据（一条，blocking）：**base 的条目标题多重集必须被 head 包含**（count_head[t] >= count_base[t]）。
 * 「条目标题」= 一级标题，仅排除文档节标题 `# CHANGELOG`（见 HEADING_RE 处的实测取证）。
 * 用多重集而不是集合，是因为历史里 1,133 个标题只有 302 个不同值（267 种重复，最多 4 次），
 * 集合口径会把「把 4 份副本删到 3 份」这种真实丢失读成通过。
 *
 * 刻意**不判**的两件事（写了就不诚实，也守不住）：
 *   · 条目**正文**被改短 —— 后续 PR 修订自己那条是既有习惯，判了就成了人人想关掉的红；
 *   · 字节数倒退 —— 同上，正文变短就红，属误报。
 *   一句话：本门禁守的是「条目不见了」，不是「条目变小了」。
 *
 * fail closed：base/head 任一读不到、或 base 读出 0 条标题 ⇒ 直接抛错。空遍历不得判为「零丢失」
 * （与 check-gate-record-debt.js 的 rowCountAll===0 出口同源）。
 *
 * 用法：
 *   node scripts/check-changelog-growth.js                        # base=HEAD^ head=HEAD
 *   node scripts/check-changelog-growth.js --base=<sha> --head=HEAD
 *   node scripts/check-changelog-growth.js --json                 # 机器可读
 * CI：quality-gate.yml 的 `changes` job（**不是** static-gates —— CHANGELOG.md 命中 CI_IGNORED_PATHS
 * 的根级 *.md，放在被 docs-only 门控的 job 里等于自关校验，见 AGENTS.md「进白名单的前提锁」）。
 */
'use strict';

const { execFileSync } = require('child_process');

const FILE = 'CHANGELOG.md';
// 一级标题即条目，只有文档自身的节标题不算。
// 为什么不是 /^# \[/：QM-6 外部评审实测 origin/main 有 1,164 行一级标题，1,140 行是 `# [` 形，
// 另有 2 种**真条目**写作 `# fix(自检门禁): …（#2648，2026-09-30）`（各重复 4 次）。旧判据对这 8 行
// 失明 —— 删掉其中任何一条，棘轮照报 PASS，而这正是本门禁存在的唯一理由。非条目的一级标题实测只有
// `# CHANGELOG`（重复 16 次），故用节标题否定式排除，而不是"猜条目长什么样"的正向白名单。
const HEADING_RE = /^# (?!CHANGELOG(?:\s|$))\S/i;

function parseArgs(argv) {
  const opts = { base: 'HEAD^', head: 'HEAD', json: false, root: process.cwd() };
  for (const a of argv) {
    if (a.startsWith('--base=')) opts.base = a.slice(7);
    else if (a.startsWith('--head=')) opts.head = a.slice(7);
    else if (a.startsWith('--root=')) opts.root = a.slice(7);
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--')) { console.error('unknown option: ' + a); process.exit(2); }
  }
  return opts;
}

/** 取某个 ref 上该文件的文本；读不到一律抛，不返回空串（空串会被下游当成「零条目」判过）。 */
function readBlobText(git, ref, file) {
  let buf;
  try {
    buf = git(['cat-file', 'blob', ref + ':' + file]);
  } catch (e) {
    throw new Error(`读不到 ${ref}:${file} —— ${(e.stderr || e.message || '').toString().trim().slice(0, 160)}`);
  }
  // 条目标题判据先按 CR 归一：本仓工作树是 CRLF、blob 是 LF，混行尾会把同一标题读成两种。
  return buf.toString('utf8').replace(/\r/g, '');
}

function headingsOf(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trimEnd();
    if (HEADING_RE.test(t)) out.push(t);
  }
  return out;
}

/**
 * 纯判据：不含 git/IO，方便被「假 git」注入测（真仓 root 在 CI 与本仓测试里是两回事，
 * 任何把 root 写死成 __dirname 的判据换个 cwd 就失效 —— 已踩过）。
 */
function compareMultisets(baseHeadings, headHeadings) {
  const need = new Map();
  for (const h of baseHeadings) need.set(h, (need.get(h) || 0) + 1);
  const have = new Map();
  for (const h of headHeadings) have.set(h, (have.get(h) || 0) + 1);
  const lost = [];
  for (const [h, n] of need) {
    const m = have.get(h) || 0;
    if (m < n) lost.push({ heading: h, wanted: n, got: m });
  }
  return { lost, baseTotal: baseHeadings.length, headTotal: headHeadings.length };
}

function collect({ base, head, root, git } = {}) {
  const runGit = git
    || ((args) => execFileSync('git', ['-C', root || process.cwd(), ...args], { maxBuffer: 1 << 28 }));
  const baseText = readBlobText(runGit, base, FILE);
  const headText = readBlobText(runGit, head, FILE);
  const baseHeadings = headingsOf(baseText);
  const headHeadings = headingsOf(headText);
  if (baseHeadings.length === 0) {
    throw new Error(`fail closed：${base}:${FILE} 读出 0 条标题 —— 空遍历不得判为「零丢失」（扫描域退化就是假绿）`);
  }
  const r = compareMultisets(baseHeadings, headHeadings);
  return {
    ...r,
    baseBytes: Buffer.byteLength(baseText),
    headBytes: Buffer.byteLength(headText),
    baseDistinct: new Set(baseHeadings).size,
    headDistinct: new Set(headHeadings).size,
  };
}

function main(argv) {
  const opts = parseArgs(argv);
  let r;
  try {
    r = collect(opts);
  } catch (e) {
    console.error('[changelog-growth] FAIL(closed)：' + e.message);
    return 1;
  }
  if (opts.json) console.log(JSON.stringify(r));
  if (r.lost.length > 0) {
    const shown = r.lost.slice(0, 20);
    console.error(`[changelog-growth] FAIL：CHANGELOG.md 少了 ${r.lost.length} 种条目`
      + `（标题多重集不再包含 base：base ${r.baseTotal} 条 -> head ${r.headTotal} 条，`
      + `字节 ${r.baseBytes} -> ${r.headBytes}）`);
    for (const l of shown) console.error(`  - 缺 ${l.wanted - l.got}/${l.wanted} 份：${l.heading.slice(0, 90)}`);
    if (r.lost.length > shown.length) console.error(`  …（仅显示前 ${shown.length} 种）`);
    console.error('[changelog-growth] 正解：把丢掉的条目按原文插回去（base = ' + opts.base + '），不要在本次改动里重写整份台账。');
    console.error('[changelog-growth] 取证写法：git cat-file blob ' + opts.base + ':CHANGELOG.md');
    return 1;
  }
  console.log(`[changelog-growth] PASS：base ${r.baseTotal} 条（${r.baseDistinct} 种标题）全部在 head ${r.headTotal} 条（${r.headDistinct} 种）里，`
    + `字节 ${r.baseBytes} -> ${r.headBytes}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { FILE, HEADING_RE, collect, compareMultisets, headingsOf, readBlobText, main };
