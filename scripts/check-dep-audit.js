#!/usr/bin/env node
/**
 * check-dep-audit.js — 依赖漏洞审计基线棘轮（审计 P2·依赖锁定 / [v2] 未覆盖维度补跑）
 *
 * 为什么要有这个门禁：审计报告 v2 明确指出「本轮未运行 npm audit / osv-scanner /
 * pip-audit，已知 CVE 结论缺失」。缺结论本身就是风险 —— 所以这里把两个扫描器接成
 * 可复现的常驻控制：
 *   - npm 侧：`pnpm audit --prod --json`（必须显式走官方 registry，
 *     npmmirror 镜像没有 audit 端点，会报 ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS）
 *   - ops-center 侧：`npm audit --omit=dev --json`，cwd 落在 ops-center/frontend
 *     （该包不在 pnpm workspace 内、自带 package-lock.json ⇒ 与 pnpm 的 --prod 同语义取 --omit=dev）
 *   - python 侧：`pip-audit -r ops-center/backend/requirements.txt --format json`
 *
 * 判定（四条，全部按 advisory id 逐条比对，不做「数量阈值」这种可被抵消的口径）：
 *   1. NEW_ADVISORY        —— 出现基线之外的新公告 → 阻断（要么升级，要么登记并给结论）
 *   2. RESOLVED_STILL_BASELINED —— 基线里的公告已不再命中 → 阻断（清账，防基线腐化）
 *   3. BASELINE_META_INVALID —— 条目缺 decision / decision 非法 / reviewBy 已过期 → 阻断
 *      （挂账必须写清「为什么不马上修」和「什么时候回看」，不允许无限期挂账）
 *   4. DECISION_CONTRADICTS_PATCHED —— decision=upgrade-tracked 却给不出「能逃出漏洞区间」的
 *      targetVersion → 阻断。动因是 axios 那轮实测：12 条公告被登记成 `upgrade-tracked` 挂账，
 *      而修复版本 1.20.0 早在 2026-08-26 就发布了 —— 「挂账」与「可修」之间没有任何东西在对账。
 *
 * 扫描器本身跑不起来（离线 / 端点不可达）时**不判失败**，改为 SCANNER_UNAVAILABLE 告警：
 * 让 PR 因网络抖动变红会让门禁被人为关掉，反而更危险。周计划任务是本门禁的权威来源。
 *
 * 用法：
 *   node scripts/check-dep-audit.js               # 检查（CI）
 *   node scripts/check-dep-audit.js --update      # 扫描并把新公告并入基线
 *   node scripts/check-dep-audit.js --json        # JSON 输出
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(__dirname, 'dep-audit-baseline.json');
const PIP_REQUIREMENTS = 'ops-center/backend/requirements.txt';
// ops-center/frontend 不在 pnpm workspace 里（pnpm-workspace.yaml 只列 apps/* 与 packages/*），
// 它自带 package-lock.json 由 npm 管理。上一轮 axios 收口时它是被点名的「遗留」：
// 既不在本门禁的扫描域内、也没有任何 workflow 装它，却以"看起来受门禁保护"的形态存在。
// 本域就是把那句话说成真判据。
const OPS_FRONTEND_REL = 'ops-center/frontend';
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const VALID_DECISIONS = ['upgrade-tracked', 'accepted-risk', 'not-exploitable', 'no-fix-available'];
// 扫描域清单（顺序即输出顺序）。'npm-opscenter' 是独立 source 名，与 pnpm 的 'npm' 不共用基线键 ——
// 否则同一个 GHSA 在两个域各命中一次会互相冒充"已登记"，且 --update 时后写的会把先写的抹掉。
const DOMAINS = ['npm', 'npm-opscenter', 'pip'];

function shellRun (cmd, args, opts = {}) {
  try {
    const res = spawnSync(cmd, args, {
      cwd: opts.cwd || ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
    if (res.error) return { ok: false, error: String(res.error.message || res.error) };
    const out = String(res.stdout || '');
    const start = out.indexOf('{');
    if (start < 0) {
      return { ok: false, error: '扫描器无 JSON 输出：' + String(res.stderr || '').slice(0, 300) };
    }
    try {
      return { ok: true, json: JSON.parse(out.slice(start)) };
    } catch (e) {
      return { ok: false, error: 'JSON 解析失败: ' + e.message };
    }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** 默认扫描器：真实调 pnpm / npm / pip-audit（用例注入假实现，避免依赖网络）。 */
function createDefaultRunners (registry) {
  return {
    npm: () => shellRun('pnpm', ['audit', '--prod', '--json', '--registry=' + registry]),
    // ops-center/frontend 不在 pnpm workspace 内（pnpm-workspace.yaml 只列 apps/* 与 packages/*），
    // 它自带 package-lock.json 由 npm 管理 ⇒ 上一轮 axios 的「遗留」原文：它既不在本门禁的两个扫描域里，
    // 也没有任何 workflow 装它，于是以「看起来受门禁保护」的形态存在。这里把它真的扫进来。
    // --omit=dev 与 pnpm 侧的 --prod 同语义（本机实测：--omit=dev ⇒ 0 条；全量 ⇒ 3 包 / 12 公告，
    // 全部落在 vitest→@vitest/mocker→undici 这条 dev 链上）。
    'npm-opscenter': () => shellRun(
      'npm', ['audit', '--omit=dev', '--json', '--registry=' + registry],
      { cwd: path.join(ROOT, OPS_FRONTEND_REL) },
    ),
    pip: () => shellRun('pip-audit', ['-r', PIP_REQUIREMENTS, '--format', 'json', '--progress-spinner', 'off']),
  };
}

/**
 * npm audit v2 JSON → 归一化条目（形状与 pnpm 的 `advisories` 完全不同，不能复用 parseNpmAudit）。
 * 顶层 `vulnerabilities` 按**包名**聚合，`via[]` 里每一项才是一条公告；GHSA id 只出现在 `via[].url`。
 * `patched` 从 range 的上界反推：`>=7.0.0 <7.29.1` ⇒ `>=7.29.1`；推不出（无 `<` 上界）留空，
 * 语义就是「没有修复版本」—— 与 parseNpmAudit 的 `<0.0.0` 归一化口径对齐。
 */
function parseNpmAuditV2 (report, source) {
  const vulns = (report && report.vulnerabilities) || {};
  const out = new Map();
  for (const [name, v] of Object.entries(vulns)) {
    const effects = [name].concat(v.effects || []);
    for (const via of v.via || []) {
      if (typeof via === 'string') continue; // 字符串项 = 指向另一个受影响包，不是公告
      const id = ghsaFromUrl(via.url) || ('npm-' + via.source);
      const patched = patchedFromRange(via.range);
      const roots = [...new Set(effects.map((e) => String(e).replace(/^node_modules\//, '').split('>').join('>')))].sort();
      const prev = out.get(id);
      out.set(id, {
        source,
        id,
        module: prev && prev.module !== name ? prev.module + ',' + name : name,
        severity: via.severity || v.severity || 'unknown',
        patched: prev && prev.patched && prev.patched !== patched
          ? [...new Set([prev.patched, patched].filter(Boolean))].join(', ') : patched,
        roots: prev ? [...new Set(prev.roots.concat(roots))].sort() : roots,
      });
    }
  }
  return [...out.values()];
}

/** ">=7.0.0 <7.29.1" -> ">=7.29.1"；无上界 / 空串 -> ""（= 无修复版本）。 */
function patchedFromRange (range) {
  const m = /<\s*(\d+\.\d+\.\d+)/.exec(String(range || ''));
  return m ? '>=' + m[1] : '';
}

/** 从公告 URL 里取 GHSA id；取不到返回 null（调用方回退到 npm advisory 数字 id）。 */
function ghsaFromUrl (url) {
  const m = /GHSA-[a-z0-9-]+/i.exec(String(url || ''));
  return m ? m[0].toUpperCase() : null;
}

/** pnpm/npm audit JSON → 归一化条目。按 GHSA id 去重（同一公告可能命中多个 workspace）。 */
function parseNpmAudit (report) {
  const advisories = (report && report.advisories) || {};
  const out = new Map();
  for (const raw of Object.values(advisories)) {
    const id = raw.github_advisory_id || ('npm-' + raw.id);
    const findings = raw.findings || [];
    const roots = [...new Set(findings.flatMap((f) => (f.paths || []).map((p) => String(p).split('>')[0])))].sort();
    const prev = out.get(id);
    // pnpm 对「无修复版本」的公告写 `<0.0.0`；归一成空串，否则它会被下面的自洽判据当成"有修复版可升"。
    const patched = normalizePatched(raw.patched_versions);
    const entry = {
      source: 'npm',
      id,
      module: raw.module_name || 'unknown',
      severity: raw.severity || 'unknown',
      patched,
      roots: prev ? [...new Set(prev.roots.concat(roots))].sort() : roots,
    };
    out.set(id, entry);
  }
  return [...out.values()];
}

/** `<0.0.0` / 空 / null 一律归一为空串 —— 空串在门禁里是「没有修复版本」的**唯一**表示法。 */
function normalizePatched (p) {
  const s = String(p || '').trim();
  if (!s || s === '<0.0.0') return '';
  return s;
}

/** pip-audit JSON → 归一化条目（pip-audit 不给严重度，统一 unknown，由人工在基线里补注）。 */
function parsePipAudit (report) {
  const deps = (report && report.dependencies) || [];
  const out = new Map();
  for (const dep of deps) {
    for (const vuln of dep.vulns || []) {
      const id = vuln.id || vuln.name;
      const fixes = (vuln.fix_versions || []).join(', ');
      if (out.has(id)) {
        const prev = out.get(id);
        if (!prev.module.includes(dep.name)) prev.module += ',' + dep.name;
        // 同一公告在不同包里的修复版本要合并展示，否则「无修复」会盖掉「可升级到 x.y」
        if (fixes && !prev.patched.includes(fixes)) {
          prev.patched = prev.patched ? prev.patched + ', ' + fixes : fixes;
        }
        continue;
      }
      out.set(id, {
        source: 'pip',
        id,
        module: dep.name || 'unknown',
        severity: 'unknown',
        patched: fixes,
        roots: ['ops-center/backend'],
      });
    }
  }
  return [...out.values()];
}

function readBaseline (p) {
  const file = p || BASELINE_PATH;
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sortEntries (entries) {
  return entries.slice().sort((a, b) => (a.source + a.id).localeCompare(b.source + b.id));
}

/** 基线落盘：新增条目只带 TODO 决策（必须人工补结论，否则 META_INVALID 立刻拦下）。 */
function writeBaseline (found, old, p) {
  const file = p || BASELINE_PATH;
  const prevList = (old && old.advisories) || [];
  const prev = new Map(prevList.map((e) => [e.source + '/' + e.id, e]));
  const advisories = sortEntries(found).map((e) => {
    const key = e.source + '/' + e.id;
    const before = prev.get(key);
    if (before) return Object.assign({}, before, { severity: e.severity, patched: e.patched, roots: e.roots });
    return {
      source: e.source, id: e.id, module: e.module, severity: e.severity,
      patched: e.patched, roots: e.roots, decision: 'TODO', note: '待补结论（新公告）',
    };
  });
  const body = {
    '//': '依赖漏洞审计挂账清单（audit-batch-4）。升级/新增依赖后请跑：node scripts/check-dep-audit.js --update 并补齐 decision/note。',
    reviewBy: (old && old.reviewBy) || '',
    advisories,
  };
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return body;
}

/**
 * 核心判定（纯函数，用例注入假扫描结果）。
 * @returns {{violations: string[], scannedCount: number}}
 */
/**
 * 校验 upgrade-tracked 的目标版本真的逃出了 patched 区间。返回 null = 通过，返回字符串 = 违规描述。
 * 口径：**不引第三方 semver**（本仓依赖里没有任何测试可用的 semver 单例可依赖，装它属越界），
 * 只做「>=X 下界」的逐段数值比较 —— 本仓 patched 字段 100% 是这个形状（实测 24/24），
 * 遇到解析不了的形状一律 fail closed 报违规，而不是放行。
 */
function checkTargetEscapes (item) {
  const key = item.source + '/' + item.id;
  // 无修复版本 ⇒ 「升级中」这个说法本身不成立，先判这条，再谈目标版本。
  if (!String(item.patched || '').trim()) {
    return 'DECISION_CONTRADICTS_PATCHED: ' + key + ' 挂的是 upgrade-tracked，但 patched 为空 —— 没有修复版本就不存在「升级中」，应改判 no-fix-available 并在 note 给出取证';
  }
  const tv = String(item.targetVersion || '').trim();
  if (!tv) {
    return 'DECISION_CONTRADICTS_PATCHED: ' + key + ' decision=upgrade-tracked 却缺 targetVersion —— 挂账必须写明"升到哪个版本"，否则这笔账无法复核（修复版本 ' + item.patched + '）';
  }
  const m = />=\s*(\d+)\.(\d+)\.(\d+)/.exec(String(item.patched || ''));
  if (!m) {
    return 'DECISION_CONTRADICTS_PATCHED: ' + key + ' 的 patched=' + JSON.stringify(item.patched) + ' 解析不出可比较的下界（本判据只认 ">=x.y.z"，解析不了即拦）';
  }
  const want = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = /^(\d+)\.(\d+)\.(\d+)$/.exec(tv);
  if (!t) return 'DECISION_CONTRADICTS_PATCHED: ' + key + ' 的 targetVersion=' + JSON.stringify(tv) + ' 必须是 x.y.z 字面量（不许写区间/通配，那等于没承诺）';
  const got = [Number(t[1]), Number(t[2]), Number(t[3])];
  for (let i = 0; i < 3; i++) {
    if (got[i] > want[i]) return null;
    if (got[i] < want[i]) {
      return 'DECISION_CONTRADICTS_PATCHED: ' + key + ' 的目标版本 ' + tv + ' 低于修复下界 ' + m[0].replace('>=', '') + ' —— 升上去仍然命中该公告，这笔账永远闭不了';
    }
  }
  return null; // 逐段相等 = 恰好落在修复版上，通过
}

function evaluate (baseline, found, today, scannedSources) {
  const now = today || new Date().toISOString().slice(0, 10);
  // 只对本轮真的扫过的域判"已不再命中"，否则缺扫描器会被读成基线腐化（假红）。
  const scanned = scannedSources ? new Set(scannedSources) : null;
  const violations = [];
  const list = (baseline && baseline.advisories) || [];
  const ledger = new Map(list.map((e) => [e.source + '/' + e.id, e]));
  const hits = new Map(found.map((e) => [e.source + '/' + e.id, e]));

  for (const e of sortEntries(found)) {
    const key = e.source + '/' + e.id;
    const item = ledger.get(key);
    if (!item) {
      violations.push('NEW_ADVISORY: ' + key + ' (' + e.module + ' ' + e.severity + ', 修复版本 ' + (e.patched || '无') + ', 路径 ' + (e.roots || []).join('|') + ') —— 升级依赖，或在基线登记 decision + note');
      continue;
    }
    if (!item.decision || !VALID_DECISIONS.includes(item.decision)) {
      violations.push('BASELINE_META_INVALID: ' + key + ' 的 decision=' + JSON.stringify(item.decision) + ' 非法（允许 ' + VALID_DECISIONS.join('/') + '）');
    }
    if (!item.note || !String(item.note).trim()) {
      violations.push('BASELINE_META_INVALID: ' + key + ' 缺 note（挂账必须写清为什么不马上修）');
    }
    if (item.decision === 'upgrade-tracked') {
      // 「挂账待升级」是一个可复核的承诺：必须给出逃出漏洞区间的目标版本；
      // 没有修复版本就根本不该挂这个 decision。判据全部在 checkTargetEscapes 里，
      // 这里只调一次 —— 同一条违规的文案不得取决于调用点（用例直接测纯函数时必须拿到同一句话）。
      // 动因（实测）：axios 的 12 条公告曾被登记成 upgrade-tracked 挂账，而修复版 1.20.0 早已发布。
      const bad = checkTargetEscapes(item);
      if (bad) violations.push(bad);
    }
  }

  for (const item of list) {
    if (scanned && !scanned.has(item.source)) continue;
    const key = item.source + '/' + item.id;
    if (!hits.has(key)) {
      violations.push('RESOLVED_STILL_BASELINED: ' + key + ' 已不再命中（多半已升级），请 --update 清账');
    }
  }

  const reviewBy = baseline && baseline.reviewBy;
  if (!reviewBy || !/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) {
    violations.push('BASELINE_META_INVALID: 顶层 reviewBy 必须是 YYYY-MM-DD（当前 ' + JSON.stringify(reviewBy) + '）');
  } else if (reviewBy < now) {
    violations.push('REVIEW_DEADLINE_PASSED: 挂账复核日 ' + reviewBy + ' 已过（今天 ' + now + '），请重新评审并顺延 reviewBy');
  }

  return { violations, scannedCount: found.length, ledgerCount: list.length };
}

/**
 * 门禁主体。runners / 基线路径 / 输出全部可注入，使「某一域扫描器缺失时另一域照常判违规」
 * 这条能被用例真跑覆盖 —— 原先 main() 直接读 process.argv 与真实 pnpm/pip-audit，
 * 短路行为没有测试可见的入口，于是"整体 return 0"的假绿在 9 条单测下躺了一整轮。
 * @returns {number} 退出码
 */
function runCheck (opts = {}) {
  const isUpdate = !!opts.isUpdate;
  const isJson = !!opts.isJson;
  const log = opts.log || ((...a) => console.log(...a));
  const error = opts.error || ((...a) => console.error(...a));
  const registry = opts.registry || process.env.NPM_AUDIT_REGISTRY || DEFAULT_REGISTRY;
  const runners = opts.runners || createDefaultRunners(registry);
  const bp = opts.baselinePath || BASELINE_PATH;

  const results = {};
  const unavailable = [];
  const notWired = [];   // 域在 DOMAINS 里但没有 runner：接线断了，与"扫描器跑不起来"是两类事
  const scannedSources = [];
  for (const source of DOMAINS) {
    const run = runners[source];
    if (typeof run !== 'function') {
      notWired.push(source);
      // 域在 DOMAINS 里但没有 runner = 接线断了；不得当成"这个域扫过且干净"。
      results[source] = [];
      continue;
    }
    const res = run();
    if (!res || !res.ok) {
      unavailable.push(source + '(' + ((res && res.error) || 'unknown').slice(0, 160) + ')');
      results[source] = [];
      continue;
    }
    scannedSources.push(source);
    results[source] = source === 'npm' ? parseNpmAudit(res.json)
      : source === 'pip' ? parsePipAudit(res.json)
        : parseNpmAuditV2(res.json, source);
  }
  const found = DOMAINS.flatMap((s) => results[s] || []);
  // 接线判据先于一切：漏接一个域 = 本轮判据覆盖面窄于声明，不得用"已扫域照常判"放过
  // （SCANNER_UNAVAILABLE 的宽容只针对离线/端点抖动；那是部署事实，这是代码事实）。
  if (notWired.length) {
    error('DOMAIN_NOT_WIRED: 这些域在 DOMAINS 里却没有 runner ⇒ ' + notWired.join(', ') + '；补 createDefaultRunners，或把域从清单里撤掉并写明理由');
    return 1;
  }
  // 两域都没扫成 ⇒ 本轮没有任何判据，不得报通过（否则扫描器配置坏掉会演化成"全绿"）。
  if (!scannedSources.length) {
    error('扫描器全部不可用，本轮无判据 ⇒ 按失败处理：' + unavailable.join(' '));
    return 1;
  }

  // 写基线必须两域齐全：writeBaseline 按 found 原样落盘，缺域会把另一域的挂账静默抹掉。
  if (unavailable.length && isUpdate) {
    error('扫描器不可用，拒绝写基线：' + unavailable.join(' '));
    return 1;
  }
  // 检查路径不得整体短路：原先「任一扫描器不可用 ⇒ return 0」会让本机没有 pip-audit 时
  // npm 侧的新公告连读都没读就判通过（2026-09-28 两条新公告在本地被静默放过）。
  if (unavailable.length) {
    log('::warning::SCANNER_UNAVAILABLE: ' + unavailable.join(' ')
      + ' —— 该域本轮不判（其挂账条目也不判成"已不再命中"），已扫描域照常判违规');
  }

  const base = readBaseline(bp);
  if (isUpdate) {
    const body = writeBaseline(found, base, bp);
    log('基线已写入', bp, '（' + body.advisories.length + ' 条；新增条目 decision=TODO 必须补结论）');
    return 0;
  }
  if (!base) {
    if (unavailable.length) {
      error('扫描器不可用，拒绝生成半份基线：' + unavailable.join(' '));
      return 1;
    }
    log('未找到基线，正在生成：' + bp);
    writeBaseline(found, null, bp);
    log('已生成，请补齐 decision/note 后再次运行以执行门禁。');
    return 0;
  }

  const { violations, scannedCount, ledgerCount } = evaluate(base, found, undefined, scannedSources);
  if (isJson) {
    log(JSON.stringify({ scannedCount, ledgerCount, found: sortEntries(found), violations }, null, 2));
  } else {
    log('=== 依赖漏洞审计门禁 ===');
    log('命中分布: ' + DOMAINS.map((s) => s + '=' + (results[s] || []).length).join(' ') + ' 命中=' + scannedCount + ' 挂账=' + ledgerCount);
    for (const v of violations) log('❌ ' + v);
    if (!violations.length) log('✅ 无新增已知漏洞公告，基线与现实一致且结论完整。');
  }
  return violations.length ? 1 : 0;
}

function main () {
  const args = process.argv.slice(2);
  return runCheck({ isUpdate: args.includes('--update'), isJson: args.includes('--json') });
}

if (require.main === module) process.exitCode = main();

module.exports = {
  evaluate,
  runCheck,
  parseNpmAudit,
  parsePipAudit,
  parseNpmAuditV2,
  patchedFromRange,
  ghsaFromUrl,
  normalizePatched,
  checkTargetEscapes,
  DOMAINS,
  OPS_FRONTEND_REL,
  readBaseline,
  writeBaseline,
  sortEntries,
  createDefaultRunners,
  shellRun,
  VALID_DECISIONS,
  DEFAULT_REGISTRY,
  BASELINE_PATH,
};
