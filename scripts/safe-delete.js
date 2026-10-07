#!/usr/bin/env node
'use strict';

/**
 * safe-delete —— 删除前强制过「是否 tracked」关的守卫（AGENTS.md R0）
 *
 * 为什么需要它
 * -------------
 * 2026-10-07 单日误删 `.ccg/` 目录 5 次。每次的形态都略有不同（传目录路径、
 * `Get-ChildItem -Recurse`、`Get-ChildItem -File` 枚举……），但**根因完全一样**：
 * 「清理临时产物」时把一个**受管目录**当成了「里面的一个临时文件」。
 *
 * 把它写进记忆 / 文档 / 提交信息都没能阻止第 5 次 —— 因为依赖的是临场自觉，
 * 而临场判断在「git status 里有几个 ?? 文件」这种场景下极易把范围放大。
 * 所以要的是**机械拦截**：让误删在执行的那一刻就不可能发生，而不是事后靠恢复。
 *
 * 三道闸（任一不通过即拒绝，不提供「强制」开关）
 * -----------------------------------------------
 *   1. 目标必须是**文件**，不能是目录
 *      —— `.ccg/` 这类「目录里恰好有几个我生成的文件」正是历次事故的形态
 *   2. 目标必须**未被 git 跟踪**（`git ls-files --error-unmatch` 必须失败）
 *      —— tracked 文件一律不动；要删 tracked 文件请用 git rm，走评审
 *   3. 目标必须以 `??` 出现在 `git status --porcelain` 里
 *      —— 「我以为它是临时的」和「git 说它是未跟踪的」必须是同一件事
 *
 * 附带的第四道闸：目标必须在仓库工作区内。仓库外的路径一律拒绝 ——
 * 跨到 `D:\` 或用户目录的删除不该由一个「清临时产物」脚本顺手做掉。
 *
 * 已知边界（如实写明，不假装覆盖）
 * -----------------------------------
 * - 被 `.gitignore` 命中的文件**一律拒绝删除**：它们在 `git status` 里不可见，
 *   闸3 因而拿不到「它确实未受管」的证据。这是刻意的保守取向 ——
 *   实测 `.pi.log` / `.t.log` 这类本机日志会被挡住。想删它们请手工确认后直接删。
 * - 被**改名**的 tracked 文件：改名后新路径在 git 里已无受管身份（内容仍在 HEAD 旧
 *   路径下），守卫会放行。工作副本删掉不构成数据丢失，但「改名意图」会丢。
 *   守卫拦的是「删掉 git 正在管的东西」，不是「猜这个文件将来会不会被提交」。
 * - 闸 3 只在工作区内有意义；`--allow-outside` 放行仓库外路径后不再受闸3 约束。
 *
 * 用法
 * ---
 *   node scripts/safe-delete.cjs <路径> [<路径> ...]
 *   node scripts/safe-delete.cjs --dry-run <路径> ...     # 只报判据，不删
 *   node scripts/safe-delete.cjs --allow-outside <路径>   # 仅对仓库外路径，需同时给绝对路径
 *
 * 删除走 mavis-trash（可恢复），不用 rm。
 */

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const AUDIT = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Mulpub', 'safe-delete.log');

function git(args, cwd) {
  return cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

function repoRoot(startDir) {
  const r = git(['rev-parse', '--show-toplevel'], startDir);
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

/** 解析为绝对路径（不要求存在，交给后续闸判）。 */
function abs(p, cwd) {
  return path.resolve(cwd || ROOT, p);
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * 核心判据。抽成纯函数是为了能单测——CLI 里内联的话，回归锁就只能对着真实
 * 仓库跑，测不出「构造出来的场景也判红」这件事本身。
 *
 * @returns {{ok: boolean, reason?: string, target: string, isDir: boolean,
 *            tracked: boolean, untrackedListed: boolean, insideRepo: boolean}}
 */
function judge(targetAbs, repoAbs, opts = {}) {
  const isDir = safeIsDir(targetAbs);
  const insideRepo = repoAbs ? isInside(targetAbs, repoAbs) : false;

  const trackedRes = repoAbs && !isDir
    ? git(['ls-files', '--error-unmatch', '--', path.relative(repoAbs, targetAbs)], repoAbs)
    : { status: 1 };
  const tracked = trackedRes.status === 0;

  let untrackedListed = false;
  // 闸 3 只在「工作区内」有意义：仓库外路径不在 git status 的管辖范围，
  // 用它当判据会让 --allow-outside 永远无法放行（自我实现的死锁）。
  if (repoAbs && !isDir && insideRepo) {
    const rel = path.relative(repoAbs, targetAbs).replace(/\\/g, '/');
    const st = git(['status', '--porcelain', '--', rel], repoAbs);
    if (st.status === 0) {
      untrackedListed = st.stdout.split('\n').some((l) => l.trimStart().startsWith('??'));
    }
  } else if (!insideRepo) {
    untrackedListed = true; // 仓库外无「受管」概念，交给边界闸判
  }

  const base = { target: targetAbs, isDir, tracked, untrackedListed, insideRepo };

  // 闸 1：不是文件
  if (isDir) {
    return { ...base, ok: false, reason: `目标是目录 —— 拒绝。历史 5 次误删全部始于「把一个目录当成里面的临时文件」。要删目录请先逐条列出其中的未跟踪文件。` };
  }
  // 仓库边界
  if (!repoAbs) {
    return { ...base, ok: false, reason: '不在 git 仓库内 —— 拒绝（本脚本只清仓库里的未跟踪产物）。' };
  }
  if (!insideRepo && !opts.allowOutside) {
    return { ...base, ok: false, reason: `目标在工作区之外（${repoAbs}）—— 拒绝。跨到工作区外的删除不属于「清理临时产物」。` };
  }
  // 闸 2：被跟踪
  if (tracked) {
    return { ...base, ok: false, reason: '目标被 git 跟踪 —— 拒绝。要删受管文件请用 git rm 并走评审，不要绕过。' };
  }
  // 闸 3：不在未跟踪列表
  if (!untrackedListed) {
    return { ...base, ok: false, reason: '目标未出现在 git status 的 ?? 列表里 —— 拒绝。「我以为它是临时的」不算依据，git 的清单才算。' };
  }
  return { ...base, ok: true };
}

function safeIsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function audit(line) {
  try {
    fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
    fs.appendFileSync(AUDIT, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (_) { /* 审计写不进去也不该阻断清理 */ }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const allowOutside = argv.includes('--allow-outside');
  const targets = argv.filter((a) => !a.startsWith('--'));
  if (!targets.length) {
    console.error('用法: node scripts/safe-delete.cjs [--dry-run] [--allow-outside] <路径> ...');
    process.exit(2);
  }

  let failed = 0;
  for (const t of targets) {
    const cwd = path.isAbsolute(t) ? path.parse(t).root : ROOT;
    const absPath = abs(t, cwd);
    const repoAbs = repoRoot(fs.existsSync(absPath) && safeIsDir(absPath) ? absPath : path.dirname(absPath))
      || repoRoot(ROOT);
    const v = judge(absPath, repoAbs, { allowOutside });
    const rel = repoAbs && isInside(absPath, repoAbs) ? path.relative(repoAbs, absPath) : absPath;

    if (!v.ok) {
      failed++;
      console.error(`✗ 拒绝删除 ${rel}\n  ${v.reason}`);
      audit(`REFUSED\t${rel}\t${v.reason}`);
      continue;
    }
    if (dryRun) {
      console.log(`· [dry-run] 允许删除 ${rel}（未跟踪、非目录、在工作区内）`);
      continue;
    }
    // 走可恢复删除
    const r = cp.spawnSync('mavis-trash', [absPath], { encoding: 'utf8', shell: true, windowsHide: true });
    if (r.status !== 0) {
      failed++;
      console.error(`✗ 删除失败 ${rel}\n  ${(r.stderr || r.stdout || '').trim()}`);
      audit(`FAILED\t${rel}`);
      continue;
    }
    console.log(`✓ 已删除（可恢复）${rel}`);
    audit(`DELETED\t${rel}`);
  }
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { judge, isInside, repoRoot };