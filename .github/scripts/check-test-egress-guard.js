#!/usr/bin/env node
/**
 * .github/scripts/check-test-egress-guard.js — Gate 20：测试层出站守卫的接线棘轮
 *
 * 为什么必须有：守卫原先只在 `apps/desktop/test-setup.js` 里装，`packages/*`（252 个测试文件）
 * 与 `ops-center` 裸奔；而本仓没有任何传输层兜底（`nock`/`msw`/`setupServer` 实测 0 命中），
 * "测试不出网"全靠每个文件手工注入桩 —— 漏一处就是一次真出站，且真出站挂起时先撞上框架超时，
 * 报错只剩 `Test timed out in 10000ms`（缺陷 G 的原始现场）。
 *
 * 光"这次接上了"不够：新增一个包 / 新增一个 vitest 配置 / 换一种 runner，就会静默回到裸奔状态。
 * 所以这里从 `git ls-files` **枚举测试面**（不是维护者凭印象写的清单），逐面要求它引用共享 setup；
 * 确实接不上的必须进 `KNOWN_UNGUARDED` 并写原因，且清单只能**缩小**、不能增长。
 *
 * 另锁一条本仓踩过两次的坑：`.gitignore` 第 59 行 `test-*.js` 未锚定目录，会把
 * 新写的守卫实现/setup/用例**静默排除在 git 之外**（CI 永不执行、也没人发现）。
 * 因此本脚本引用的两个文件必须先证明"没有被 .gitignore 吞掉"。
 *
 * ⚠️ 本脚本自己踩到的元教训（防止下一次有人把判据改回字面串）：枚举判据原先写
 * `script.includes('node --test')`，而我接线时正好在 `node` 与 `--test` 之间插了
 * `--require <setup>` —— 于是那两个面**从枚举里消失**（不是变红，是不再被检查）。
 * 棘轮把自己的检查对象改没了，比漏检更坏：它看起来在守，实际恒绿。
 * 现在判据拆成「命令里有 node」+「有独立的 --test 标志」两条，
 * 并由同目录 `check-test-egress-guard.test.js` 的夹具锁钉住。
 *
 * 本地同口径：node .github/scripts/check-test-egress-guard.js
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../..');
const SETUP_BASE = 'network-egress-guard.setup.js';
const GUARD_MODULE = 'packages/shared-utils/src/network-egress-guard.js';
const SHARED_SETUP = 'packages/shared-utils/' + SETUP_BASE;

/**
 * 尚未接上守卫的测试面 —— 每条必须带原因，且**只能缩小**。
 * 往这里加条目 = 承认新的裸奔面，审查时必须拒绝；正解是把该面接上。
 * 键必须与 collectSurfaces() 产出的键逐字一致（键漂移会同时报"未登记欠账"与"陈旧登记"两条红）。
 */
const KNOWN_UNGUARDED = {
  'packages/api-publish-engine/scripts:runner-vitest':
    'run-tests.js 的 direct 路径已加 --require（一个测试文件一个子进程，父进程装一次等于没装）；'
    + '但 vitest 子集是 CLI 参数直跑（该包无 vitest.config），vitest 不接受 --setupFiles 命令行参数'
    + ' ⇒ 需要新建配置文件并复刻 CLI 标志，属独立改动，另 PR 收口',
  'packages/python-backend/tests:pytest':
    'pytest 侧对等守卫（autouse fixture patch socket.socket.connect）为计划中的切片 B；'
    + '该面另有 4 个测试文件依赖未声明的 respx，扩跑前须先修依赖声明',
  'ops-center/backend/tests:pytest':
    '同上（切片 B）。conftest.py 已有 2 个 autouse fixture，新 fixture 的挂载顺序与 monkeypatch 冲突面已勘察',
  'packages/audio-aligner:pytest':
    '同上（切片 B）；其 conftest.py 目前只做 sys.path',
};

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
}

/**
 * 只问"有没有被 .gitignore 吞掉"，不问"是否已提交"——后者在本地未 commit 时会假红，
 * 而本仓真正吃过两次的亏是前者：`.gitignore` 第 59 行 `test-*.js` 未锚定目录，
 * 任何路径下以 test- 开头的文件都不进 git，CI 于是永远不跑它，也没有任何东西因此变红。
 */
function notIgnored(rel) {
  return spawnIgnore(rel) !== 0; // git check-ignore 退出码 0 = 被忽略
}

function spawnIgnore(rel) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', rel], { cwd: REPO, stdio: 'ignore' });
    return 0;
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1;
  }
}

function readIf(rel) {
  if (!rel) return null;
  const p = path.join(REPO, rel.split('/').join(path.sep));
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  return fs.readFileSync(p, 'utf8');
}

function realFiles() {
  return git(['ls-files']).split(/\r?\n/).filter(Boolean);
}

/**
 * 枚举所有测试面（判据来自仓库自身，不来自记忆）。
 * `files` / `readFile` 可注入，让门禁自身的回归能用**夹具仓库**跑，而不必改动真实工作树
 * —— 改动真实工作树来证明门禁会红，正是"反证不得执行被守卫的动作"那条禁令的形状。
 */
function collectSurfaces(options = {}) {
  const files = options.files || realFiles();
  const readFile = options.readFile || readIf;
  const surfaces = new Map();
  for (const rel of files) {
    if (rel.includes('node_modules/') || rel.startsWith('.quality-rhythm/')) continue;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    if (/vitest\.config\.[cm]?[jt]s$/.test(rel)) {
      surfaces.set(dir + ':vitest', { kind: 'vitest', file: rel, dir });
    } else if (/(^|\/)package\.json$/.test(rel)) {
      const text = readFile(rel);
      if (!text) continue;
      let pkg;
      try { pkg = JSON.parse(text); } catch (_) { continue; }
      const script = (pkg.scripts && pkg.scripts.test) || '';
      // 判据不得写成 script.includes('node --test')：见文件头 ⚠️ —— 插进 --require 之后
      // 那个字面串就不存在，两个 node --test 面会从枚举里**静默消失**。
      if (/(^|\s)node(\s|$)/.test(script) && /(^|\s)--test(\s|$)/.test(script)) {
        surfaces.set((dir || '.') + ':node-test', { kind: 'node-test', file: rel, dir, script });
      }
    } else if (/(^|\/)run-tests\.js$/.test(rel)) {
      // 一个 runner 面拆两个子面：直跑子进程与 vitest 子集的挂载点不同，合成一个就会互相掩盖
      surfaces.set(dir + ':runner-direct', { kind: 'runner-direct', file: rel, dir });
      surfaces.set(dir + ':runner-vitest', { kind: 'runner-vitest', file: rel, dir });
    } else if (/(^|\/)conftest\.py$/.test(rel)) {
      surfaces.set(dir + ':pytest', { kind: 'pytest', file: rel, dir });
    }
  }
  return surfaces;
}

/** 返回问题描述；null = 该面已合规 */
function evaluate(surface, options = {}) {
  const readFile = options.readFile || readIf;
  // desktop 的守卫经它自己的 test-setup.js 装（那里 require 共享实现）
  if (surface.dir === 'apps/desktop') {
    const setup = readFile('apps/desktop/test-setup.js') || '';
    return setup.includes(GUARD_MODULE) ? null : 'apps/desktop/test-setup.js 未复用共享实现';
  }
  if (surface.kind === 'pytest') {
    const text = readFile(surface.file) || '';
    return text.includes('block_non_loopback_egress') ? null : 'pytest 面缺对等出站 fixture';
  }
  const text = readFile(surface.file) || '';
  if (text.includes(SETUP_BASE) && surface.kind !== 'runner-vitest') return null;
  if (surface.kind === 'runner-direct') {
    return text.includes('--require') ? null : '直跑子进程未 --require 守卫 setup';
  }
  if (surface.kind === 'runner-vitest') {
    // vitest 子集只能靠配置文件挂 setupFiles（CLI 无 --setupFiles）。
    // 配置不在 scripts/ 而在包根，所以必须逐级上溯找 —— 只查 surface.dir 会把"已接上"误判成"仍欠账"。
    let dir = surface.dir;
    for (;;) {
      const hit = ['vitest.config.js', 'vitest.config.ts', 'vitest.config.mjs']
        .map((name) => readFile(dir ? dir + '/' + name : name))
        .find((body) => body && body.includes(SETUP_BASE));
      if (hit) return null;
      if (!dir) return 'vitest 子集未引用共享守卫 setup（需该包的 vitest.config 里声明 setupFiles）';
      dir = dir.slice(0, dir.lastIndexOf('/'));
    }
  }
  return '未引用共享守卫 setup（' + SETUP_BASE + '）';
}

/** 纯判定：给定仓库快照（可注入夹具）返回问题清单；problems 为空数组 = 通过 */
function collectProblems(options = {}) {
  const readFile = options.readFile || readIf;
  const minSurfaces = typeof options.minSurfaces === 'number' ? options.minSurfaces : 10;
  const checkIgnored = options.checkIgnored !== false;
  // 欠账清单可注入：夹具仓库天然不含真实清单里的键，若不注入就会条条报"陈旧登记"，
  // 把"夹具合法"这件事淹死在无关的红里（真仓库那条红另有其人在真实仓库用例里守）。
  const ledger = options.knownUnguarded || KNOWN_UNGUARDED;
  const opts = { readFile };
  const problems = [];

  if (checkIgnored) {
    if (!notIgnored(GUARD_MODULE)) {
      problems.push('守卫实现被 .gitignore 吞掉（test-*.js 类陷阱），CI 永远不会跑它：' + GUARD_MODULE);
    }
    if (!notIgnored(SHARED_SETUP)) {
      problems.push('守卫 setup 被 .gitignore 吞掉：' + SHARED_SETUP);
    }
  }

  // 共享 setup 必须同时装**两个平面**。只有 socket 面时，测试用 spawnSync / execFileSync / fork
  // 起的 node 子进程里没有守卫 ⇒ "测试期零真实出站"对那条路径结构性无效（#2783 的另一半：
  // require('electron') 在测试 realm 里 spawnSync 起 install.js，子进程真下载数秒，
  // 耗时与 stdout 被 vitest 记到"当时正在跑的那条用例"头上，表现是那条用例随机 15s 超时）。
  const setupText = readFile(SHARED_SETUP)
  if (setupText === null || setupText === undefined) {
    // 夹具仓库不建模 setup（那是合法的"没有这个文件"），只有真实仓库模式才要求它存在
    if (checkIgnored) problems.push('读不到共享守卫 setup：' + SHARED_SETUP);
  } else if (!/installTestNetworkGuard\s*\(/.test(setupText) || !/installTestChildProcessGuard\s*\(/.test(setupText)) {
    problems.push('共享 setup 必须同时装 socket 面与子进程面（缺 installTestChildProcessGuard ⇒ 子进程路径无守卫）：' + SHARED_SETUP);
  }

  const surfaces = collectSurfaces({ files: options.files, readFile });  if (surfaces.size < minSurfaces) {
    problems.push('测试面枚举退化（只有 ' + surfaces.size + ' 个，下限 ' + minSurfaces + '），判据不可信');
  }

  const unguardedNow = [];
  const registeredHit = new Set();
  for (const [key, surface] of [...surfaces.entries()].sort()) {
    const problem = evaluate(surface, opts);
    if (!problem) continue;
    if (Object.prototype.hasOwnProperty.call(ledger, key)) {
      registeredHit.add(key);
      continue;
    }
    unguardedNow.push(key + ' — ' + problem);
  }
  const stale = Object.keys(ledger).filter((k) => {
    if (!surfaces.has(k)) return true;                     // 面已不存在 ⇒ 条目过期
    return evaluate(surfaces.get(k), opts) === null;       // 已接上 ⇒ 必须销账
  });
  if (unguardedNow.length) {
    problems.push('这些测试面没接守卫、也没登记原因（新增裸奔面一律拦）：\n  - ' + unguardedNow.join('\n  - '));
  }
  if (stale.length) {
    problems.push('欠账清单里有**已接上或已不存在**的条目，必须顺手删除（销账与接线必须同一次发生）：\n  - '
      + stale.join('\n  - '));
  }

  return { problems, surfaceCount: surfaces.size, registered: registeredHit.size };
}

function main() {
  const { problems, surfaceCount, registered } = collectProblems();
  console.log('[test-egress-guard] 枚举测试面=' + surfaceCount
    + '，已接守卫=' + (surfaceCount - registered)
    + '，登记欠账=' + registered + '/' + Object.keys(KNOWN_UNGUARDED).length);
  if (problems.length) {
    problems.forEach((p) => console.error('FAIL: ' + p));
    process.exitCode = 1;
    return;
  }
  console.log('PASS: 所有测试面要么装了共享守卫，要么带原因登记在只可缩小的欠账清单里');
}

if (require.main === module) main();

module.exports = {
  collectSurfaces,
  collectProblems,
  evaluate,
  KNOWN_UNGUARDED,
  SETUP_BASE,
  GUARD_MODULE,
  SHARED_SETUP,
  notIgnored,
};
