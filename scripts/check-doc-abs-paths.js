#!/usr/bin/env node
/**
 * check-doc-abs-paths.js — 文档绝对路径有效性门禁
 *
 * ## 为什么存在（#3000 的逃逸分析）
 *
 * 仓库根目录 2026-10-06 改名后，文档里的**绝对路径**不会跟着改，于是静默失效：
 * 运维手册里 `cd D:\...\<旧名>\apps\desktop` 照着敲必然失败。
 * 此前**没有任何门禁**检查「文档写的本机路径是否还存在」——
 * check-no-brand-residue.js 只管品牌词，不管路径有效性。
 *
 * ## 扫描范围：只查本次改动的文档（同 check-docs-sync.sh 的口径）
 *
 * 这是 2026-10-07 实测后的关键设计决定。最初版本扫全仓，实测检出 100+ 处"失效"，
 * 逐条核对后**绝大多数不是缺陷**：
 *   - 历史文档引用**已删除**的临时 worktree / `D:\Temp\` 临时产物
 *   - CI runner 路径（`C:\Users\RUNNER`）
 *   - 归档快照记录的当时事实
 * 要求把它们逐条"修好"等于**篡改历史**。
 *
 * 真正的缺陷类别只有一个：**有人改了这个文档，而文档里的路径是陈的**。
 * 这正是 `--base..--head` 改动集能精确覆盖的形态，也与同族门禁
 * `check-docs-sync.sh` 保持同一口径。`--all` 保留全量审计模式（人工用）。
 *
 * ## 判定口径（刻意保守，宁可漏报不可误伤）
 *
 * 只在同时满足下列**全部**条件时报红：
 *   1. 出现在**本次改动**的受管文档里（`--all` 时为全仓受管文档）
 *   2. 形如 Windows 本机绝对路径（盘符 + 冒号 + 斜杠）
 *   3. 该盘符**在本机真实存在**（非本机盘符无从判定，直接跳过）
 *   4. 不指向 CI runner 账号 / 云沙箱（那是别的机器的环境）
 *   5. 逐级 Test-Path 时，某一级在磁盘上确实不存在
 *
 * **不判红**的情况（各有回归测试锁住）：
 *   - 纯产品品牌名 / npm scope —— 品牌不是路径
 *   - Linux 部署路径 `/opt/...` `/srv/...`、云沙箱 `/sessions/...` —— 非本机
 *   - 占位符路径（`<cdpPort>`、`${VAR}`、`*`、`...`）
 *   - 归档快照目录（记录的是当时事实）
 *
 * ## 三个实测踩坑（改这块代码前必读）
 *
 * 1. **盘符根必须用 `'D:' + path.sep`**，不能写 `'D:'.replace(/:$/, path.sep)`——
 *    后者产出**两字符** `D\`（replace 把冒号一起吃掉了），后续 path.join 拼出
 *    `\Data\...` 这类无盘符相对路径，existsSync 恒 false → 全量误报。
 * 2. **路径段不能贪心吞标点**。早期用宽松的 `[^\\/:*?"<>|\r\n]+` 收段，会把
 *    `D:\...\ops-center`。截。整句吞成一个路径。段字符集必须排除中文句读。
 * 3. **`--root` 必须同时认 `--root=X` 与 `--root X`**。只认等号形式时，
 *    空格形式会被静默忽略 → 扫到**真实仓库**而不是 fixture，所有自测假红。
 *
 * ## 用法
 *
 *   node scripts/check-doc-abs-paths.js --base=origin/main --head=HEAD
 *   node scripts/check-doc-abs-paths.js --all --root=<dir>      # 全量审计（人工）
 *
 * exit 0 = 通过；exit 1 = 检出失效路径（明细写 stderr）。
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ---- CLI ----
// 同时接受 `--root=X` 与 `--root X` 两种形式（见文件头「实测踩坑 3」）。
const argv = process.argv.slice(2);
let root = path.join(__dirname, '..');
let base = null;
let head = 'HEAD';
let all = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[i + 1];
    if (v === undefined) {
      process.stderr.write(`[check-doc-abs-paths] ${a} 缺少取值\n`);
      process.exit(2);
    }
    i += 1;
    return v;
  };
  if (a.startsWith('--root=')) root = path.resolve(a.slice('--root='.length));
  else if (a === '--root') root = path.resolve(next());
  else if (a.startsWith('--base=')) base = a.slice('--base='.length);
  else if (a === '--base') base = next();
  else if (a.startsWith('--head=')) head = a.slice('--head='.length);
  else if (a === '--head') head = next();
  else if (a === '--all') all = true;
  else if (a === '--help' || a === '-h') {
    process.stdout.write(
      '用法: node scripts/check-doc-abs-paths.js [--base=<ref> --head=<ref>] [--all] [--root=<dir>]\n'
    );
    process.exit(0);
  }
}

// ---- 受管范围 ----
const SCAN_ROOTS = ['01-docs', 'docs', 'openspec', '.github', 'scripts', '.hermes', '.ccg'];
const SCAN_EXTS = new Set(['.md', '.sh', '.ps1', '.js', '.yml', '.yaml', '.json']);
const SCAN_EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'dist-electron', 'coverage',
  '.playwright-browsers', 'build', '.next',
]);
// 归档快照：记录当时事实，改写即篡改历史
const ARCHIVE_DIR_PATTERNS = [
  /(^|\/)openspec\/changes\/archive\//,
  /(^|\/)\.ci-forensics\//,
  /(^|\/)\.plan\//,
  /(^|\/)01-docs\/retros\//,
  /(^|\/)01-docs\/archive\//,
  /(^|\/)\.adversarial\//,
  /(^|\/)\.workbuddy\//,
];

// ---- 本机绝对路径：盘符 + 冒号 ----
// 必须排除 POSIX 绝对路径（/opt、/srv、/sessions…）与 URL（https://、file:///）。
// 关键判据：盘符**后紧跟**冒号+斜杠，且冒号前只有一个 ASCII 字母。
//
// 段字符集必须排除中文句读（见文件头「实测踩坑 2」）：早期用宽松的
// `[^\\/:*?"<>|\r\n]+` 收段，会把 `D:\...\ops-center`。截。整句吞成一个路径。
const WIN_SEG = '[A-Za-z0-9 _.\\-\\u4e00-\\u9fff]';
// 段内允许的成对包裹符（Markdown 行内代码 / 括号包裹路径片段）
const WRAP_TAIL = [
  '`[^`]*`',
  '\\([^)]*\\)',
  '（[^）]*）',
  '\\[[^\\]]*\\]',
].join('|');
const SEG = `(?:${WRAP_TAIL}|${WIN_SEG}+)`;
const WIN_ABS_RE = new RegExp(
  `(^|[^\\w])((?:[A-Za-z]:[\\\\/](?:${SEG}[\\\\/])*${SEG}))`,
  'g'
);

// 占位符 / 变量 / 通配符：静态无法判定，一律跳过
const PLACEHOLDER_RE = /<[^>]*>|\$\{[^}]*\}|\$[A-Za-z_]\w*|\*|\.\.\./;

// 非本机路径：CI runner 账号 / 云沙箱。这些写在文档里是**记录别的机器的环境**，
// 按本机 Test-Path 判定必然误报（2026-10-07 实测：`C:\Users\RUNNER` 在本机
// C: 存在，于是被判"失效"，实为 CI runner 账号）。
const NON_LOCAL_PATH_RE =
  /^[A-Za-z]:[\\/]Users[\\/](?:RUNNER|runneradmin|runner|Administrator|administrator)[\\/]/i;

function looksLikeRealPath (frag) {
  // 冒号后必须紧跟斜杠（`C:/` 或 `C:\`），否则不是路径（排除 `C: 是分区符`、`A:1 比例`）
  if (!/^[A-Za-z]:[\\/]/.test(frag)) return false;
  // 非本机环境（CI runner 账号 / 云沙箱）不是本机路径，无从判定
  if (NON_LOCAL_PATH_RE.test(frag)) return false;
  return true;
}

/**
 * 本机真实存在的盘符集合。
 *
 * CI runner 上不存在 `D:`，若对非本机盘符也做判定，任何 `D:\...` 都会被判"失效"
 * ——纯环境噪声。只认本机盘符：无法判定 ≠ 失效。
 */
function existingDriveRoots () {
  const roots = new Set();
  for (const d of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    for (const sep of ['\\', '/']) {
      try {
        if (fs.existsSync(d + ':' + sep)) roots.add(d.toUpperCase() + ':');
      } catch { /* 探测失败即视为不存在 */ }
    }
  }
  return roots;
}

function isArchived (relPath) {
  const norm = relPath.split(path.sep).join('/');
  return ARCHIVE_DIR_PATTERNS.some((re) => re.test(norm));
}

/** 该路径是否属于受管文档 */
function isManagedDoc (relPath) {
  const norm = relPath.split(path.sep).join('/');
  if (isArchived(norm)) return false;
  if (!SCAN_EXTS.has(path.extname(norm).toLowerCase())) return false;
  return SCAN_ROOTS.some((r) => norm === r || norm.startsWith(r + '/'));
}

/**
 * 逐级判定路径在本机是否存在；返回第一级缺失的相对片段，无缺失则 null。
 *
 * 只对**本机存在的盘符**判定（见 existingDriveRoots）；非本机盘符一律返回 null。
 */
function firstMissingSegment (frag, driveRoots) {
  const drive = frag.slice(0, 2).toUpperCase();
  if (!driveRoots.has(drive)) return null;

  const norm = frag.replace(/\//g, path.sep);
  const parts = norm.split(path.sep).filter(Boolean); // ['D:', 'Data', ...]
  // 盘符根必须是 `'D:' + path.sep`（三字符 `D:\`）——见文件头「实测踩坑 1」。
  let cur = parts[0] + path.sep;
  if (!fs.existsSync(cur)) return parts[0];
  for (let i = 1; i < parts.length; i++) {
    cur = path.join(cur, parts[i]);
    if (!fs.existsSync(cur)) return parts.slice(0, i + 1).join('/');
  }
  return null;
}

function collectAllManaged () {
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // 该根未启用，不是错误
    }
    for (const e of entries) {
      const abs = path.join(absDir, e.name);
      const rel = relDir ? path.join(relDir, e.name) : e.name;
      if (e.isDirectory()) {
        if (SCAN_EXCLUDE_DIRS.has(e.name)) continue;
        walk(abs, rel);
      } else if (SCAN_EXTS.has(path.extname(e.name).toLowerCase())) {
        if (isManagedDoc(rel)) out.push(rel);
      }
    }
  };
  for (const r of SCAN_ROOTS) walk(path.join(root, r), r);
  return out;
}

/** 本次改动的文件（--base..--head），与 check-docs-sync.sh 同口径 */
function collectChanged (baseRef, headRef) {
  let out;
  try {
    out = execFileSync('git', ['diff', '--name-only', `${baseRef}..${headRef}`], {
      cwd: root,
      encoding: 'utf8',
    });
  } catch {
    // 取证失败必须 fail-closed：回退到全量审计口径，不静默放过
    process.stderr.write(
      `[check-doc-abs-paths] git diff ${baseRef}..${headRef} 取证失败，回退到全量审计口径\n`
    );
    return collectAllManaged();
  }
  return out.split(/\r?\n/).filter(Boolean).filter(isManagedDoc);
}

function scanFile (relPath, driveRoots) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, relPath), 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PLACEHOLDER_RE.test(line)) continue;
    WIN_ABS_RE.lastIndex = 0;
    let m;
    while ((m = WIN_ABS_RE.exec(line)) !== null) {
      const frag = m[2];
      if (!looksLikeRealPath(frag)) continue;
      const missing = firstMissingSegment(frag, driveRoots);
      if (missing) {
        findings.push({
          file: relPath.split(path.sep).join('/'),
          line: i + 1,
          path: frag,
          missing,
        });
      }
    }
  }
  return findings;
}

function main () {
  // 未给 --base 时不做改动集口径（全量审计），避免"看起来在查其实没查"
  const scopeAll = all || !base;
  const files = scopeAll ? collectAllManaged() : collectChanged(base, head);
  const driveRoots = existingDriveRoots();
  const findings = [];
  for (const rel of files) findings.push(...scanFile(rel, driveRoots));

  const scopeDesc = scopeAll
    ? `全量审计（${files.length} 个受管文件）`
    : `改动集 ${base}..${head}（${files.length} 个受管文件）`;

  if (findings.length === 0) {
    process.stderr.write(
      `[check-doc-abs-paths] PASS（${scopeDesc}，无失效的本机绝对路径；已豁免归档快照、占位符与非本机路径）\n`
    );
    return 0;
  }

  process.stderr.write(
    `[check-doc-abs-paths] FAIL：${scopeDesc}中检出 ${findings.length} 处失效的本机绝对路径\n\n`
  );
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, list] of byFile) {
    process.stderr.write(`  ${file}\n`);
    for (const f of list) {
      process.stderr.write(`    L${f.line}: ${f.path}\n`);
      process.stderr.write(`           └─ 磁盘上不存在：${f.missing}\n`);
    }
  }
  process.stderr.write(
    '\n  修法：把路径改指现存的目录。\n' +
    '  若这条路径记录的是"当时"的事实（已删除的临时 worktree、CI runner 路径等），\n' +
    '  它不该出现在本次改动里——考虑撤掉这次文档改动，或把该文件移入归档豁免目录。\n'
  );
  return 1;
}

process.exit(main());
