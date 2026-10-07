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

test('changes 目录下的 spec.md 不得进入扫描域（那是提案增量，不是主规格）', () => {
  const root = makeFixture({
    'openspec/specs/foo/spec.md': GOOD,
    'openspec/changes/some-change/specs/foo/spec.md': TBD,
  });
  try {
    const r = gate.check({ root, minSpecs: 0 });
    assert.equal(r.ok, true, '增量规格里的 TBD 属正常（尚未归档），不该拦');
    assert.equal(r.total, 1);
  } finally { rm(root); }
});

/* ---------------- 接线结构锁：位置不对 = 门禁形同不存在 ---------------- */

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
    const body = gate.purposeBodyOf(fs.readFileSync(path.join(root2, 'openspec/specs/bar/spec.md'), 'utf8'));
    assert.match(body, /收尾一句/);
    assert.equal(gate.evaluatePurpose(body), null);
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
  assert.equal(gate.evaluatePurpose(gate.purposeBodyOf(sample)), null, 'creator-monitor 明明写了 Purpose，却被判 EMPTY ⇒ 扫描器又按文本形态猜错了');
  assert.ok(Array.isArray(emptied));
});

test('quality-gate.yml 必须把本门禁接在 changes job（不被 docs-only 短路的 job），且在 classify 之后', () => {
  const wfPath = path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml');
  const yml = fs.readFileSync(wfPath, 'utf8');
  const lines = yml.split(/\r?\n/);

  const changesStart = lines.findIndex((l) => /^ {2}changes:\s*$/m.test(l));
  assert.ok(changesStart >= 0, '找不到 changes job');
  let staticStart = lines.length;
  for (let i = changesStart + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z][\w-]*:\s*$/.test(lines[i])) { staticStart = i; break; }
  }
  const jobBody = lines.slice(changesStart, staticStart).join('\n');

  assert.match(jobBody, /scripts\/check-spec-purpose\.js/, '门禁命令必须住在 changes job（输入 openspec/** 在 docs-only 白名单里）');
  assert.match(jobBody, /node --test scripts\/check-spec-purpose\.test\.js/, '测试必须与门禁同 step 点名，否则等于没跑');

  const classifyAt = jobBody.indexOf('id: classify');
  const gateAt = jobBody.indexOf('scripts/check-spec-purpose.js');
  assert.ok(classifyAt >= 0, 'changes job 里找不到 classify step');
  assert.ok(gateAt > classifyAt, '本门禁必须排在 classify 之后：排在前面时它一红会让 docs-only 输出整条消失，下游重型 job 全部跑满');

  // 反向：确认它没有被"顺手"放进会被短路的 static-gates —— 那样等于自我关闭
  const staticIdx = lines.findIndex((l) => /^ {2}static-gates:/.test(l));
  if (staticIdx >= 0) {
    const rest = lines.slice(staticIdx).join('\n');
    const nextTop = rest.slice(1).search(/^ {2}[A-Za-z][\w-]*:\s*$/m);
    const staticBody = nextTop > 0 ? rest.slice(0, nextTop) : rest;
    assert.doesNotMatch(staticBody, /scripts\/check-spec-purpose\.js/, '不得同时/改为接在 static-gates —— 那个 job 被 docs-only 短路');
  }
});

test('CI 接线判据按语义特征拆条件，不得只匹配字面串（同族坑：插了 --require 后两个面从枚举里消失）', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'quality-gate.yml'), 'utf8');
  const step = /- name: "Gate \d+\w* - Spec Purpose presence[\s\S]*?\n      (?:-\s|# ---)/m.exec(yml);
  assert.ok(step, 'Gate step 标题必须存在且可被定位');
  assert.match(step[0], /run:\s*\|/);
  assert.match(step[0], /node --test scripts\/check-spec-purpose\.test\.js/);
  assert.match(step[0], /node scripts\/check-spec-purpose\.js/);
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
