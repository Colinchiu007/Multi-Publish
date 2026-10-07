'use strict';
/*
 * scripts/check-spec-purpose.test.js —— 「主规格的 Purpose 不得为 TBD / 不得缺失」门禁的回归锁
 *
 * 动因（2026-10-07 实测）：openspec 归档器在 specs 文件里留下
 * `TBD - created by archiving change <name>. Update Purpose after archive.`，而**全仓没有任何东西在看它**
 * （`git grep -l Purpose -- scripts .github` = 0 命中）。存量 151 份主规格里 43 份如此，
 * 由 PR #3084 一次性填平。本门禁保证它不会再次静默积累。
 *
 * 三条不是"顺手加"的口径：
 * ① **扫的是全量，不是改动集**：Purpose 缺失不会被改动本文件的 PR 引入（可以是任何一次归档），
 *    按改动集判 = 只在"恰好又改了它"时才拦。全量可行是因为存量已归零；归零之前不能上这条。
 * ② **扫描域为空必须抛错**：`0 个文件` 与 `0 个违规` 在计数上长得一样，前者绝不能算通过
 *    （本仓反复踩过的"解析退化成空集合即假绿"）。另配规模下界断言。
 * ③ **接线位置由结构锁钉住**：本门禁的输入 `openspec/**` 命中 docs-only 白名单，
 *    放进被 `docs-only != 'true'` 门控的 static-gates 等于给自己关掉校验（AGENTS.md「进白名单前提锁」，
 *    同族先例 #2718 账本 JSON、#2745 执行记录、#3000 文档绝对路径）。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const gate = require('./check-spec-purpose.js');

function makeFixture (files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-purpose-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  }
  return root;
}
function rm (root) { try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ } }

const GOOD = '# foo Specification\n\n## Purpose\n定义 foo 的行为契约，判据只认下列 Requirement 与其 Scenario。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
const TBD = '# foo Specification\n\n## Purpose\nTBD - created by archiving change foo-init. Update Purpose after archive.\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
const NO_SECTION = '# foo Specification\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
const EMPTY_BODY = '# foo Specification\n\n## Purpose\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
const HEADING_ONLY_SPACE = '# foo Specification\n\n## Purpose\n   \n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';

test('干净夹具 ⇒ 通过，且报告扫描到的规格数', () => {
  const root = makeFixture({ 'openspec/specs/foo/spec.md': GOOD, 'openspec/specs/bar/baz/spec.md': GOOD });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.total, 2);
    assert.deepEqual(r.bad, []);
  } finally { rm(root); }
});

test('Purpose 仍是归档器留下的 TBD ⇒ 红，并点名是哪个文件、哪句', () => {
  const root = makeFixture({ 'openspec/specs/foo/spec.md': GOOD, 'openspec/specs/leftover/spec.md': TBD });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.bad.length, 1);
    assert.match(r.bad[0].file, /left\/?over|leftover/);
    assert.equal(r.bad[0].reason, 'TBD');
  } finally { rm(root); }
});

test('整段没有 ## Purpose ⇒ 红（缺段不是"没有可判的东西"，是缺陷）', () => {
  const root = makeFixture({ 'openspec/specs/foo/spec.md': NO_SECTION });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.bad[0].reason, 'MISSING_SECTION');
  } finally { rm(root); }
});

test('Purpose 段存在但内容为空 / 只有空白 ⇒ 红（两种都不许读成"写过"）', () => {
  const root = makeFixture({
    'openspec/specs/a/spec.md': EMPTY_BODY,
    'openspec/specs/b/spec.md': HEADING_ONLY_SPACE,
  });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.bad.length, 2);
    r.bad.forEach((b) => assert.equal(b.reason, 'EMPTY'));
  } finally { rm(root); }
});

test('扫描域为空 ⇒ 抛错（"0 个文件"与"0 个违规"不能同形）', () => {
  const root = makeFixture({ 'README.md': '# 空仓库\n' });
  try {
    assert.throws(() => gate.check({ root, minSpecs: 0 }), /未找到任何|扫描域为空|扫描域不存在|扫描域读不动|no spec/i);
  } finally { rm(root); }
});

test('第二条空集路径也必须抛：目录**存在**但里面没有任何 spec.md（"没有可判的东西"与"全部合规"必须可区分）', () => {
  // M3 反证实测：上一版只覆盖了"目录不存在"这一条出口，于是把 check() 里
  // "扫描域为空 ⇒ 抛" 改成直接 return ok:true 的变异**照样全绿**（NOT_RED）。
  // 两条空集出口必须各自有锁，否则其中一条就是装饰。
  const root = makeFixture({ 'openspec/specs/keep.txt': 'not a spec\n' });
  try {
    assert.throws(() => gate.check({ root, minSpecs: 0 }), /扫描域为空|未找到任何|命中 0 个/);
  } finally { rm(root); }
});

test('生产默认下界必须是真下界（为 0 等于把空集假绿的防线拆掉）', () => {
  assert.ok(gate.DEFAULT_MIN_SPECS > 0, 'DEFAULT_MIN_SPECS 必须 > 0');
  assert.match(gate.SPEC_DIR, /^openspec\/specs$/, '扫描域必须是主规格目录，不是 changes 增量目录');
});

test('规模下界：扫描数低于 minSpecs 即抛（防"目录改名/路径写错"退化成空集）', () => {
  const root = makeFixture({ 'openspec/specs/only/spec.md': GOOD });
  try {
    assert.throws(() => gate.check({ root, minSpecs: 2 }), /少于下界|minSpecs|规模/i);
    const ok = gate.check({ root, minSpecs: 1 });
    assert.equal(ok.ok, true);
  } finally { rm(root); }
});

test('TBD 判据按语义特征而不是只认那一句模板（换归档器措辞也要拦；含中文占位）', () => {
  const variants = {
    'openspec/specs/v1/spec.md': '# v1 Specification\n\n## Purpose\nTBD\n\n## Requirements\n### Requirement: A\nSHALL A。\n',
    'openspec/specs/v2/spec.md': '# v2 Specification\n\n## Purpose\nTBD - created by archiving change whatever.\n\n## Requirements\n### Requirement: A\nSHALL A。\n',
    'openspec/specs/v3/spec.md': '# v3 Specification\n\n## Purpose\n待补充（归档后请更新 Purpose）\n\n## Requirements\n### Requirement: A\nSHALL A。\n',
    'openspec/specs/ok/spec.md': GOOD.replace(/^# foo/, '# ok'),
  };
  const root = makeFixture(variants);
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false);
    const badNames = r.bad.map((b) => b.file).join(' ');
    ['v1', 'v2', 'v3'].forEach((v) => assert.match(badNames, new RegExp(v)));
    assert.doesNotMatch(badNames, /(^|[^a-z])ok([^a-z]|$)/);
  } finally { rm(root); }
});

test('扫描域：collect 只从 openspec/specs 出发，isSpecFile 作为独立谓词必须自己守住排除口径', () => {
  // QM-6 工程轴 F5 实测：本用例原来只往 fixture 里塞一份 `openspec/changes/.../spec.md` 再断言
  // r.total===1 —— 那份文件**根本不在 walk 的起点下**，删掉 isSpecFile 里的排除分支照样绿。
  // 那是恒真夹具。现拆成两层，各锁各的：
  //   ① 谓词层（直接调用导出的 isSpecFile，正向 + 反向都给）；
  //   ② 装配层（check 的域大小，锁 collect 的起点没跑偏）。
  assert.equal(gate.isSpecFile(path.join('openspec', 'specs', 'foo', 'spec.md')), true, '主规格必须在域内');
  assert.equal(gate.isSpecFile(path.join('openspec', 'changes', 'x', 'specs', 'foo', 'spec.md')), false,
    '增量规格（提案期 TBD 属正常）必须被谓词排除');
  assert.equal(gate.isSpecFile(path.join('openspec', 'specs', 'foo', 'other.md')), false, '非 spec.md 不在域内');

  const root = makeFixture({
    'openspec/specs/foo/spec.md': GOOD,
    'openspec/changes/some-change/specs/foo/spec.md': TBD,
  });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.total, 1, 'collect 的起点必须是 openspec/specs，不得把 changes 卷进来：' + JSON.stringify(r));
    assert.equal(r.ok, true, '增量规格里的 TBD 属正常（尚未归档），不该拦');
  } finally { rm(root); }
});

test('占位词表的负控：以「待/占」开头的合法 Purpose 不得误杀；毛刺边界按现状钉住（QM-6 工程轴 F1）', () => {
  // AGENTS.md「枚举式黑名单必须配结构化正向契约」要求：样本不得取自被枚举集合本身。
  // 三条阳性样本（TBD / TBD-模板 / 待补充）全是枚举集成员，所以只测它们证明不了判据的**边界**在哪。
  const negatives = {
    'openspec/specs/todo-mgr/spec.md': '# todo-mgr Specification\n\n## Purpose\n\n待办事项管理器的行为契约，判据只认下列 Requirement。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n',
    'openspec/specs/occupy/spec.md': '# occupy Specification\n\n## Purpose\n\n占用与释放的语义：同一账号不得并发开窗。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n',
    'openspec/specs/placeholder-word/spec.md': '# pw Specification\n\n## Purpose\n\n占位符替换规则的契约（此处"占位符"是被建模的对象，不是自述）。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n',
  };
  const root = makeFixture(negatives);
  try {
    const r = gate.check({ root, minSpecs: 0 });
    const flagged = r.bad.map((b) => String(b.file).split(path.sep).join('/'));
    assert.deepEqual(flagged, ['openspec/specs/placeholder-word/spec.md'],
      '「待办」「占用」必须放过；而以「占位」二字起头的一句合法名词短语**按现状会被误杀** —— '
      + '这里把它钉成已知代价，而不是假装它不会发生');
  } finally { rm(root); }
  // 代价评估（实测）：151 份主规格里以这 7 个占位词起头的合法 Purpose = 0（"违规 0" 即该证据）。
  // 真撞上时的正解是改写那句 Purpose（原因码 TBD 会点名它），**不是**给 ^占位 加限定词 ——
  // 加了就把「占位，稍后补」这类真占位放过了（见下面 hairTrigger 那条）。

  // 同一批词根的"自述没写完"形态必须拦 —— 证明上一条不是把判据改宽改出来的空集
  const hairTrigger = makeFixture({
    'openspec/specs/x/spec.md': '# x Specification\n\n## Purpose\n\n待定，归档后补。\n\n## Requirements\n### Requirement: A\nSHALL A。\n',
  });
  try {
    const r = gate.check({ root: hairTrigger, minSpecs: 0 });
    assert.equal(r.ok, false, '以「待定」开头按设计就是占位（该取舍的理由写在 check-spec-purpose.js 的 PLACEHOLDER_RES 注释里）');
    assert.equal(r.bad[0].reason, 'TBD');
  } finally { rm(hairTrigger); }

  // 未登记词（TBA / 稍后补 / XXX）会放过 —— 这是枚举式的固有边界，钉住现状以免被读成"什么都能拦"
  assert.equal(gate.evaluatePurpose('TBA - 稍后补'), null, '已知边界：未登记占位词放过，不得在文档里声称能拦');
});

/* ---------------- CLI 契约：判据自身坏了必须出声，不得静默按缺省跑 ---------------- */

function runCli (args, cwdRoot) {
  const script = path.join(__dirname, 'check-spec-purpose.js');
  const argv = cwdRoot ? args.concat(['--root=' + cwdRoot]) : args;
  const p = cp.spawnSync(process.execPath, [script].concat(argv), { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { rc: p.status, out: String(p.stdout || ''), err: String(p.stderr || '') };
}

test('--limit / --min-specs 的畸形数值一律 rc=2 出声，不得静默回落默认（QM-6 工程轴 F6）', () => {
  // 旧实现：Number('abc')=NaN ⇒ slice(0, NaN)=[] ⇒ "违规一条都不列出但 rc 仍为 1"，
  // 把本门禁唯一的现场输出（逐条点名）静默吞掉；minSpecs 同理被换成没人看见的缺省。
  const root = makeFixture({
    'openspec/specs/a/spec.md': TBD,
    'openspec/specs/b/spec.md': TBD,
    'openspec/specs/c/spec.md': EMPTY_BODY,
  });
  try {
    const bad1 = runCli(['--limit=abc'], root);
    assert.equal(bad1.rc, 2, '坏 --limit 必须 rc=2，实到 rc=' + bad1.rc + ' out=' + bad1.out);
    assert.match(bad1.err, /--limit=abc/);

    const bad2 = runCli(['--min-specs=2.5'], root);
    assert.equal(bad2.rc, 2, '--min-specs=2.5 不是整数，必须 rc=2，实到 rc=' + bad2.rc);
    const bad3 = runCli(['--min-specs=-1'], root);
    assert.equal(bad3.rc, 2, '负下界必须 rc=2（"下界"为负等于把退化防线关掉）');
    // 超大下界**不**属用法错误：它是合法整数，且效果是 fail-closed（扫描数必然低于它 ⇒ 抛错判不通过），
    // 而不是静默放过。这里钉住方向，防止后来者"顺手"给它加放行。
    const huge = runCli(['--min-specs=999999'], root);
    assert.equal(huge.rc, 1, '超大下界必须是"不通过"而不是"通过"：' + huge.err.slice(0, 120));
    assert.match(huge.err, /FAIL\(closed\)/);

    // 正向对照：同一份夹具在合法值下必须真把违规打出来（否则上面几条 rc=2 也可能只是"根本没跑起来"）。
    // 夹具只有 3 份规格 ⇒ 必须显式 --min-specs=0，否则会撞上规模下界那条出口（那是另一条 rc=1）。
    const good = runCli(['--limit=5', '--min-specs=0'], root);
    assert.equal(good.rc, 1, '夹具本身必须有违规：rc=' + good.rc + ' out=' + good.out + ' err=' + good.err);
    assert.match(good.out, /违规 3/);
    // --limit 的语义也得被证明"真的在起作用"，这样"NaN 让它失效"才不是一句推测
    const trunc = runCli(['--limit=1', '--min-specs=0'], root);
    assert.match(trunc.out, /另有 2 处未列出/, 'limit 必须真截断明细并出声：' + trunc.out);
    assert.equal((trunc.out.match(/ {2}(TBD|EMPTY|MISSING_SECTION)\s/g) || []).length, 1, '只应列出 1 条明细：' + trunc.out);
  } finally { rm(root); }
});

test('--help 出用法并 rc=0；未知选项 rc=2；空格式 --root 与等号式等价（QM-6 工程轴 F7 / F8）', () => {
  const h = runCli(['--help']);
  assert.equal(h.rc, 0, '--help 必须 0：' + h.err);
  assert.match(h.out, /用法：node scripts\/check-spec-purpose\.js/);
  assert.match(h.out, /退出码语义/, '用法里必须写清退出码口径（判据故障与违规共用 1，是刻意保持的）');

  const u = runCli(['--nope=1']);
  assert.equal(u.rc, 2, '未知选项必须 rc=2');
  assert.match(u.err, /unknown option: --nope=1/);

  // 空格式与等号式必须落到同一个 root（最近的同族判据 check-doc-abs-paths.js 的文件头
  // 专门记录过"只认等号式会被静默忽略"的实测事故）
  const root = makeFixture({ 'openspec/specs/foo/spec.md': GOOD });
  try {
    const eqForm = cp.spawnSync(process.execPath,
      [path.join(__dirname, 'check-spec-purpose.js'), '--min-specs=0', '--root=' + root], { encoding: 'utf8' });
    const spaceForm = cp.spawnSync(process.execPath,
      [path.join(__dirname, 'check-spec-purpose.js'), '--min-specs', '0', '--root', root], { encoding: 'utf8' });
    assert.equal(eqForm.status, 0, eqForm.stderr);
    assert.equal(spaceForm.status, 0, spaceForm.stderr);
    assert.equal(spaceForm.stdout, eqForm.stdout, '两种取值形态必须产出同一结果（否则空格式其实没被采纳）');
  } finally { rm(root); }
});

/* ---------------- 接线结构锁：位置不对 = 门禁形同不存在 ---------------- */

/**
 * 轻量 step 提取器（**不能**改用 js-yaml：本门禁住在 `changes` job，那个 job 实测只有
 * `actions/checkout` + 门禁命令、没有 Install deps ⇒ require('js-yaml') 会在 CI 当场
 * MODULE_NOT_FOUND。仓库里用 js-yaml 的三把 workflow 锁全跑在有依赖的 static-gates。）
 *
 * 只认 `- name:` 头部，按该头部自带的缩进推块边界 ⇒ 对缩进/引号风格不敏感（QM-6 B7）。
 * 注释行单独剥掉：注释里提一句"scripts/check-spec-purpose.js"不构成接线，
 * 反之注释里出现该串也不该把位置判到注释上（QM-6 B6）。
 */
function extractSteps (ymlText) {
  const lines = String(ymlText).split(/\r?\n/);
  const steps = [];
  let cur = null;
  for (const raw of lines) {
    const m = /^(\s*)-\s+name:\s*(.+?)\s*$/.exec(raw);
    if (m) {
      cur = { name: m[2].replace(/^["']|["']$/g, ''), indent: m[1].length, lines: [] };
      steps.push(cur);
      continue;
    }
    if (!cur) continue;
    const ind = (/^(\s*)/.exec(raw) || ['', ''])[1].length;
    const isStepSibling = /^\s*-\s+\S/.test(raw) && ind <= cur.indent;
    const dedented = raw.trim() !== '' && ind < cur.indent;
    if (isStepSibling || dedented) { cur = null; continue; }
    cur.lines.push(raw);
  }
  return steps.map((s) => {
    const code = s.lines.filter((l) => !/^\s*#/.test(l)).join('\n');
    const comments = s.lines.filter((l) => /^\s*#/.test(l)).join('\n');
    return { name: s.name, code, comments, raw: s.lines.join('\n') };
  });
}

/** 取某个 job 的原文（按两空格缩进的顶层 job 边界切） */
function jobBody (ymlText, jobName) {
  const lines = String(ymlText).split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp('^  ' + jobName + ':\\s*$').test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z][\w-]*:\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

const WF_PATH = path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml');

// 接线锚点的**唯一登记处**（QM-6 工程轴 F9：原先三个锚点散在两个用例里，step 改名要多处改）。
// 刻意不写死门禁编号 "12d" —— 编号是文档性命名，改编号不该让锁变红；按语义标题定位才是读者唯一能核对的东西。
const ANCHOR = {
  gateStep: /Spec Purpose presence/,
  classifyStep: /Detect docs-only changes/,
  classifyId: /id:\s*classify/,
  gateCmd: 'node scripts/check-spec-purpose.js',
  gateTestCmd: 'node --test scripts/check-spec-purpose.test.js',
  gateCmdNeedle: 'scripts/check-spec-purpose.js',
};

test('提取器自证：注释里的提及不构成接线，step 正文里的才算（否则位置锁是恒真式）', () => {
  const sample = [
    'jobs:',
    '  changes:',
    '    steps:',
    '      - name: "甲"',
    '        run: |',
    '          # node scripts/ghost.js',
    '      - name: "乙"',
    '        run: |',
    '          node scripts/ghost.js',
    '',
  ].join('\n');
  const steps = extractSteps(sample);
  assert.equal(steps.length, 2, '应识别出两个 step：' + JSON.stringify(steps.map((s) => s.name)));
  assert.equal(steps[0].code.includes('scripts/ghost.js'), false, '注释行不得进 code（B6 的洞就在这）');
  assert.match(steps[0].comments, /scripts\/ghost\.js/);
  assert.match(steps[1].code, /node scripts\/ghost\.js/);
  // 反向自证：如果提取器把整个 job 原文当 code，第一条也会命中 ⇒ 上面那条断言就恒假
  assert.match(jobBody(sample, 'changes'), /# node scripts\/ghost\.js/);
  assert.equal(jobBody(sample, 'nope'), null, 'job 名写错时必须返回 null，不得返回空串冒充"找到了"');
});

test('quality-gate.yml 必须把本门禁接在 changes job（不被 docs-only 短路的 job），且在 classify 之后', () => {
  const yml = fs.readFileSync(WF_PATH, 'utf8');

  const body = jobBody(yml, 'changes');
  assert.ok(body !== null, '找不到 changes job ⇒ 结构锁的前置失效，不得继续判"通过"');
  const steps = extractSteps(body);
  assert.ok(steps.length > 0, 'changes job 里一个具名 step 都没解析出来 ⇒ 提取器或 workflow 形状坏了');

  const gateIdx = steps.findIndex((s) => ANCHOR.gateStep.test(s.name));
  assert.ok(gateIdx >= 0, 'changes job 里必须有一个按语义标题定位得到的 Spec Purpose step，实际 step：'
    + JSON.stringify(steps.map((s) => s.name)));
  const classifyIdx = steps.findIndex((s) => ANCHOR.classifyStep.test(s.name) || ANCHOR.classifyId.test(s.raw));
  assert.ok(classifyIdx >= 0, 'changes job 里找不到 classify step ⇒ 顺序判据的前置失效');
  assert.ok(gateIdx > classifyIdx,
    '本门禁必须排在 classify 之后：排在前面时它一红会让 docs-only 输出整条消失，下游重型 job 全部跑满');

  // 命令必须落在**这个 step 自己的正文**里，且不能被注释糊过去
  const step = steps[gateIdx];
  assert.match(step.raw, /run:\s*\|/, 'step 必须是 run 块');
  assert.ok(step.code.includes(ANCHOR.gateTestCmd), '测试必须与门禁同 step 点名，否则等于没跑');
  assert.ok(step.code.includes(ANCHOR.gateCmd), '门禁命令必须住在 changes job 的该 step 正文（输入 openspec/** 在 docs-only 白名单里）');

  // 反向：确认它没有被"顺手"放进会被短路的 static-gates —— 那样等于自我关闭
  const staticBody = jobBody(yml, 'static-gates');
  if (staticBody !== null) {
    const hit = extractSteps(staticBody).filter((s) => s.code.includes(ANCHOR.gateCmdNeedle));
    assert.deepEqual(hit.map((s) => s.name), [], '不得同时/改为接在 static-gates —— 那个 job 被 docs-only 短路');
  }
});

test('CI 接线判据按语义特征拆条件，不得只匹配字面串（同族坑：插了 --require 后两个面从枚举里消失）', () => {
  const yml = fs.readFileSync(WF_PATH, 'utf8');
  const body = jobBody(yml, 'changes');
  assert.ok(body !== null, '找不到 changes job');
  const steps = extractSteps(body);
  const named = steps.filter((s) => ANCHOR.gateStep.test(s.name));
  assert.equal(named.length, 1, '按语义标题必须恰好定位到一个 step（0 个=接线丢了，>1 个=判据失去唯一读者）：'
    + named.length + ' / 全部 step=' + JSON.stringify(steps.map((s) => s.name)));
  // 标题不写死编号：Gate 12d 这个编号是文档性命名，改名不应让锁变红；但正文两条命令必须都在
  assert.ok(named[0].code.includes(ANCHOR.gateTestCmd));
  assert.ok(named[0].code.includes(ANCHOR.gateCmd));
  // 锚点登记表本身不得退化成恒真：needle 必须真出现在被定位的 step 正文里（不是整份文件里）
  assert.ok(!named[0].comments.includes(ANCHOR.gateCmd), '若哪天把命令挪成注释，本锁必须失去它 —— 先确认现状不是注释');
});

test('能力目录恰好命名为 changes / archive 时不得被静默排除出扫描域（QM-6 B9）', () => {
  // 旧实现用 /(^|\/)changes\// 判排除 ⇒ openspec/specs/changes/spec.md 这种路径段恰好同名的
  // 主规格会被静默跳过；现状量测 `ls openspec/specs` 无同名目录，所以这是预防性收紧。
  assert.equal(gate.isSpecFile(path.join('openspec', 'specs', 'changes', 'spec.md')), true,
    '名为 changes 的能力目录必须仍在域内');
  assert.equal(gate.isSpecFile(path.join('openspec', 'specs', 'archive', 'spec.md')), false,
    'openspec/specs/archive/ 是归档位，不在域内');
  const root = makeFixture({
    'openspec/specs/changes/spec.md': TBD,
    'openspec/specs/foo/spec.md': GOOD,
  });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.total, 2, '两份都必须在扫描域内：' + JSON.stringify(r));
    assert.equal(r.ok, false, '名为 changes 的主规格留 TBD 必须变红');
    assert.match(r.bad[0].file, /changes/);
  } finally { rm(root); }
});

test('一份文件里有第二个 Purpose 段且它是 TBD ⇒ 必须变红（QM-6 B1：只查第一段会静默放过）', () => {
  const dup = '# foo Specification\n\n## Purpose\n\n定义 foo 的行为契约。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n\n## Purpose\nTBD - created by archiving change foo-init. Update Purpose after archive.\n';
  const root = makeFixture({ 'openspec/specs/foo/spec.md': dup, 'openspec/specs/ok/spec.md': GOOD });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false, '第二段 TBD 必须被看见：' + JSON.stringify(r));
    assert.equal(r.bad.length, 1);
    assert.equal(r.bad[0].reason, 'TBD');
    assert.equal(r.bad[0].section, 2, '违规必须点名是第几个 Purpose 段');
    assert.equal(r.badFiles, 1);
  } finally { rm(root); }

  // 同一段写了两遍且都合规 ⇒ 不得红（重复标题本身不是本门禁的职责，别把它变成噪声源）
  const dupOk = '# bar Specification\n\n## Purpose\n定义 bar。\n\n## Purpose\n再定义一次 bar。\n';
  const root2 = makeFixture({ 'openspec/specs/bar/spec.md': dupOk });
  try {
    assert.equal(gate.check({ root: root2, minSpecs: 0 }).ok, true);
  } finally { rm(root2); }
});

test('Purpose 标题层级：### 可接受；##Purpose 不是 ATX 标题，缺段判定才是正确的（QM-6 B2 的半否证）', () => {
  const h3 = '# foo Specification\n\n### Purpose\n\n定义 foo 的行为契约。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
  assert.equal(gate.violationsOf(h3).length, 0, '### Purpose 必须被认：' + JSON.stringify(gate.violationsOf(h3)));
  assert.equal(gate.purposeBodiesOf(h3).length, 1, '### Purpose 只应收成一段（不得把 Requirements 里的标题也算进去）');

  // CommonMark：ATX 标题在 # 序列后必须跟空格/制表符或行尾，`##Purpose` 是普通段落
  // ⇒ 该文件"没有 Purpose 段"是事实，MISSING_SECTION 不是误报（实测 151 份主规格逐字都是 "## Purpose"）
  const noSpace = '# foo Specification\n\n##Purpose\n\n定义 foo。\n';
  assert.equal(gate.violationsOf(noSpace)[0].reason, 'MISSING_SECTION');

  // Requirements 里的 `### Requirement: X` 不得被当成第二个 Purpose 段
  assert.equal(gate.purposeBodiesOf(GOOD).length, 1);
});

test('前导 BOM 不得把写好的 Purpose 误判成缺段，也不得把 TBD 放过（QM-6 B3 / 自查 F-A，预防性加固）', () => {
  // ⚠️ 样本形状必须让 BOM **压在 Purpose 标题行上**，否则这条锁是恒过的：
  // 反证 M9（去掉剥 BOM 的动作）首跑就报了 NOT_RED —— 因为 GOOD/TBD 两份夹具的第一行是 H1 标题，
  // BOM 只污染 H1，而我根本不看 H1。⇒ 判据真正承重的形状是"`## Purpose` 落在文件第一行"。
  const bomHeadGood = '\uFEFF## Purpose\n\n定义 foo 的行为契约。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
  const bomHeadTbd = '\uFEFF## Purpose\nTBD - created by archiving change foo-init. Update Purpose after archive.\n';
  assert.equal(gate.violationsOf(bomHeadGood).length, 0, 'BOM 压在 Purpose 标题上时不得判缺段：' + JSON.stringify(gate.violationsOf(bomHeadGood)));
  const v = gate.violationsOf(bomHeadTbd);
  assert.equal(v.length, 1, '剥 BOM 不能把判据变成 no-op：' + JSON.stringify(v));
  assert.equal(v[0].reason, 'TBD');

  // 现实里更常见的形状（BOM + H1 在前）本来就不受影响 —— 钉住这一点，避免把这条修描述成"救了 151 份"
  const bomAfterH1 = '\uFEFF' + GOOD;
  assert.equal(gate.violationsOf(bomAfterH1).length, 0);
  assert.equal(gate.violationsOf('\uFEFF' + TBD)[0].reason, 'TBD', 'BOM 在 H1 前时，TBD 仍由正文开头判出（与剥不剥无关）');

  const root = makeFixture({ 'openspec/specs/a/spec.md': bomHeadGood, 'openspec/specs/b/spec.md': bomHeadTbd });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.bad.length, 1);
    const badFile = String(r.bad[0].file).split(path.sep).join('/');
    assert.equal(badFile, 'openspec/specs/b/spec.md', '被点名的必须是带 BOM 的那份 TBD：' + badFile);
  } finally { rm(root); }
});

test('Purpose 与正文之间按惯例有空行时，不得把正文收成空（本版判据曾在真实文件上这样误判 15 份）', () => {
  const withBlank = '# foo Specification\n\n## Purpose\n\n定义 foo 的行为契约：做什么、不做什么。\n\n补充说明。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
  const root = makeFixture({ 'openspec/specs/foo/spec.md': withBlank });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, true, JSON.stringify(r.bad));
  } finally { rm(root); }

  // 同一段里出现代码围栏，围栏内的 `#` 不得被当成"下一个标题"把正文截断
  const fenced = '# bar Specification\n\n## Purpose\n\n示例：\n\n```md\n# 这不是标题\n```\n\n收尾一句。\n\n## Requirements\n### Requirement: A\n系统 SHALL 做 A。\n';
  const root2 = makeFixture({ 'openspec/specs/bar/spec.md': fenced });
  try {
    const bodies = gate.purposeBodiesOf(fs.readFileSync(path.join(root2, 'openspec/specs/bar/spec.md'), 'utf8'));
    assert.equal(bodies.length, 1, '围栏内没有第二个 Purpose 标题');
    assert.match(bodies[0], /收尾一句/);
    assert.equal(gate.evaluatePurpose(bodies[0]), null);
  } finally { rm(root2); }

  // 真·空段仍必须是 EMPTY（上一条不能退化成"什么都算过"）
  const root3 = makeFixture({ 'openspec/specs/e/spec.md': EMPTY_BODY });
  try {
    const r = gate.check({ root: root3, minSpecs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.bad[0].reason, 'EMPTY');
  } finally { rm(root3); }
});

test('真实仓库：Purpose 已写好的规格不得被判 EMPTY（防"多行 $ 吃掉空行"这类形状误判复发）', () => {
  const root = path.join(__dirname, '..');
  const r = gate.check({ root });
  assert.equal(r.unreadable, 0, '有文件读不动时本次扫描不构成证据：' + JSON.stringify(r.bad.filter((b) => b.reason === 'UNREADABLE')));
  const emptied = r.bad.filter((b) => b.reason === 'EMPTY' || b.reason === 'MISSING_SECTION');
  // 只允许"确实没写"的进入违规；creator-monitor 这类写了却不合规形状的一律不得出现
  const sample = fs.readFileSync(path.join(root, 'openspec/specs/creator-monitor/spec.md'), 'utf8');
  const sampleBodies = gate.purposeBodiesOf(sample);
  assert.equal(sampleBodies.length, 1, 'creator-monitor 只应有一个 Purpose 段：实际 ' + sampleBodies.length);
  assert.equal(gate.evaluatePurpose(sampleBodies[0]), null, 'creator-monitor 明明写了 Purpose，却被判 EMPTY ⇒ 扫描器又按文本形态猜错了');
  assert.equal(gate.violationsOf(sample).length, 0, '真实文件必须零违规：' + JSON.stringify(gate.violationsOf(sample)));
  // 原判据是 assert.ok(Array.isArray(emptied)) —— 恒真式（任何实现都满足），掩住了本用例自称的
  // "只允许确实没写的进入违规"（QM-6 工程轴 F10）。改成有独占红出口的断言：
  assert.deepEqual(emptied.map((b) => b.file), [], '真实仓库里不得有任何 EMPTY/MISSING_SECTION 违规；一旦出现就必须点名，不得只断言"它是个数组"');
});

test('新增门禁脚本必须被 .gitignore 的 negation 放行（scripts/*.js 默认忽略新建脚本）', () => {
  const root = path.join(__dirname, '..');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(ignore.includes('!scripts/check-spec-purpose.js'), '缺 negation ⇒ 本地有、CI 没有，判据会在 CI 上 MODULE_NOT_FOUND');
  // 测试文件不要求逐条 negation：第 166 行的 `!scripts/*.test.js` 已按模式放行（要求逐条反而是不可实现的空话）
  assert.ok(ignore.includes('!scripts/*.test.js'), '测试文件必须按模式放行，否则新用例静默不入仓库');
  let out = '';
  try {
    out = cp.execFileSync('git', ['-C', root, 'check-ignore', '--no-index', '--',
      'scripts/check-spec-purpose.js', 'scripts/check-spec-purpose.test.js'], { encoding: 'utf8' });
  } catch (e) {
    out = String(e.stdout || '');
  }
  assert.equal(out.trim(), '', 'git check-ignore 必须对两个新文件零命中：' + out.trim());
});
