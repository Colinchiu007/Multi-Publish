'use strict';

/**
 * check-dep-audit 门禁用例（node:test）。
 * 全部注入假扫描结果/假时钟，不联网、不调用 pnpm / pip-audit。
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const D = require('./check-dep-audit.js');

const FUTURE = '2099-01-01';

function entry (source, id, extra) {
  return Object.assign({ source, id, module: 'm', severity: 'high', patched: '>=1.2.3', roots: ['apps__desktop'] }, extra);
}

function ledger (source, id, decision, note) {
  // targetVersion 是「挂账可闭合」判据要求的字段（check-dep-audit.js 判定 4）。
  // 夹具默认取 patched 的下界，使 ledger() 表示一条合规挂账；不合规形态由专门用例显式覆盖。
  return Object.assign(entry(source, id), { decision: decision || 'upgrade-tracked', note: note === undefined ? '已排期升级' : note, targetVersion: '1.2.3' });
}

test('npm audit JSON 解析：按 GHSA 去重并汇总 workspace 根', () => {
  const rows = D.parseNpmAudit({
    advisories: {
      1: { github_advisory_id: 'GHSA-a', module_name: 'qs', severity: 'moderate', patched_versions: '>=6.16.0', findings: [{ version: '6.15.3', paths: ['packages__ai-writer-api>express>qs', 'apps__desktop>vite>qs'] }] },
      2: { github_advisory_id: 'GHSA-a', module_name: 'qs', severity: 'moderate', patched_versions: '>=6.16.0', findings: [{ version: '6.15.3', paths: ['packages__ui>x>qs'] }] },
      3: { id: 99, module_name: 'no-ghsa', severity: 'low', patched_versions: '', findings: [] },
    },
  });
  assert.equal(rows.length, 2, '同一公告只保留一条');
  const ghsa = rows.find((r) => r.id === 'GHSA-a');
  assert.deepEqual(ghsa.roots, ['apps__desktop', 'packages__ai-writer-api', 'packages__ui']);
  assert.equal(ghsa.source, 'npm');
  assert.equal(rows.find((r) => r.module === 'no-ghsa').id, 'npm-99', '缺 GHSA 号时退回 npm advisory id');
});

test('pip-audit JSON 解析：同一公告命中多个包时合并包名', () => {
  const rows = D.parsePipAudit({
    dependencies: [
      { name: 'ecdsa', version: '0.19.2', vulns: [{ id: 'PYSEC-1', fix_versions: [] }] },
      { name: 'joserfc', version: '1.0', vulns: [{ id: 'PYSEC-1', fix_versions: ['1.1'] }] },
      { name: 'clean', version: '1.0', vulns: [] },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'pip');
  assert.equal(rows[0].module, 'ecdsa,joserfc');
  assert.equal(rows[0].patched, '1.1');
  assert.deepEqual(D.parsePipAudit({}), []);
});

test('新公告必须阻断：基线之外的任意 advisory id 触发 NEW_ADVISORY', () => {
  const base = { reviewBy: FUTURE, advisories: [ledger('npm', 'GHSA-old')] };
  const { violations } = D.evaluate(base, [entry('npm', 'GHSA-old'), entry('npm', 'GHSA-new')], FUTURE);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^NEW_ADVISORY: npm\/GHSA-new/);
  assert.match(violations[0], /修复版本 >=1.2.3/);
});

test('基线腐化：已不再命中的公告必须清账', () => {
  const base = { reviewBy: FUTURE, advisories: [ledger('npm', 'GHSA-gone'), ledger('pip', 'PYSEC-x')] };
  const { violations } = D.evaluate(base, [entry('pip', 'PYSEC-x')], FUTURE);
  assert.deepEqual(violations, ['RESOLVED_STILL_BASELINED: npm/GHSA-gone 已不再命中（多半已升级），请 --update 清账']);
});

test('挂账 accountability：decision 非法 / note 空 / reviewBy 缺失或过期都要拦', () => {
  const bad = {
    reviewBy: FUTURE,
    advisories: [
      ledger('npm', 'GHSA-1', 'wontfix', ''),
      Object.assign(entry('npm', 'GHSA-2'), { note: 'x' }),
      ledger('npm', 'GHSA-3', 'accepted-risk', '   '),
    ],
  };
  const found = [entry('npm', 'GHSA-1'), entry('npm', 'GHSA-2'), entry('npm', 'GHSA-3')];
  const { violations } = D.evaluate(bad, found, FUTURE);
  assert.equal(violations.filter((v) => v.startsWith('BASELINE_META_INVALID')).length, 4,
    'decision 非法 ×1 + decision 缺失 ×1 + note 空 ×2 = 4');
  const noDate = D.evaluate({ advisories: [] }, [], FUTURE);
  assert.ok(noDate.violations.some((v) => /reviewBy/.test(v)));
  const expired = D.evaluate({ reviewBy: '2020-01-01', advisories: [] }, [], FUTURE);
  assert.match(expired.violations[0], /^REVIEW_DEADLINE_PASSED/);
});

test('基线与现实一致且结论完整 → 零违规（门禁主断言）', () => {
  const items = [ledger('npm', 'GHSA-1'), ledger('pip', 'PYSEC-1', 'no-fix-available', '上游明确不修')];
  const found = [entry('npm', 'GHSA-1'), entry('pip', 'PYSEC-1', { module: 'ecdsa', severity: 'unknown', patched: '' })];
  const { violations } = D.evaluate({ reviewBy: FUTURE, advisories: items }, found, FUTURE);
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('--update 产物：新增条目一律 decision=TODO（逼人工补结论），且可复现', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'depaudit-'));
  try {
    const p = path.join(dir, 'bl.json');
    const old = { reviewBy: FUTURE, advisories: [Object.assign(ledger('npm', 'GHSA-1'), { note: '保留原结论' })] };
    const found = [entry('npm', 'GHSA-1'), entry('npm', 'GHSA-2'), entry('pip', 'PYSEC-3')];
    const first = D.writeBaseline(found, old, p);
    const text1 = fs.readFileSync(p, 'utf8');
    D.writeBaseline(found.slice().reverse(), old, p);
    assert.equal(fs.readFileSync(p, 'utf8'), text1, '写入顺序不得影响产物（否则 diff 噪声）');
    assert.deepEqual(first.advisories.map((a) => a.source + '/' + a.id), ['npm/GHSA-1', 'npm/GHSA-2', 'pip/PYSEC-3']);
    assert.equal(first.advisories[0].note, '保留原结论', '已有条目的结论必须保留');
    assert.equal(first.advisories[1].decision, 'TODO');
    assert.equal(first.reviewBy, FUTURE);
    // 新条目的 TODO 一定会被 META_INVALID 拦下 —— 这就是「不允许无结论挂账」
    const { violations } = D.evaluate(first, found, FUTURE);
    assert.equal(violations.filter((v) => v.startsWith('BASELINE_META_INVALID')).length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('仓库现状：入库基线与判定口径自洽（真实扫描结论已登记）', () => {
  const base = D.readBaseline();
  assert.ok(base, 'dep-audit-baseline.json 必须入库');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(base.reviewBy), 'reviewBy 必须是日期');
  const ids = base.advisories.map((a) => a.source + '/' + a.id);
  assert.equal(new Set(ids).size, ids.length, '基线不得有重复条目');
  assert.ok(ids.length > 0, '本次实跑扫描已确认存在已知漏洞，基线不应当空');
  for (const a of base.advisories) {
    assert.ok(D.VALID_DECISIONS.includes(a.decision), '条目结论非法: ' + a.id + '=' + a.decision);
    assert.ok(String(a.note || '').trim().length > 0, '条目缺 note: ' + a.id);
  }
  // 幂等自检：用基线自身当扫描结果跑一遍，除日期外不应产生任何违规
  const asFound = base.advisories.map((a) => entry(a.source, a.id, a));
  const { violations } = D.evaluate(base, asFound, '2000-01-01');
  assert.deepEqual(violations.filter((v) => !/REVIEW_DEADLINE_PASSED/.test(v)), [], violations.join('\n'));
});

test('registry 口径：audit 必须走官方源（npmmirror 无 audit 端点）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'check-dep-audit.js'), 'utf8');
  assert.equal(D.DEFAULT_REGISTRY, 'https://registry.npmjs.org');
  assert.ok(src.includes("'--registry=' + registry"), 'audit 调用必须显式带 registry');
  assert.ok(src.includes("process.env.NPM_AUDIT_REGISTRY || DEFAULT_REGISTRY"));
});

function npmJsonOf (ids) {
  const advisories = {};
  ids.forEach((id, n) => {
    advisories[n + 1] = { github_advisory_id: id, module_name: 'm-' + id, severity: 'high', patched_versions: '>=9.9.9', findings: [{ version: '1.0.0', paths: ['apps__desktop>x>m-' + id] }] };
  });
  return { advisories };
}

function writeTempBaseline (name, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name + '-'));
  const file = path.join(dir, 'dep-audit-baseline.json');
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return { dir, file };
}

test('pip 扫描器缺失时，npm 域的新公告仍必须判红（不得整体短路 return 0）', () => {
  const { dir, file } = writeTempBaseline('dep-npm-only', {
    reviewBy: FUTURE,
    advisories: [ledger('npm', 'GHSA-known')],
  });
  try {
    const out = [];
    const code = D.runCheck({
      baselinePath: file,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: true, json: npmJsonOf(['GHSA-known', 'GHSA-brand-new']) }),
        pip: () => ({ ok: false, error: 'pip-audit 不存在' }),
        'npm-opscenter': () => ({ ok: true, json: { vulnerabilities: {} } }),
      },
    });
    assert.equal(code, 1);
    assert.ok(out.some((l) => l.includes('NEW_ADVISORY: npm/GHSA-brand-new')),
      'npm 域的新公告必须被报出，实际输出：\n' + out.join('\n'));
    assert.ok(out.some((l) => l.includes('SCANNER_UNAVAILABLE')), '缺失扫描器仍要出声');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})

test('缺失域的挂账条目不得被判成「已不再命中」（防假红）', () => {
  const { dir, file } = writeTempBaseline('dep-pip-skip', {
    reviewBy: FUTURE,
    advisories: [ledger('npm', 'GHSA-known'), ledger('pip', 'PYSEC-keep')],
  });
  try {
    const out = [];
    const code = D.runCheck({
      baselinePath: file,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: true, json: npmJsonOf(['GHSA-known']) }),
        pip: () => ({ ok: false, error: 'pip-audit 不存在' }),
        'npm-opscenter': () => ({ ok: true, json: { vulnerabilities: {} } }),
      },
    });
    assert.equal(code, 0, '实际输出：\n' + out.join('\n'));
    assert.ok(!out.some((l) => l.includes('RESOLVED_STILL_BASELINED: pip/')),
      '未扫描的域不得被判成基线腐化');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})

test('全部扫描域都不可用 ⇒ 本轮无判据，按失败处理', () => {
  const { dir, file } = writeTempBaseline('dep-none', {
    reviewBy: FUTURE,
    advisories: [ledger('npm', 'GHSA-known')],
  });
  try {
    const out = [];
    const code = D.runCheck({
      baselinePath: file,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: false, error: 'audit endpoint 不存在' }),
        pip: () => ({ ok: false, error: 'pip-audit 不存在' }),
        'npm-opscenter': () => ({ ok: false, error: 'npm audit 端点不可达' }),
      },
    });
    assert.equal(code, 1);
    assert.ok(out.some((l) => l.includes('无判据')), '必须出声说明是"没有判据"而不是"没有漏洞"');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})

test('--update 在任一扫描器缺失时拒绝写基线，且基线字节不变', () => {
  const { dir, file } = writeTempBaseline('dep-update-guard', {
    reviewBy: FUTURE,
    advisories: [ledger('npm', 'GHSA-known'), ledger('pip', 'PYSEC-keep')],
  });
  try {
    const pristine = fs.readFileSync(file);
    const out = [];
    const code = D.runCheck({
      baselinePath: file,
      isUpdate: true,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: true, json: npmJsonOf(['GHSA-known']) }),
        pip: () => ({ ok: false, error: 'pip-audit 不存在' }),
      },
    });
    assert.equal(code, 1);
    assert.ok(Buffer.compare(pristine, fs.readFileSync(file)) === 0, 'writeBaseline 会把未扫描域抹掉，必须拒写');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
})

// ── ops-center 扫描域（①遗留收口）+「挂账必须可闭合」判据（③遗留收口）──

test('npm audit v2 形状解析：按公告逐条展开，GHSA 从 url 取，patched 由 range 上界反推', () => {
  const rep = {
    vulnerabilities: {
      undici: {
        severity: 'high', isDirect: false, path: 'node_modules/undici', effects: ['vitest'], via: [
          { source: 1, url: 'https://github.com/advisories/GHSA-rfgv-xxqx-mfg5', severity: 'high', range: '>=7.0.0 <7.29.1', title: 'A' },
          { source: 2, url: 'https://github.com/advisories/GHSA-w293-vg96-wgc3', severity: 'high', range: '>=7.24.1 <7.29.1', title: 'B' },
          '@vitest/mocker',
        ],
      },
      'no-fix-pkg': { severity: 'moderate', via: [{ source: 3, url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'moderate', range: '>=1.0.0', title: 'C' }] },
    },
    metadata: { vulnerabilities: { total: 3 } },
  }
  const out = D.parseNpmAuditV2(rep, 'npm-opscenter')
  assert.equal(out.length, 3, '3 条公告；字符串型 via 项是"指向别的包"，不得算公告')
  assert.deepEqual(out.map((e) => e.id).sort(), ['GHSA-AAAA-BBBB-CCCC', 'GHSA-RFGV-XXQX-MFG5', 'GHSA-W293-VG96-WGC3'])
  const a = out.find((e) => e.id === 'GHSA-RFGV-XXQX-MFG5')
  assert.equal(a.source, 'npm-opscenter', 'source 必须是独立域名，不能借用 pnpm 的 npm 键')
  assert.equal(a.patched, '>=7.29.1', 'range 的上界必须反推成 >=X，否则判据 4 无从比较')
  assert.deepEqual(a.roots, ['undici', 'vitest'])
  assert.equal(out.find((e) => e.id === 'GHSA-AAAA-BBBB-CCCC').patched, '', 'range 没有上界 = 无修复版本 ⇒ 必须是空串')
  for (const e of out) assert.ok(e.module && e.severity, '每条都得可归因')
  assert.deepEqual(D.parseNpmAuditV2({}, 'npm-opscenter'), [], '空报告必须是空数组，不是抛错')
})

test('<0.0.0 归一化：pnpm 的"无修复版本"写法不得被当成可升级目标', () => {
  assert.equal(D.normalizePatched('<0.0.0'), '')
  assert.equal(D.normalizePatched(''), '')
  assert.equal(D.normalizePatched(null), '')
  assert.equal(D.normalizePatched('>=1.20.0'), '>=1.20.0')
  const rep = { advisories: { 1: { github_advisory_id: 'GHSA-UNFIXED', module_name: 'x', severity: 'low', patched_versions: '<0.0.0', findings: [{ paths: ['a>x'] }] } } }
  assert.equal(D.parseNpmAudit(rep)[0].patched, '', 'parseNpmAudit 出口也必须归一')
})

test('域清单与默认 runner 一一对应（登记了域却没接线＝装饰性门禁）', () => {
  assert.ok(D.DOMAINS.includes('npm-opscenter'), 'DOMAINS 必须含 ops-center 域')
  assert.equal(D.OPS_FRONTEND_REL, 'ops-center/frontend')
  const runners = D.createDefaultRunners('https://registry.npmjs.org')
  assert.deepEqual(Object.keys(runners).sort(), [...D.DOMAINS].sort(), 'runner 集与域集必须相等：多一个少一个都算漂移')
  for (const src of D.DOMAINS) assert.equal(typeof runners[src], 'function', '域 ' + src + ' 没有 runner')
  assert.ok(fs.readFileSync(path.join(__dirname, 'check-dep-audit.js'), 'utf8').includes('--omit=dev'),
    'ops-center 域必须与 pnpm 侧的 --prod 同语义（--omit=dev）')
})

test('ops-center 域的新公告必须进判定（证明它被扫到，而不只是被枚举）', () => {
  const { dir, file } = writeTempBaseline('dep-ops-new', { reviewBy: FUTURE, advisories: [] })
  try {
    const out = []
    const code = D.runCheck({
      baselinePath: file,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: true, json: { advisories: {} } }),
        'npm-opscenter': () => ({ ok: true, json: { vulnerabilities: {
          gotrue: { severity: 'high', via: [{ source: 9, url: 'https://github.com/advisories/GHSA-ZZZZ-ZZZZ-ZZZZ', severity: 'high', range: '>=1.0.0 <2.0.0' }] },
        } } }),
        pip: () => ({ ok: true, json: { dependencies: [] } }),
      },
    })
    assert.equal(code, 1, 'ops-center 域的新公告必须让门禁红')
    assert.ok(out.some((l) => l.includes('NEW_ADVISORY: npm-opscenter/GHSA-ZZZZ-ZZZZ-ZZZZ')), out.join('\n').slice(0, 400))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('域存在但 runner 缺失 ⇒ 必须点名，不得静默当成"该域扫过且干净"', () => {
  const { dir, file } = writeTempBaseline('dep-ops-norunner', {
    reviewBy: FUTURE,
    advisories: [ledger('npm', 'GHSA-known')],
  })
  try {
    const out = []
    const code = D.runCheck({
      baselinePath: file,
      log: (...a) => out.push(a.join(' ')),
      error: (...a) => out.push(a.join(' ')),
      runners: {
        npm: () => ({ ok: true, json: npmJsonOf(['GHSA-known']) }),
        pip: () => ({ ok: true, json: { dependencies: [] } }),
      },
    })
    const txt = out.join('\n')
    assert.ok(txt.includes('DOMAIN_NOT_WIRED'), '接线断了必须给硬失败码，而不是被 SCANNER_UNAVAILABLE 吸收：\n' + txt.slice(0, 400));
    assert.ok(!txt.includes('SCANNER_UNAVAILABLE'), '接线断了是代码事实，不得伪装成扫描器抖动（两类出口必须可区分）');
    assert.ok(txt.includes('DOMAIN_NOT_WIRED'), '缺 runner 必须给硬失败码，而不只是 SCANNER_UNAVAILABLE 告警：\n' + txt.slice(0, 400));
    assert.equal(code, 1, '域在清单里却没接线 = 覆盖面窄于声明 ⇒ fail closed（这不同于扫描器抖动）');
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('upgrade-tracked 的账必须能闭合：缺目标版本 / 目标低于修复下界 / 形状不可解析 一律拦', () => {
  const mk = (over) => Object.assign({ source: 'npm', id: 'GHSA-X', module: 'm', patched: '>=4.3.2', decision: 'upgrade-tracked', note: 'n' }, over)
  assert.ok(String(D.checkTargetEscapes(mk({ targetVersion: '4.3.1' }))).includes('低于修复下界'), '升到 4.3.1 仍然命中公告')
  assert.equal(D.checkTargetEscapes(mk({ targetVersion: '4.3.2' })), null, '恰好落在修复版 = 通过')
  assert.equal(D.checkTargetEscapes(mk({ targetVersion: '5.0.0' })), null, '高于下界 = 通过')
  assert.ok(String(D.checkTargetEscapes(mk({}))).includes('缺 targetVersion'))
  assert.ok(String(D.checkTargetEscapes(mk({ targetVersion: 'latest' }))).includes('x.y.z 字面量'), '区间/通配不算承诺')
  assert.ok(String(D.checkTargetEscapes(mk({ targetVersion: '4.3.2', patched: '' }))).includes('patched 为空'), '无修复版本却挂 upgrade-tracked = 自相矛盾')
  assert.ok(String(D.checkTargetEscapes(mk({ targetVersion: '4.3.2', patched: '4.x' }))).includes('解析不出'), '解析不了的形状一律 fail closed')
})

test('判定 4 必须接进 evaluate，而不是只导出一个没人调用的纯函数', () => {
  const found = [entry('npm', 'GHSA-A', { patched: '>=1.5.0' })]
  const bad = { reviewBy: FUTURE, advisories: [Object.assign({}, found[0], { decision: 'upgrade-tracked', note: 'n', targetVersion: '1.4.0' })] }
  const r1 = D.evaluate(bad, found, '2026-10-05', ['npm'])
  assert.ok(r1.violations.some((v) => v.startsWith('DECISION_CONTRADICTS_PATCHED:')), JSON.stringify(r1.violations))
  const good = { reviewBy: FUTURE, advisories: [Object.assign({}, found[0], { decision: 'upgrade-tracked', note: 'n', targetVersion: '1.5.0' })] }
  assert.deepEqual(D.evaluate(good, found, '2026-01-01', ['npm']).violations, [])
  const noFix = { reviewBy: FUTURE, advisories: [Object.assign({}, found[0], { patched: '', decision: 'no-fix-available', note: 'n' })] }
  assert.deepEqual(D.evaluate(noFix, [Object.assign({}, found[0], { patched: '' })], '2026-01-01', ['npm']).violations, [],
    'no-fix-available 允许 patched 为空 —— 判据只约束"待升级"这一类')
})

test('入库基线自洽：每条 upgrade-tracked 都带可闭合的 targetVersion（防迁移后再次腐化）', () => {
  const b = JSON.parse(fs.readFileSync(path.join(__dirname, 'dep-audit-baseline.json'), 'utf8'))
  const ut = b.advisories.filter((e) => e.decision === 'upgrade-tracked')
  assert.ok(ut.length >= 20, 'upgrade-tracked 不得是空遍历：' + ut.length)
  const bad = ut.map((e) => D.checkTargetEscapes(e)).filter(Boolean)
  assert.deepEqual(bad, [], '存在闭不了环的挂账：\n' + bad.join('\n'))
  assert.ok(b.advisories.some((e) => e.decision === 'no-fix-available'), '至少要有一条"确无修复版本"的对照，否则上面的边界没被测到')
  assert.ok(!b.advisories.some((e) => e.decision !== 'upgrade-tracked' && e.targetVersion), '非 upgrade-tracked 的条目不该带目标版本承诺')
})
