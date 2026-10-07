#!/usr/bin/env node
'use strict';
/*
 * check-spec-purpose.js —— 主规格的 Purpose 不得为空、不得还是归档器留下的 TBD
 *
 * 为什么需要它（实测）：openspec 归档器会在 `openspec/specs/<cap>/spec.md` 写入
 *   TBD - created by archiving change <name>. Update Purpose after archive.
 * 然后**没有任何东西回来追这笔账**：2026-10-07 清点 151 份主规格里 43 份如此
 * （`git grep -l Purpose -- scripts .github` = 0 命中，即零门禁）。那一轮是先一次性填平
 * （PR #3084），本文件把"填平"变成"不再积累"。
 *
 * 三条口径（都不是顺手加的）：
 * ① **全量扫描，不按改动集**。Purpose 缺失由"归档"这个动作引入，与后续谁改了哪个文件无关；
 *    按改动集判 = 只在恰好又改到它时才拦。全量可行的前提是**存量已归零**（#3084 做的正是这件事），
 *    存量未清就上这条会第一天就红成噪声，那种门禁逼人绕 --no-verify。
 * ② **扫描域为空 / 低于规模下界 ⇒ 抛错，不判通过**。「0 个文件」与「0 个违规」在计数上同形，
 *    而前者多半意味着目录被改名或路径写错（本仓"解析退化成空集合即假绿"的同类事故已多次）。
 * ③ **判据按语义特征**，不只认归档器那一句模板：换措辞的占位（`TBD`、`待补充`、`TODO`）同样拦，
 *    但只认**开头**的占位词，避免把" Purpose 里提到了 TBD 这件事"判成缺陷。
 *
 * 接线位置：`.github/workflows/quality-gate.yml` 的 **changes** job（Gate 12d）。
 * 输入 `openspec/**` 命中 docs-only 白名单 ⇒ 接进被 `docs-only != 'true'` 门控的 static-gates
 * 等于给自己关掉校验（AGENTS.md「进白名单前提锁」；同族先例 #2718 账本 JSON、#2745 执行记录、
 * #3000 文档绝对路径）。位置与"排在 classify 之后"由测试里的结构锁钉住。
 */

const fs = require('node:fs');
const path = require('node:path');

const SPEC_DIR = 'openspec/specs';
const FILE_NAME = 'spec.md';
// 下界：当前 main 上实测 151 份。取 50 是"目录整体还在"的粗判据，
// 不是精确期望（精确期望会把正常的规格新增/合并变成假红）。
const DEFAULT_MIN_SPECS = 50;

// 归档器留下的原话，以及换措辞的占位；一律只看 Purpose 正文开头
const PLACEHOLDER_RES = [
  /^TBD\b/i,
  /^TODO\b/i,
  /^待补充/,
  /^待定/,
  /^待完善/,
  /^待更新/,
  /^占位/,
];

function isSpecFile (rel) {
  const norm = rel.split(path.sep).join('/');
  if (!norm.startsWith(SPEC_DIR + '/')) return false;
  if (!norm.endsWith('/' + FILE_NAME) && norm !== SPEC_DIR + '/' + FILE_NAME) return false;
  // 增量规格（openspec/changes/**/specs/...）与归档件不在域内：那里的 TBD 属正常生命周期
  if (/(^|\/)changes\//.test(norm) || /(^|\/)archive\//.test(norm)) return false;
  return true;
}

function walk (dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`[spec-purpose] 扫描域读不动：${dir} —— ${e.code || e.message}（不完整的遍历不得判通过）`);
  }
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, acc);
    else if (ent.isFile() && ent.name === FILE_NAME) acc.push(abs);
  }
  return acc;
}

function collect ({ root } = {}) {
  const base = root || process.cwd();
  const dir = path.join(base, SPEC_DIR);
  if (!fs.existsSync(dir)) {
    throw new Error(`[spec-purpose] 扫描域不存在：${SPEC_DIR}（目录被改名/移动时宁可抛错，不得判"全部合规"）`);
  }
  return walk(dir, []).map((abs) => path.relative(base, abs)).filter(isSpecFile).sort();
}

/** Purpose 段正文 → null（合规）或原因码 */
function evaluatePurpose (body) {
  if (body === null || body === undefined) return 'MISSING_SECTION';
  const trimmed = body.replace(/\r/g, '').trim();
  if (trimmed === '') return 'EMPTY';
  for (const re of PLACEHOLDER_RES) if (re.test(trimmed)) return 'TBD';
  return null;
}

/**
 * 从一份规格文本里取 Purpose 正文；取不到返回 null。
 *
 * ⚠️ 这里刻意**不用带 `m` 的正则**写"到下一个标题为止"。上一版写成
 * `/^##[ \t]*Purpose[ \t]*\r?\n([\s\S]*?)(?=\r?\n##[ \t]|\r?\n#[^#]|$)/m`，
 * 其中的 `$` 在多行模式下会**匹配空行行尾**：`## Purpose` 之后按惯例有一个空行，
 * 于是正文被收成空串 ⇒ 15 份**明明写好 Purpose 的**规格被判成 EMPTY（真实文件：
 * openspec/specs/creator-monitor/spec.md）。判据按文本形态猜就会这样骗人，
 * 所以改成逐行扫，并让"空行"与"下一个标题"各归各位。
 * 代码围栏内的 `#` 不是标题（Purpose 正文极少有围栏，但 Requirements 里有，一并防住）。
 */
function purposeBodyOf (text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##[ \t]+Purpose[ \t]*$/i.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;
  const body = [];
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*```/.test(line)) { inFence = !inFence; body.push(line); continue; }
    if (!inFence && /^#{1,6}[ \t]/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

function check (opts = {}) {
  const root = opts.root || process.cwd();
  const minSpecs = Number.isFinite(opts.minSpecs) ? opts.minSpecs : DEFAULT_MIN_SPECS;
  const files = collect({ root });
  if (files.length === 0) {
    throw new Error('[spec-purpose] 扫描域为空：' + SPEC_DIR + '/**/spec.md 命中 0 个 —— 这不是"全部合规"，是判据没打到东西');
  }
  if (files.length < minSpecs) {
    throw new Error(`[spec-purpose] 扫描到 ${files.length} 份规格，少于下界 ${minSpecs} —— 疑似目录被移动/重命名，拒绝判通过`);
  }
  const bad = [];
  let unreadable = 0;
  for (const rel of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch (e) {
      // 读不动的文件不能静默跳过：跳过的集合就是"以为查过了"的集合
      unreadable++;
      bad.push({ file: rel, reason: 'UNREADABLE', detail: String(e.code || e.message) });
      continue;
    }
    const reason = evaluatePurpose(purposeBodyOf(text));
    if (reason) {
      const body = purposeBodyOf(text);
      bad.push({ file: rel, reason, detail: body === null ? '' : body.replace(/\r/g, '').trim().slice(0, 120) });
    }
  }
  return { ok: bad.length === 0, total: files.length, unreadable, bad };
}

function parseArgs (argv) {
  const opts = { root: process.cwd(), json: false, minSpecs: DEFAULT_MIN_SPECS, limit: 20 };
  for (const a of argv) {
    if (a.startsWith('--root=')) opts.root = path.resolve(a.slice(7));
    else if (a.startsWith('--min-specs=')) opts.minSpecs = Number(a.slice(12));
    else if (a.startsWith('--limit=')) opts.limit = Number(a.slice(8));
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--')) { console.error('[spec-purpose] unknown option: ' + a); process.exit(2); }
  }
  return opts;
}

function main (argv) {
  const opts = parseArgs(argv || process.argv.slice(2));
  let r;
  try {
    r = check(opts);
  } catch (e) {
    console.error('[spec-purpose] FAIL(closed)：' + e.message);
    return 1;
  }
  if (opts.json) {
    console.log(JSON.stringify({ total: r.total, bad: r.bad }));
  } else {
    console.log(`[spec-purpose] 扫描 ${r.total} 份主规格（${SPEC_DIR}/**/${FILE_NAME}），违规 ${r.bad.length}`);
    r.bad.slice(0, opts.limit).forEach((b) => {
      console.log(`  ${b.reason.padEnd(15)} ${b.file}${b.detail ? '  :: ' + b.detail.split('\n')[0].slice(0, 90) : ''}`);
    });
    if (r.bad.length > opts.limit) console.log(`  …另有 ${r.bad.length - opts.limit} 份未列出`);
  }
  if (!r.ok) {
    if (!opts.json) {
      console.log('[spec-purpose] 正解：给每份规格补一句**能从该文件自身逐字复核**的 Purpose'
        + '（能力名取 H1 去掉 " Specification"，判据只列 Requirement 标题与条数），'
        + '不要写成推测语义，也不要靠放宽本判据让它闭嘴。');
    }
    return 1;
  }
  console.log('OK: 所有主规格的 Purpose 均已填写（无 TBD / 无空段 / 无缺段）');
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { check, collect, evaluatePurpose, purposeBodyOf, isSpecFile, SPEC_DIR, DEFAULT_MIN_SPECS, main };
