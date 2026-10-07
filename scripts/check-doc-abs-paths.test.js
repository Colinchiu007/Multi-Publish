/**
 * check-doc-abs-paths.test.js — 文档绝对路径有效性门禁自测
 *
 * 背景（#3000 的逃逸分析）：仓库根目录 2026-10-06 改名后，文档里的
 * **绝对路径**不会跟着改，于是长期静默失效。「有没有门禁检查文档写的
 * 路径是否还存在」——此前是零，check-no-brand-residue.js 只管品牌词。
 *
 * 本测试用临时目录做 fixture，验证门禁的**检出能力**（而不只是"当前仓库干净"）：
 * - 失效的本机绝对路径必须命中
 * - 存在的路径必须放行
 * - 产品品牌名 / Linux 部署路径 / 云沙箱路径 / CI runner 路径必须**不**命中
 * - 归档快照目录按契约豁免
 *
 * 特别注意最后两条"误伤回归"：本门禁最容易踩的坑不是漏报，而是**误伤历史文档**
 * （2026-10-07 实测：全量扫描误报 260 处，收紧后仍有 101 处历史引用，
 *  逐条核对后绝大多数根本不该改）。故口径最终定为「只查本次改动集」。
 *
 * CI：quality-gate.yml changes job「Gate 12b」先跑本自测再扫描改动集。
 * 用法：node --test scripts/check-doc-abs-paths.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SCRIPT = path.join(__dirname, 'check-doc-abs-paths.js');

// 串行化：node:test 默认并发跑顶层 test。
// 2026-10-07 实测踩坑：并发下"检出失效路径"用例在门禁被判定废掉时**仍然绿**——
// 同批 fixture 用例共享 tmp 目录前缀、且子进程 spawn 与断言之间存在竞态，
// 结果是变异反证一度"看起来没被抓住"，差点让我把无覆盖的门禁当成有覆盖。
// 判据：一个门禁自测必须能承重。各用例彼此独立（各自 mkdtemp），不需要 describe 包装；
// 若发现用例间互相影响，按**具体证据**定位并修用例，不要用全局开关掩盖。
// 2026-10-07 留痕：曾误加 `test.describe = undefined` 想"串行化"，那改的是模块导出、
// 与并发无关，属于无效且有副作用的修法，已撤。

/**
 * 建临时 fixture 目录。
 * files 的值可以是字符串，也可以是 (realDir) => string —— 后者用于需要引用
 * **真实存在**路径的用例（realDir 必须先建好才能写进文档内容）。
 */
function makeFixture (files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdap-fixture-'));
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdap-real-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'function' ? content(realDir) : content);
  }
  return { root, realDir };
}

function runGate (root, extraArgs = []) {
  // 注意：--root 决定扫描根，--all 决定用全量审计口径。
  // 参数顺序无所谓，但 --root 必须指向 fixture，否则会扫到真实仓库。
  return spawnSync(
    process.execPath,
    [SCRIPT, '--all', '--root', root, ...extraArgs],
    { encoding: 'utf8' }
  );
}

/**
 * 本机**真实存在**的 Windows 盘符（如 'D:'），不存在则返回 null。
 *
 * 2026-10-07 CI 首跑实测（本文件当时最贵的一个坑）：
 * 用例里写死 `D:\...`，本机 Windows 绿、ubuntu runner 上 4 个用例红。
 * 根因不是门禁坏了——门禁按设计「只判定本机存在的盘符」，Linux 上没有 D: 盘
 * ⇒ 正确跳过。而**测试把「本机有 D: 盘」当成了恒定前提**。
 * 判据：跨平台的自测不得假设具体盘符存在。
 */
function localDrive () {
  for (const d of 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    for (const sep of ['\\', '/']) {
      try {
        if (fs.existsSync(d + ':' + sep)) return d + ':';
      } catch { /* 忽略 */ }
    }
  }
  return null;
}

const DRIVE = localDrive();

/** 造一个「本机存在盘符下、但该子目录不存在」的绝对路径 */
function missingPathUnderLocalDrive () {
  return DRIVE + '\\Data\\projects\\definitely-not-here-xyz\\apps\\desktop';
}

/** 造一个「本机存在盘符下、且真实存在」的绝对路径（文件必须真的建出来） */
function existingPathUnderLocalDrive () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdap-live-'));
  const file = path.join(dir, 'probe.txt');
  fs.writeFileSync(file, 'x\n');
  return file;
}

test('检出指向不存在目录的本机绝对路径', (t) => {
  if (!DRIVE) {
    t.skip('本机无 Windows 盘符（Linux runner），门禁按设计跳过判定');
    return;
  }
  const { root } = makeFixture({
    '01-docs/runbook.md': 'cd ' + missingPathUnderLocalDrive() + '\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 1, 'stderr: ' + r.stderr);
  assert.match(r.stderr, /runbook\.md/);
  assert.match(r.stderr, /definitely-not-here-xyz/);
});

/**
 * 造一个**完整存在**的本机路径（目录 + 文件），返回其字符串形式。
 *
 * 2026-10-07 实测踩坑：先前直接写 `realDir + '\\apps\\desktop'` 却只创建了
 * realDir，中间目录并不存在 —— 门禁判定**完全正确**，是测试自己造了个假路径，
 * 于是 3 个用例莫名变红。凡"应当放行"的路径，必须先把每一级都建出来。
 */
function makeRealPath (levels = ['apps', 'desktop'], withFile = true) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cdap-real-'));
  let cur = base;
  for (const lv of levels) {
    cur = path.join(cur, lv);
    fs.mkdirSync(cur, { recursive: true });
  }
  if (withFile) fs.writeFileSync(path.join(cur, 'probe.txt'), 'x\n');
  return withFile ? path.join(cur, 'probe.txt') : cur;
}

test('指向真实存在目录的路径必须放行', () => {
  const { root } = makeFixture({});
  const realPath = makeRealPath(); // 每一级都已创建
  fs.mkdirSync(path.join(root, '01-docs'), { recursive: true });
  fs.writeFileSync(path.join(root, '01-docs', 'ok.md'), 'cd ' + realPath + '\n');
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr + '\nrealPath=' + realPath);
});

test('产品品牌名不是路径，必须放行（误伤回归）', () => {
  const { root } = makeFixture({
    '01-docs/branding.md': [
      '# Multi-Publish 运维手册',
      '仓库: Multi-Publish (GitHub)',
      'Environment="SPLITTER_DIR=/opt/multi-publish/smart-sentence-splitter"',
      'npm scope: @multi-publish/*',
    ].join('\n') + '\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('非本机路径（Linux 部署 / 云沙箱 / CI runner）必须放行', () => {
  const { root } = makeFixture({
    '01-docs/ops.md': [
      '部署目录：`/srv/projects/Multi-Publish/deploy/logto`',
      '云沙箱：`/sessions/sleepy-xxx/mnt/projects/anything/src/x.py`',
      'CI 上是 `C:\\Users\\RUNNER\\AppData\\Local\\Temp\\ci-build`',
    ].join('\n') + '\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('归档快照目录豁免（记录的是当时事实，改写即篡改历史）', () => {
  const { root } = makeFixture({
    '.ci-forensics/reports/judge-report.md': '路径 `D:\\Data\\projects\\gone-at-the-time-abc\\a.png`\n',
    'openspec/changes/archive/x/design.md': '监听根：`D:/Data/projects/also-gone-def/x`\n',
    '.plan/refactoring-analysis.md': '[x](file:///d:/Data/projects/gone-ghi/y.js)\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('占位符路径不判定（静态无法确认，误报即噪声）', () => {
  const { root } = makeFixture({
    '01-docs/ports.md': [
      'curl http://127.0.0.1:<cdpPort>/json/version',
      'cd D:\\Data\\projects\\${PROJECT}\\apps',
      'cd D:\\Data\\projects\\mp-*\\apps',
      '见 D:\\Data\\projects\\... 省略',
    ].join('\n') + '\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('中文句读不得被吞进路径（贪心捕获回归）', () => {
  // 早期版本用宽松字符集收段，会把 `D:\...\ops-center`。截。整句当成一个路径，
  // existsSync 必然失败 → 260 处全量误报。此处锁"路径在句末标点前正确终止"。
  const { root } = makeFixture({});
  const realDir = makeRealPath(['ops-center'], false);
  fs.mkdirSync(path.join(root, '01-docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '01-docs', 'prose.md'),
    '路径是 ' + realDir + '`。截图见下。\n'
  );
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr + '\nstdout: ' + r.stdout);
});

test('盘符根构造必须是 D:\\ 而非 D\\（replace 吞冒号回归）', (t) => {
  // 'D:'.replace(/:$/, sep) 产出两字符 'D\'，后续 path.join 拼出无盘符相对路径，
  // existsSync 恒 false → 全量误报。用**多级真实存在**的路径锁死这个行为：
  // 若盘符根算错，`driveRoots.has('D:')` 与逐级 existsSync 都会失准。
  if (!DRIVE) {
    t.skip('本机无 Windows 盘符（Linux runner），该回归需 Windows 才能复现');
    return;
  }
  const { root } = makeFixture({});
  const realPath = existingPathUnderLocalDrive();
  fs.mkdirSync(path.join(root, '01-docs'), { recursive: true });
  fs.writeFileSync(path.join(root, '01-docs', 'deep.md'), '见 ' + realPath + '\n');
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('非受管目录（apps/ 等运行时代码）不扫描', () => {
  const { root } = makeFixture({
    'apps/desktop/src/x.js': (d) =>
      'const p = "' + (d ? d + '\\\\Data\\\\projects\\\\gone-here-xyz\\\\a.js' : '/tmp/gone-here-xyz/a.js') + '";\n',
  });
  const r = runGate(root);
  assert.equal(r.status, 0, 'stderr: ' + r.stderr);
});

test('改动集口径：未改动的文档里的陈旧路径不应报红', (t) => {
  // 这是 2026-10-07 最重要的设计决定：全量扫描会命中 100+ 处历史引用，
  // 逐条核对后绝大多数不该改。只查改动集，精准覆盖"改了文档但路径是陈的"。
  if (!DRIVE) {
    t.skip('本机无 Windows 盘符（Linux runner），陈旧路径按设计不被判定');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdap-git-'));
  const tgit = (...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });

  const stale = missingPathUnderLocalDrive();
  tgit('init', '-q', '-b', 'main');
  tgit('config', 'user.email', 'test@example.com');
  tgit('config', 'user.name', 'test');
  fs.mkdirSync(path.join(dir, '01-docs'), { recursive: true });
  // 历史文档：陈旧路径，但它没被本次改动碰过
  fs.writeFileSync(path.join(dir, '01-docs', 'HISTORY-2026-01-01.md'), '旧 worktree: ' + stale + '\n');
  fs.writeFileSync(path.join(dir, '01-docs', 'LIVENOTE.md'), 'v1\n');
  tgit('add', '-A');
  tgit('commit', '-q', '-m', 'seed');

  tgit('checkout', '-q', '-b', 'feat');
  // 本次只改了 LIVENOTE.md（内容合规）
  fs.writeFileSync(path.join(dir, '01-docs', 'LIVENOTE.md'), 'v2\n');
  tgit('add', '-A');
  tgit('commit', '-q', '-m', 'change');

  const r = spawnSync(
    process.execPath,
    [SCRIPT, '--root', dir, '--base', 'main', '--head', 'feat'],
    { encoding: 'utf8' }
  );
  assert.equal(r.status, 0, '改动集不该包含 HISTORY 文档: ' + r.stderr);

  // 但若本次改动**就是**那份陈旧文档，必须报红
  fs.writeFileSync(
    path.join(dir, '01-docs', 'HISTORY-2026-01-01.md'),
    '旧 worktree: ' + stale + '\n补一句\n'
  );
  tgit('add', '-A');
  tgit('commit', '-q', '-m', 'touch history');
  const r2 = spawnSync(
    process.execPath,
    [SCRIPT, '--root', dir, '--base', 'main', '--head', 'feat'],
    { encoding: 'utf8' }
  );
  assert.equal(r2.status, 1, '改了陈旧文档就必须报红: ' + r2.stderr);
  assert.match(r2.stderr, /HISTORY/);
});

test('当前仓库全量审计：报错项必须全部可归因（不许有说不懂的）', (t) => {
  if (!DRIVE) {
    // Linux runner 上没有 Windows 盘符 ⇒ 门禁按设计跳过全部判定 ⇒ 必然 PASS。
    // 这不是缺陷：无法判定 ≠ 失效。锁的是"runner 平台与判定口径自洽"。
    const repoRoot = path.join(__dirname, '..');
    const r = spawnSync(
      process.execPath,
      [SCRIPT, '--root', repoRoot, '--all'],
      { encoding: 'utf8' }
    );
    assert.equal(r.status, 0, '无本机盘符时应全量放行: ' + r.stderr);
    return;
  }
  const repoRoot = path.join(__dirname, '..');
  const r = spawnSync(
    process.execPath,
    [SCRIPT, '--root', repoRoot, '--all'],
    { encoding: 'utf8' }
  );
  // 全量审计预期 FAIL（仓库确有 100+ 处历史引用）；这里锁的是"它必须 FAIL"这一事实，
  // 防止有人悄悄把判定改成永远 0 命中。
  assert.equal(r.status, 1, '全量审计预期 FAIL（历史引用仍在）: ' + r.stderr);
});

test('门禁脚本不得硬编码旧目录名（改名后不能自己失效）', () => {
  const script = fs.readFileSync(SCRIPT, 'utf8');
  const OLD = ['Multi', 'Publish'].join('-');
  assert.doesNotMatch(script, new RegExp(OLD, 'i'));
});

test('--root 必须同时支持 --root=X 与 --root X（变异反证：等号形式被去掉时必须变红）', (t) => {
  // 2026-10-07 实测踩坑：脚本最初只认 `--root=X`。用 `--root <dir>` 调用时参数被
  // 静默忽略 → 扫到**真实仓库**而不是 fixture，于是每个 fixture 用例都拿真实仓库的
  // 报红来判。若当时就有这条测试，第一次跑就会红。
  if (!DRIVE) {
    t.skip('本机无 Windows 盘符（Linux runner），无法构造可判定的失效路径');
    return;
  }
  const { root } = makeFixture({});
  fs.mkdirSync(path.join(root, '01-docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '01-docs', 'gone.md'),
    'cd ' + missingPathUnderLocalDrive() + '\n'
  );

  // 等号形式
  const eq = spawnSync(
    process.execPath,
    [SCRIPT, '--all', `--root=${root}`],
    { encoding: 'utf8' }
  );
  assert.equal(eq.status, 1, '等号形式必须认出 fixture root: ' + eq.stderr);

  // 空格形式
  const sp = spawnSync(
    process.execPath,
    [SCRIPT, '--all', '--root', root],
    { encoding: 'utf8' }
  );
  assert.equal(sp.status, 1, '空格形式必须认出 fixture root: ' + sp.stderr);

  // 两种形式必须扫到同一份内容（否则其中一种其实扫了别处）
  assert.ok(
    /gone\.md/.test(eq.stderr) && /gone\.md/.test(sp.stderr),
    '两种形式都应命中 fixture 内的文件'
  );
});