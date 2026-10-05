// 回归锁：check-changelog-growth.js
// 动因是实测事故 —— b531bdfe7（PR #2884）把 CHANGELOG.md 从 1,133 条整份替换成 2 条并全绿合入。
// 本文件用 node --test 跑，必须被 quality-gate.yml 的 changes job 显式点名（否则等于没写）。
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { FILE, HEADING_RE, headingsOf, compareMultisets, collect, main } = require('./check-changelog-growth.js');

test('导出的判据面必须齐（缺一个就是判据搬家）', () => {
  assert.equal(FILE, 'CHANGELOG.md');
  assert.ok(HEADING_RE instanceof RegExp);
  for (const fn of [headingsOf, compareMultisets, collect, main]) assert.equal(typeof fn, 'function');
});

test('条目标题识别：CRLF 工作树与 LF blob 必须读出同一种标题（混行尾会把一条读成两条）', () => {
  const lf = '# [未发布] A\n\n正文\n# [未发布] B\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.deepEqual(headingsOf(crlf.replace(/\r/g, '')), ['# [未发布] A', '# [未发布] B']);
  // 直接喂 CRLF 文本时，trimEnd 必须吃掉 \r，否则两种口径的标题永不相等
  assert.deepEqual(headingsOf(crlf), ['# [未发布] A', '# [未发布] B']);
  // 二级标题与引用不得算条目；但**无括号的一级标题必须算** —— 见下一条用例的取证。
  assert.deepEqual(headingsOf('## 二级\n# [已发布] 真条目\n'), ['# [已发布] 真条目']);
});

// QM-6 外部评审实测成立（2026-10-05）：origin/main 的 CHANGELOG.md 有 1,164 行一级标题，其中
// 1,140 行是 `# [` 形，另有 **2 种真条目走 `# fix(自检门禁): …（#2648，2026-09-30）` 这种无括号形**
// （各重复 4 次），唯一非条目的一级标题是 `# CHANGELOG`（文档自身标题，重复 16 次）。
// 原 HEADING_RE=/^# \[/ 对这 8 行完全失明 —— 删掉其中任何一条，棘轮照报 PASS，
// 而这正是本门禁存在的唯一理由（#2884 截断事故）。所以口径改为「一级标题，排除节标题」。
test('无括号形条目也必须算：删除 # fix(...) 一条必须报丢（原 /^# \\[/ 判据对它失明）', () => {
  assert.deepEqual(
    headingsOf('# fix(自检门禁): fifo 断言（#2648，2026-09-30）\n\n正文\n'),
    ['# fix(自检门禁): fifo 断言（#2648，2026-09-30）'],
    '无括号的一级标题就是条目，不得漏算');
  // 节标题不得算条目：否则它一旦被人改写就会制造假丢失
  assert.deepEqual(headingsOf('# CHANGELOG\n\n# [未发布] A\n'), ['# [未发布] A']);
  assert.deepEqual(headingsOf('# changelog\n'), [], '大小写不同的节标题也不算');
  // 但不能把判据放宽成"任何 # 开头"：`#hashtag` 不是标题
  assert.deepEqual(headingsOf('#nospace 不是标题\n'), [], '缺空格的 # 不是 markdown 标题');
});

test('真仓库：删掉一条无括号条目必须报丢（夹具同时含两种形状，防只测括号形）', () => {
  const repo = makeRepo();
  const base = '# [未发布] A\n\na\n# fix(自检门禁): fifo 断言（#2648）\n\nb\n# CHANGELOG\n\nt\n';
  commitChangelog(repo, base, 'base');
  assert.equal(collect({ base: 'HEAD', head: 'HEAD', root: repo.dir }).headTotal, 2,
    '两种形状都算上才是 2 条（# CHANGELOG 是节标题，不计）');
  // 删掉无括号那条，保留括号那条 —— 旧判据在这一档会报 lost=0
  commitChangelog(repo, '# [未发布] A\n\na\n# CHANGELOG\n\nt\n', 'drop bracketless entry');
  const r = collect({ base: 'HEAD^', head: 'HEAD', root: repo.dir });
  assert.equal(r.lost.length, 1, '无括号条目被删必须报丢');
  assert.equal(r.lost[0].heading, '# fix(自检门禁): fifo 断言（#2648）');
  assert.equal(main(['--root=' + repo.dir, '--base=HEAD^', '--head=HEAD']), 1);
  fs.rmSync(repo.dir, { recursive: true, force: true });
});

test('多重集口径：4 份副本删到 3 份必须报丢（集合口径会读成通过）', () => {
  const base = ['x', 'x', 'x', 'x'];
  const r = compareMultisets(base, ['x', 'x', 'x']);
  assert.equal(r.lost.length, 1);
  assert.deepEqual(r.lost[0], { heading: 'x', wanted: 4, got: 3 });
  assert.equal(r.baseTotal, 4);
  assert.equal(r.headTotal, 3);
});

test('整份重写（等条数、换内容）也必须报丢 —— 这条排除「只比总数」的弱判据', () => {
  const r = compareMultisets(['A', 'B', 'C'], ['D', 'E', 'F']);
  assert.equal(r.lost.length, 3);
  assert.equal(r.baseTotal, r.headTotal, '总数相等但内容全换 —— 证明本门禁不是数量阈值');
});

test('fail closed：base 读出 0 条标题必须抛，不得判成「零丢失」', () => {
  const fakeGit = () => Buffer.from('\n正文没有条目\n', 'utf8');
  assert.throws(
    () => collect({ base: 'BASE', head: 'HEAD', git: fakeGit }),
    /fail closed.*空遍历不得判为/s,
  );
});

test('fail closed：blob 读不到必须抛（不能静默当空文件）', () => {
  const fakeGit = () => { const e = new Error('boom'); e.stderr = 'fatal: not found'; throw e; };
  assert.throws(() => collect({ base: 'BASE', head: 'HEAD', git: fakeGit }), /读不到 BASE:CHANGELOG.md/);
});

// ── 真 git 集成：用 os.tmpdir 自建仓库，避免依赖本仓工作树形态／也避免污染它 ──
// 宿主 git 配置必须隔离掉（autocrlf 等），否则「blob 里是不是 LF」这个结论会随机器漂移。
function makeRepo() {
  const dir = path.join(os.tmpdir(), 'mp-changelog-growth-' + process.pid + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(dir, { recursive: true });
  const emptyConfig = path.join(dir, 'empty-gitconfig');
  fs.writeFileSync(emptyConfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_SYSTEM: emptyConfig, HOME: dir, USERPROFILE: dir };
  const g = (args, opts = {}) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', maxBuffer: 1 << 26, env, ...opts,
  });
  g(['init', '-q', '-b', 'main']);
  return { dir, g, env };
}

function commitChangelog(repo, content, msg) {
  fs.writeFileSync(path.join(repo.dir, 'CHANGELOG.md'), content);
  repo.g(['add', 'CHANGELOG.md']);
  repo.g(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', msg]);
}

test('真仓库四档：顶插=过 / 截断=红 / 副本删一份=红 / 恢复=过（判据必须来自真 git 而不是假对象）', () => {
  const repo = makeRepo();
  const { dir, env } = repo;
  const base = '# [未发布] A\n\na\n# [未发布] B\n\nb\n# [未发布] B\n\nb2\n';
  commitChangelog(repo, base, 'base');

  // 0) 夹具自证：blob 里必须是 LF，否则「CRLF 工作树 / LF blob」这条归一判据根本没被测到
  const blob = execFileSync('git', ['-C', dir, 'cat-file', 'blob', 'HEAD:CHANGELOG.md'], { maxBuffer: 1 << 26, env }).toString('utf8');
  assert.ok(!blob.includes('\r'), '夹具的 blob 必须是 LF');

  // 1) 顶插一条 -> PASS
  commitChangelog(repo, '# [未发布] C\n\nc\n' + base, 'prepend');
  const r1 = collect({ base: 'HEAD^', head: 'HEAD', root: dir });
  assert.deepEqual(r1.lost, [], '顶插不得报丢');
  assert.equal(r1.baseTotal, 3);
  assert.equal(r1.headTotal, 4);

  // 2) 事故复现：整份替换成 1 条 -> 必须报丢 3 种
  commitChangelog(repo, '# [未发布] D\n\nd\n', 'truncate（复刻 #2884 形态）');
  const r2 = collect({ base: 'HEAD^', head: 'HEAD', root: dir });
  assert.equal(r2.lost.length, 3, 'A / B(2 份) / C 全不见了');
  const bLost = r2.lost.find((l) => l.heading === '# [未发布] B');
  assert.deepEqual({ wanted: bLost.wanted, got: bLost.got }, { wanted: 2, got: 0 });

  // 3) 只删重复副本中的一份 -> 仍须报丢（集合口径会漏，这条就是为它写的）
  commitChangelog(repo, '# [未发布] D\n\nd\n# [未发布] A\n\na\n# [未发布] B\n\nb2\n# [未发布] B\n\nb3\n# [未发布] C\n\nc\n', 'restore');
  const r3 = collect({ base: 'HEAD^', head: 'HEAD', root: dir });
  assert.equal(r3.lost.length, 0, '恢复到「A/B×2/C/D」超集，不得报丢');
  commitChangelog(repo, '# [未发布] D\n\nd\n# [未发布] A\n\na\n# [未发布] B\n\nb2\n# [未发布] C\n\nc\n', 'drop one B copy');
  const r4 = collect({ base: 'HEAD^', head: 'HEAD', root: dir });
  assert.equal(r4.lost.length, 1);
  assert.equal(r4.lost[0].heading, '# [未发布] B');

  // 4) main() 的退出码必须由判据驱动（红=1，绿=0）
  assert.equal(main(['--root=' + dir, '--base=HEAD^', '--head=HEAD']), 1, '副本被删那一档 main() 必须返回 1');
  commitChangelog(repo, '# [未发布] D\n\nd\n# [未发布] A\n\na\n# [未发布] B\n\nb2\n# [未发布] B\n\nb3\n# [未发布] C\n\nc\n', 'restore again');
  assert.equal(main(['--root=' + dir, '--base=HEAD^', '--head=HEAD']), 0);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('判据文件的扫描域不得为 0（防「解析退化成空集合」式假绿）', () => {
  const t = fs.readFileSync(path.join(__dirname, 'check-changelog-growth.js'), 'utf8');
  assert.ok(t.includes("Buffer.byteLength"), '必须同时留字节证据');
  assert.ok(/maxBuffer/.test(t), '读 blob 必须带 maxBuffer，否则 7.4MB 的 CHANGELOG 会 ENOBUFS');
});

// 接线锁（QM-6 之后补，动因是实测）：本门禁的 base 坐标系一旦写成 origin/main，就会把
// 「别人在我上次同步之后并入 main 的条目」读成本 PR 丢失 —— 本地实测该口径报 3 种丢失 rc=1，
// merge-base 口径 1145=1145 rc=0。这类"看起来更严格其实错坐标系"的改动，靠人记住是记不住的。
test('CI 接线锁：Gate 2c3 必须以 merge-base 为坐标系，且不得退回 origin/main', () => {
  const wfPath = path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml');
  const wf = fs.readFileSync(wfPath, 'utf8');
  const at = wf.indexOf('Gate 2c3 - CHANGELOG growth');
  assert.ok(at > 0, 'Gate 2c3 步骤必须存在于 quality-gate.yml');
  // 区间终点不能靠"下一个步骤名"（改名/搬家会让 indexOf 返回 -1，slice 的负终点被解释成倒数 ⇒ 静默放大到接近整份文件）
  const body = wf.slice(at);
  const end = body.search(/\n {6}- name:/);
  assert.ok(end > 0, '必须能定位本步骤的结束边界（找不到边界即红，不得静默扫全文）');
  const step = body.slice(0, end);
  assert.ok(step.includes('shell: bash'), '多命令 run 块必须 fail-fast（AGENTS.md：PowerShell 步骤不在中间命令非零时中止）');
  assert.ok(/git merge-base/.test(step), 'base 必须由 merge-base 推导，否则坐标系会随 main 前进漂移');
  assert.ok(!/--base\s*=\s*["']?(origin\/)?main["']?/.test(step), '不得把 base 写成 origin/main —— 那是别的 PR 的进度，不是本 PR 的起点');
  assert.ok(/\$\{MB:-\$BASE_REF\}/.test(step), 'merge-base 算不出时必须回落到 base_ref（更严方向回落，不许回落成空）');
  assert.ok(/node scripts\/check-changelog-growth\.js/.test(step) && /node --test/.test(step),
    '单测与门禁本体都必须接在同一步骤里（只接一个 = 另一半永不执行）');
});
