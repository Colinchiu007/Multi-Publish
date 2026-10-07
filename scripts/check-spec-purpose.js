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
 * ④ **逐段判，不只看第一段**：一份文件可以有多个 `## Purpose`（重复标题本身就该被查），
 *    只查第一段会把「第一段写好、第二段留 TBD」读成合规（QM-6 后端轴 B1）。
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
// ⚠️ 职责边界（QM-6 B5 追问后写明）：这条**只**防「扫描域退化成一个不相干的目录」。
// 「TBD 重新积累」不靠它拦 —— 每一份违规都独立进 bad 并使 rc=1，与总数无关；
// 「加 100 份 TBD、删 100 份好的」在旧实现下同样当场红 100 条，不是漏判面。
const DEFAULT_MIN_SPECS = 50;

// 归档器留下的原话，以及换措辞的占位；一律只看 Purpose 正文开头。
//
// 为什么不写成形态泛化（AGENTS.md「枚举式黑名单必须配结构化正向契约」要求这里要么有理由、
// 要么有泛化规则，二选一，本处是有理由的例外）：
// ① 危害面是"没填"，不是"填得烂" —— 泛化规则（例如"首行不含句号即判占位"）会把
//    合法的一句话式 Purpose（本仓 #3084 批量填的就是「定义 X 的行为契约，判据只认下列 Requirement…」）
//    整片判红，那正是本门禁要被绕开的第一动机。
// ② 上游模板是**有限且已知**的：`openspec` 归档器恒写
//    `TBD - created by archiving change <name>. Update Purpose after archive.`（实测现仅存于我方引文中，
//    151 份主规格 0 命中）。所以枚举表覆盖的是真实来源，不是打地鼠。
// ③ 中文项是**故意早触发**的毛刺判据：`待补充 / 待定 / 待完善 / 待更新 / 占位` 出现在 Purpose
//    **第一个字符**起时，无论后接什么都是一句自述"还没写"。它的对偶（合法词不得误杀）由
//    `check-spec-purpose.test.js` 的负控用例钉住 —— 「待办事项管理器…」以「待」开头但不是「待定」。
// 已知边界（如实写，不假装闭合）：`TBA`、`稍后补`、`XXX` 这类未登记词会放过。
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
  // 排除按**完整前缀**锚定，不按路径段名猜：写成 /(^|\/)changes\// 会把
  // `openspec/specs/changes/spec.md`（能力恰好叫 changes）静默排除掉 —— 那正是要查的东西。
  // 增量规格（openspec/changes/<name>/specs/…）与归档件不在域内：那里的 TBD 属正常生命周期。
  if (relStarts(norm, 'openspec/changes/')) return false;
  if (relStarts(norm, 'openspec/specs/archive/')) return false;
  return true;
}

function relStarts (norm, prefix) {
  return norm === prefix || norm.startsWith(prefix);
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
 * 从一份规格文本里取出**所有** Purpose 段正文（按出现顺序）；没有 Purpose 标题则返回空数组。
 *
 * ⚠️ 这里刻意**不用带 `m` 的正则**写"到下一个标题为止"。上一版写成
 * `/^##[ \t]*Purpose[ \t]*\r?\n([\s\S]*?)(?=\r?\n##[ \t]|\r?\n#[^#]|$)/m`，
 * 其中的 `$` 在多行模式下会**匹配空行行尾**：`## Purpose` 之后按惯例有一个空行，
 * 于是正文被收成空串 ⇒ 15 份**明明写好 Purpose 的**规格被判成 EMPTY（真实文件：
 * openspec/specs/creator-monitor/spec.md）。判据按文本形态猜就会这样骗人，
 * 所以改成逐行扫，并让"空行"与"下一个标题"各归各位。
 *
 * 返回数组而不是单个正文：只查第一段会让「第一段写好、第二段留 TBD」静默通过
 * （QM-6 后端轴 B1）。逐段判才有独占红出口。
 *
 * 层级接受 `##` 与 `###`（B2）；但**不接受** `##Purpose` —— CommonMark 的 ATX 标题要求
 * `#` 序列之后跟空格/制表符或行尾，`##Purpose` 是普通段落，报"没有 Purpose 段"是正确判定。
 * 前导 BOM 先剥（B3，Windows 编辑器会写；不剥时首行 `## Purpose` 匹配不上 ⇒ 误报缺段）。
 * 代码围栏内的 `#` 不是标题。
 */
function purposeBodiesOf (text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const bodies = [];
  let cur = null;
  let inFence = false;
  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) {
      inFence = !inFence;
      if (cur) cur.push(line);
      continue;
    }
    if (!inFence && /^#{2,3}[ \t]+Purpose[ \t]*$/i.test(line)) {
      cur = [];
      bodies.push(cur);
      continue;
    }
    if (!inFence && /^#{1,6}[ \t]/.test(line)) { cur = null; continue; }
    if (cur) cur.push(line);
  }
  return bodies.map((b) => b.join('\n'));
}

/** 一份规格文本 → 违规清单（空数组 = 合规）；每个违规段落一条，缺段一条 */
function violationsOf (text) {
  const bodies = purposeBodiesOf(text);
  if (bodies.length === 0) return [{ reason: 'MISSING_SECTION', detail: '', section: 0 }];
  const out = [];
  bodies.forEach((body, i) => {
    const reason = evaluatePurpose(body);
    if (reason) {
      out.push({ reason, detail: body.replace(/\r/g, '').trim().slice(0, 120), section: i, sections: bodies.length });
    }
  });
  return out;
}

function check (opts = {}) {
  const root = opts.root || process.cwd();
  if (opts.minSpecs !== undefined && (!Number.isInteger(opts.minSpecs) || opts.minSpecs < 0)) {
    // 调用方给坏值不得静默回落默认（那等于把退化防线换成一个没人看见的缺省）
    throw new Error('[spec-purpose] minSpecs 必须是有限非负整数，实到 ' + JSON.stringify(opts.minSpecs));
  }
  const minSpecs = opts.minSpecs === undefined ? DEFAULT_MIN_SPECS : opts.minSpecs;
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
    for (const v of violationsOf(text)) {
      bad.push({
        file: rel,
        reason: v.reason,
        detail: v.detail,
        section: v.sections > 1 ? v.section + 1 : undefined,
      });
    }
  }
  const badFiles = new Set(bad.map((b) => b.file)).size;
  return { ok: bad.length === 0, total: files.length, unreadable, badFiles, bad };
}

const USAGE = [
  '用法：node scripts/check-spec-purpose.js [--root=<目录>|--root <目录>] [--min-specs=<N>|--min-specs <N>]',
  '                                    [--limit=<N>|--limit <N>] [--json] [--help]',
  '',
  '  扫 openspec/specs/**/spec.md 的 Purpose 段；缺段 / 空段 / 占位词开头 ⇒ rc=1 并逐条点名。',
  '  --root      仓库根（默认 process.cwd()）；等号式与空格式都接受 —— 最近的同族判据',
  '              check-doc-abs-paths.js 的文件头专门记录过「只认等号式会被静默忽略」的事故。',
  '  --min-specs 规模下界（默认 ' + DEFAULT_MIN_SPECS + '）。必须是**有限非负整数**；畸形值一律 rc=2 出声，',
  '              不得静默回落默认值 —— 回落等于把「扫描域退化」这条防线换成一个没人看见的缺省。',
  '  --limit     违规明细最多打印几条（默认 20）。同样必须是有限非负整数：NaN 会让 slice(0, NaN) 返回空数组，',
  '              即"一条都不列出但 rc 仍为 1"，把逐条点名这条核心输出静默吞掉。',
  '  --json      只输出一行 JSON（total + bad），供批量编排消费。',
  '',
  '退出码语义（刻意保持，并与同族判据一致）：0 = 全部合规；1 = 有违规**或**判据自身故障（扫描域不存在 /',
  '为空 / 低于下界 / 文件读不动），后者文案一律带 "FAIL(closed)" 前缀；2 = 用法错误（未知选项或畸形数值）。',
  '1 之所以不拆成两个码：本仓同族判据（check-doc-abs-paths.js 等）就是「用法 2 / 不通过 1」，拆开会让',
  'CI 侧与人工排障侧多记一套约定，而区分「没打到东西」与「真有违规」的责任由文案承担（点名扫描域与原因码）。',
].join('\n');

function parseArgs (argv) {
  const opts = { root: process.cwd(), json: false, minSpecs: DEFAULT_MIN_SPECS, limit: 20 };
  const bad = [];
  const num = (label, raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) bad.push(label + '=' + raw + '（必须是有限非负整数）');
    return n;
  };
  const list = argv || [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(0, eq) : a;
    // 空格式取值：`--root <目录>` 与 `--root=<目录>` 都接受（与最近的同族判据同形，见 USAGE）
    let val = eq >= 0 ? a.slice(eq + 1) : null;
    if (val === null && (key === '--root' || key === '--min-specs' || key === '--limit')) {
      val = list[i + 1];
      if (val !== undefined) i++;
    }
    if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') { console.log(USAGE); opts.help = true; }
    else if (key === '--root') {
      if (val === undefined || val === '') { bad.push('--root 缺取值'); continue; }
      opts.root = path.resolve(val);
    } else if (key === '--min-specs') {
      if (val === undefined) { bad.push('--min-specs 缺取值'); continue; }
      opts.minSpecs = num('--min-specs', val);
    } else if (key === '--limit') {
      if (val === undefined) { bad.push('--limit 缺取值'); continue; }
      opts.limit = num('--limit', val);
    } else {
      bad.push('unknown option: ' + a);
    }
  }
  if (bad.length) {
    bad.forEach((b) => console.error('[spec-purpose] ' + b));
    console.error(USAGE.split('\n')[0]);
    opts.usageError = true;
  }
  return opts;
}

function main (argv) {
  const opts = parseArgs(argv);
  if (opts.help) return 0;
  // 用法错误必须出声：静默回落会让"我给了个坏值"变成"它按缺省跑过且通过"
  if (opts.usageError) return 2;
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
      const where = b.section ? `${b.file} 第 ${b.section} 个 Purpose 段` : b.file;
      console.log(`  ${b.reason.padEnd(15)} ${where}${b.detail ? '  :: ' + b.detail.split('\n')[0].slice(0, 90) : ''}`);
    });
    if (r.bad.length > opts.limit) console.log(`  …另有 ${r.bad.length - opts.limit} 处未列出（--limit 控制明细条数，判据本身不受影响）`);
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

// ⚠️ 必须显式把 argv 传进去：上一版写成 main()，而 main 的形参没有缺省值，
// parseArgs(undefined) 于是按"零参数"跑 —— **所有命令行选项被静默忽略**，
// --root/--limit/--help 全部失效（--help 反而照常扫全仓并 rc=0）。
// 这条由 check-spec-purpose.test.js 的 CLI 用例钉住（摘掉 slice(2) 必须变红）。
if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { check, collect, evaluatePurpose, purposeBodiesOf, violationsOf, isSpecFile, SPEC_DIR, DEFAULT_MIN_SPECS, main };
