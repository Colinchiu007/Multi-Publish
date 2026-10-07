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
 * 一次性书面授权（2026-10-07，openspec change: dedup-changelog-history）：
 *   main 上历史遗留的重复副本（实测同一 blob：canonical 1,184 条 / 343 种 ⇒ 冗余 841 份）要清掉，
 *   就必须让"副本减少"这一档被放行。但「削到 1 份」与「削到 3 份」在本门禁语义里是同一类操作，
 *   区别只在数量，而数量是它唯一能区分的信号 —— 实测把「允许削到 1 份」写成**自动**例外，
 *   本文件那条 `真仓库四档…副本删一份=红` 当场翻绿（tests 11 / pass 10 / fail 1）。
 *   所以例外不做成默认判据的一部分，而是要求 head **相对 base 新增**一份授权文件
 *   `scripts/changelog-dedup-authorization.json`，并核对它声明的坐标系与实际 base 的 sha，
 *   再逐条验证清理形状（恰好 1 份 / 保留份逐字节同源 / 一个标题都不许消失 / 声明数字与实际相符）。
 *   没有授权文件时，本门禁的行为与加例外之前**逐字相同**；授权文件在 base 已存在也不生效，
 *   免得后续 PR 白蹭一张已经进历史的通行证。
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
const entries = require('./changelog-entries.js');

const FILE = 'CHANGELOG.md';
// 一次性书面授权的落点：只有 head 相对 base **新增**了这个文件，才允许"清理形状"通过（见下）。
const AUTH_PATH = 'scripts/changelog-dedup-authorization.json';
// 一级标题即条目，只有文档自身的节标题不算。**判据本体已上移到 changelog-entries.js（单一实现）**，
// 因为实测发现两把锁对"什么是一条条目"各有口径（同一份 origin/main blob：本门禁 1,184 条 /
// 副本棘轮按 `# [未发布]` 只数到 1,158 条），任何一侧的清理都可能落在另一侧盲区。
// 为什么不是 /^# \[/：QM-6 外部评审实测 origin/main 有 1,164 行一级标题，1,140 行是 `# [` 形，
// 另有 2 种**真条目**写作 `# fix(自检门禁): …（#2648，2026-09-30）`（各重复 4 次）。旧判据对这 8 行
// 失明 —— 删掉其中任何一条，棘轮照报 PASS，而这正是本门禁存在的唯一理由。非条目的一级标题实测只有
// `# CHANGELOG`（重复 16 次），故用节标题否定式排除，而不是"猜条目长什么样"的正向白名单。
const HEADING_RE = entries.HEADING_RE;

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
  // 口径来自单一实现；这里曾是本地一份 split+test 的循环，与 changelog-entries 逐字等价但会漂移。
  return entries.headingsOf(text);
}

/** 取 blob 的**原始字节文本**；文件不存在返回 null（授权文件"缺席"是一个合法状态，不得抛）。 */
function readBlobOrNullText(git, ref, file) {
  try {
    return git(['cat-file', 'blob', ref + ':' + file]).toString('utf8');
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString();
    if (/does not exist|path|not found|fatal/i.test(msg)) return null;
    throw new Error(`读 ${ref}:${file} 失败（非"文件不存在"，不得当作缺席）—— ${msg.trim().slice(0, 160)}`);
  }
}

/** 把 ref 解析成 sha：授权的坐标系比较必须落在 sha 上，`HEAD^` 这种写法不能直接和 JSON 里的 sha 比。 */
function resolveSha(git, ref) {
  try {
    return git(['rev-parse', ref]).toString('utf8').trim();
  } catch (e) {
    throw new Error(`解析 ${ref} 失败 —— ${(e.stderr || e.message || '').toString().trim().slice(0, 160)}`);
  }
}

const AUTH_REQUIRED = ['applies_to_base', 'reason', 'owner_pr', 'expected_titles_reduced', 'expected_entries_after'];

/**
 * 判授权是否成立。**默认路径必须返回 granted:false 且 fatal:null** ——
 * 也就是"没有授权 = 一切照旧"，任何异常都只能是 fatal，不许悄悄当成没授权。
 */
function evaluateAuthorization({ authHeadText, authBaseText, baseSha }) {
  if (authHeadText === null) return { granted: false, fatal: null };
  if (authBaseText !== null) {
    return { granted: false, fatal: `授权文件不是本次新增（base 里已存在 ${AUTH_PATH}）—— 例外只服务一次性清理，不得被后续 PR 白蹭` };
  }
  let obj;
  try { obj = JSON.parse(authHeadText); } catch (e) {
    return { granted: false, fatal: `授权 JSON 不可解析：${String(e.message || e).slice(0, 120)}` };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { granted: false, fatal: '授权 JSON 必须是一个对象' };
  for (const k of AUTH_REQUIRED) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') return { granted: false, fatal: `授权缺少必填字段 ${k}` };
  }
  if (!/^[0-9a-f]{7,40}$/i.test(String(obj.applies_to_base))) return { granted: false, fatal: '授权的 applies_to_base 不是合法 sha' };
  if (typeof obj.expected_titles_reduced !== 'number' || !Number.isInteger(obj.expected_titles_reduced) || obj.expected_titles_reduced < 1) {
    return { granted: false, fatal: 'expected_titles_reduced 必须是 >=1 的整数' };
  }
  if (typeof obj.expected_entries_after !== 'number' || !Number.isInteger(obj.expected_entries_after) || obj.expected_entries_after < 1) {
    return { granted: false, fatal: 'expected_entries_after 必须是 >=1 的整数' };
  }
  if (String(obj.applies_to_base).toLowerCase() !== String(baseSha).toLowerCase()) {
    return {
      granted: false,
      fatal: `授权的 applies_to_base=${String(obj.applies_to_base).slice(0, 12)} 与本次 base 坐标系 ${String(baseSha).slice(0, 12)} 不等`
        + ' —— 坐标系错位时不得退化成"没有授权"再按普通红混过去，必须点名',
    };
  }
  return { granted: true, auth: obj };
}

/**
 * 清理形状判据（四条同时成立才算"清了一次重复副本"，而不是"顺手删了点东西"）：
 *  ① base 里的每一个标题在 head 里都至少还剩 1 份（少一个标题＝#2884 那种整份删空，任何例外都不救）；
 *  ② 被减少的标题在 head 里必须**恰好剩 1 份**（"4 份削到 2 份"不算清理）；
 *  ③ 那一份必须与 base 中同标题的某一块**逐字节相同**（授权只覆盖删副本，不覆盖顺便改正文）；
 *  ④ head 里允许出现 base 没有的新标题（本 PR 自己那条台账），但不得出现 base 没有的**份数增长**。
 */
function checkDedupShape(baseText, headText) {
  const bBlocks = entries.splitEntries(baseText).blocks;
  const hBlocks = entries.splitEntries(headText).blocks;
  const bg = entries.groupByTitle(bBlocks);
  const hg = entries.groupByTitle(hBlocks);
  const problems = [];
  let titlesReduced = 0;
  let copiesRemoved = 0;
  for (const [t, bo] of bg) {
    const ho = hg.get(t) || [];
    if (ho.length === 0) { problems.push({ title: t, kind: '标题消失', from: bo.length, to: 0 }); continue; }
    if (ho.length === bo.length) continue;
    if (ho.length > bo.length) { problems.push({ title: t, kind: '副本变多', from: bo.length, to: ho.length }); continue; }
    if (ho.length !== 1) { problems.push({ title: t, kind: '只削一半', from: bo.length, to: ho.length }); continue; }
    const kept = hBlocks[ho[0].index];
    if (!bo.some((o) => bBlocks[o.index] === kept)) { problems.push({ title: t, kind: '保留份与 base 任何一份都不逐字节相同', from: bo.length, to: 1 }); continue; }
    titlesReduced += 1;
    copiesRemoved += bo.length - 1;
  }
  return {
    problems,
    titlesReduced,
    copiesRemoved,
    headEntries: hBlocks.length,
    baseEntries: bBlocks.length,
    headDistinct: hg.size,
    baseDistinct: bg.size,
  };
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
  // stdio 必须显式设成 pipe：execFileSync 默认把 stderr 继承给父进程，
  // 于是"base 里没有授权文件"这条**正常信号**会以 `fatal: ... exists on disk, but not in <ref>`
  // 的形式混进判据输出，读起来像出错了（而且 e.stderr 拿不到，错误文案会退化成裸 message）。
  const runGit = git
    || ((args) => execFileSync('git', ['-C', root || process.cwd(), ...args], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }));
  const baseText = readBlobText(runGit, base, FILE);
  const headText = readBlobText(runGit, head, FILE);
  const baseHeadings = headingsOf(baseText);
  const headHeadings = headingsOf(headText);
  if (baseHeadings.length === 0) {
    throw new Error(`fail closed：${base}:${FILE} 读出 0 条标题 —— 空遍历不得判为「零丢失」（扫描域退化就是假绿）`);
  }
  const r = compareMultisets(baseHeadings, headHeadings);
  const out = {
    ...r,
    baseBytes: Buffer.byteLength(baseText),
    headBytes: Buffer.byteLength(headText),
    baseDistinct: new Set(baseHeadings).size,
    headDistinct: new Set(headHeadings).size,
  };
  // 默认判据过了就直接返回 —— 授权通路只在"默认已经红"的时候才被看一眼，
  // 这样"没有授权文件的 PR"的行为与本 change 之前逐字相同（含 真仓库四档…副本删一份=红）。
  if (r.lost.length === 0) return out;

  let ev;
  try {
    const authHeadText = readBlobOrNullText(runGit, head, AUTH_PATH);
    if (authHeadText === null) return out;
    const authBaseText = readBlobOrNullText(runGit, base, AUTH_PATH);
    ev = evaluateAuthorization({ authHeadText, authBaseText, baseSha: resolveSha(runGit, base) });
  } catch (e) {
    out.authorizationError = e.message;
    return out;
  }
  if (!ev.granted) { out.authorizationError = ev.fatal; return out; }

  const shape = checkDedupShape(baseText, headText);
  const complaints = [];
  if (shape.problems.length > 0) {
    complaints.push(`清理形状不合格 ${shape.problems.length} 项：`
      + shape.problems.slice(0, 5)
        .map((p) => `${p.kind}「${p.title.slice(0, 60)}」${p.from}→${p.to}`).join('；'));
  }
  if (shape.titlesReduced !== ev.auth.expected_titles_reduced) {
    complaints.push(`实减 ${shape.titlesReduced} 种标题，与授权声明的 ${ev.auth.expected_titles_reduced} 不符`);
  }
  if (shape.headEntries !== ev.auth.expected_entries_after) {
    complaints.push(`head 实有 ${shape.headEntries} 条条目，与授权声明的 expected_entries_after=${ev.auth.expected_entries_after} 不符`);
  }
  if (complaints.length > 0) {
    out.authorizationError = '已给出授权，但清理形状/声明数字对不上：' + complaints.join(' ｜ ');
    return out;
  }
  // 授权成立：默认判据报出的那些"丢失"全部是同一标题的冗余副本，且保留份与 base 逐字节同源。
  return {
    ...out,
    lost: [],
    authorization: {
      path: AUTH_PATH,
      ownerPr: ev.auth.owner_pr,
      appliesToBase: ev.auth.applies_to_base,
      titlesReduced: shape.titlesReduced,
      copiesRemoved: shape.copiesRemoved,
      baseEntries: shape.baseEntries,
      headEntries: shape.headEntries,
    },
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
  if (r.authorizationError) {
    console.error(`[changelog-growth] FAIL(授权)：${r.authorizationError}`);
    if (r.lost.length > 0) console.error(`[changelog-growth] 且按默认判据仍报 ${r.lost.length} 种条目缺失（坐标系 ${opts.base}）`);
    console.error(`[changelog-growth] 正解：授权通路只服务「每个被减少的标题削到恰好 1 份、保留份与 base 逐字节同源、一个标题都不许消失」的一次性清理；`);
    console.error(`[changelog-growth] 不满足就按原文把条目插回去（base = ${opts.base}），不要在本次改动里重写整份台账。`);
    return 1;
  }
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
  if (r.authorization) {
    const a = r.authorization;
    // 例外生效必须出声：静默放行等于"判据被人改宽了但没人知道"，那正是本仓反复出事的形态。
    console.log(`[changelog-growth] 例外由授权触发：${a.titlesReduced} 种标题各削到 1 份、共减少 ${a.copiesRemoved} 份副本，`
      + `条目 ${a.baseEntries} -> ${a.headEntries}（${a.path}，owner_pr=${a.ownerPr}，applies_to_base=${String(a.appliesToBase).slice(0, 12)}）`);
  }
  console.log(`[changelog-growth] PASS：base ${r.baseTotal} 条（${r.baseDistinct} 种标题）全部在 head ${r.headTotal} 条（${r.headDistinct} 种）里，`
    + `字节 ${r.baseBytes} -> ${r.headBytes}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  FILE,
  HEADING_RE,
  AUTH_PATH,
  collect,
  compareMultisets,
  headingsOf,
  readBlobText,
  evaluateAuthorization,
  checkDedupShape,
  main,
};
