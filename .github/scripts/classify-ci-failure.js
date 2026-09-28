'use strict';

/**
 * CI 失败分类器 —— 给 `ci-failure-handler.yml` 用。
 *
 * 修的是这件事：handler 的「解析 CI 失败原因」步骤原本是个常量
 * （`FAILURE_TYPE=ci-failure` / `AUTO_FIXABLE=true`，从不看真实载荷），去重键又是
 * `ci-failure-<head_sha>`，于是每个失败提交都开一张新单、正文里连"红在哪个作业哪一步"都没有。
 * 2026-09-28 实测：`labels=ci-failure` 的 open 单 ≥200 张（8 天），其中 `Electron CI` 那
 * 58 张的失败步骤全是 #2458 那道已被修掉的 20m 预算墙。
 *
 * 判据一律来自真实载荷（jobs + check-run annotations），**不从步骤名猜退出码**：
 * 实测 `timeout(1)` 掐掉的作业会留下 `Process completed with exit code 124.` 这条 annotation，
 * 而真实测试失败是 `exit code 1` —— Doc Sync Gate 的红同样是 1，所以它只能靠作业/步骤名区分。
 * 两种判据各管一段，不共用。
 *
 * 分类只会**缩窄**噪声：任何不认识的形状都回落到 `ci-failure`（= 改动前的行为），
 * 保证不会因为加了分类器而丢掉一条真实故障。
 */

// 一次事件最多下几份 job 日志（单份实测 5 MB）；超出的作业签名退化成 test=unknown，
// 但退化会写进签名与 evidence，不会被误当成"同一个成因"。
const MAX_LOG_JOBS = 3;

// 汇总型作业：它们红是因为 needs 里上游红，本身不是根因，不得当根因、也不得进签名。
const ROLLUP_JOBS = new Set(['Gate Result']);

// annotation 里的通用 runner 消息（本仓实测形状）。
const EXIT_CODE_RE = /Process completed with exit code (\d+)\./;

// 已有跟踪项的已知形状：只登记实测核对过的那些。
const KNOWN_TRACKERS = [
  {
    type: 'ci-timeout-budget',
    workflowName: 'Electron CI',
    rootJob: 'electron-tests',
    rootStep: 'Unit tests (Vitest, non-Electron, single-worker deterministic)',
    issue: 2458,
  },
];

const DOC_SYNC_MARKERS = {
  workflowName: 'Doc Sync Gate',
  rootJob: '文档同步检查',
  rootStep: '检查文档同步（硬门禁）',
};

// 环境装配类动作：失败发生在"装/建/取/收尾"这一层，不在"跑测试"这一层。
// **必须排在 looksLikeTest 之前判**：GUI Tests 的
// `Install Python backend runtime and test dependencies`（真实 run 36401422504 → 生产单 #2568）
// 步骤名里带 "test"、作业名 `gui-test` 里也带 "test"，只看名字会把一次 pip 失败报成测试回归。
const SETUP_STEP_RE = /^(install|setup|set up|restore|build|checkout|cache|download|prepare|configure|post)\b/i;

function firstFailedStep(job) {
  const steps = (job && job.steps) || [];
  const failed = steps.filter(s => s && s.conclusion === 'failure');
  return failed.length ? failed[0].name : null;
}

/** 选根因作业：先排除汇总作业，按名字排序取第一个（API 顺序会变，签名不能跟着漂）。
 *  全都排完为空时（真实失败作业已被重跑冲掉，只剩 rollup 红），退回按名字排序的第一个作业 ——
 *  报出 rollup 也比输出 `null / null` 的空标题有用，且标题仍可稳定去重。 */
function pickRootJob(failedJobs) {
  const all = (failedJobs || []).filter(j => j && j.name)
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const candidates = all.filter(j => !ROLLUP_JOBS.has(j.name));
  return candidates.length ? candidates[0] : (all[0] || null);
}

function exitCodeFor(annotations, jobName) {
  for (const entry of annotations || []) {
    if (!entry || entry.jobName !== jobName) continue;
    for (const a of entry.list || []) {
      const m = EXIT_CODE_RE.exec((a && a.message) || '');
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/**
 * 从真实 vitest 日志里取第一条失败用例。
 * 为什么需要它：`QG Coverage / Gate 5` 这一步跑的是**全量**测试，签名只到「作业+步骤」的话，
 * 不同测试的失败会被并进同一张单 —— 实测该签名下堆了 342 张单、里面至少三种不同病因
 * （`rpa-view-platforms` 选择器契约、`visual-workflow-runner` 稳定选择器、
 *  `pixel-diff-baseline-guard` 在 coverage 插桩下超 10s 预算）。那不是降噪，是藏信息。
 * 取不到就返回 null，由调用方在签名里显式标 `test=unknown`，不得凭空造测试名。
 */
function extractFailingTest(logText) {
  const text = String(logText == null ? '' : logText);
  for (const line of text.split(/\r?\n/)) {
    const bare = line.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\S+Z\s?/, '');
    const m = /FAIL\s+(.+?)\s*>\s*(.+)/.exec(bare);
    if (m) return { file: m[1].trim(), name: m[2].trim().replace(/\s+/g, ' ') };
  }
  return null;
}

function excerptForRoot(input, root) {
  if (!root) return null;
  for (const e of input.logExcerpts || []) {
    if (!e) continue;
    if (root.id !== undefined && e.jobId === root.id) return e;
    if (e.jobName && e.jobName === root.name) return e;
  }
  return null;
}

function trackerFor(input) {
  for (const k of KNOWN_TRACKERS) {
    if (k.workflowName === input.workflowName
      && k.rootJob === input.rootJob
      && k.rootStep === input.rootStep) {
      return k.issue;
    }
  }
  return null;
}

function looksLikeTest(rootJob, rootStep) {
  const hay = `${rootJob || ''} ${rootStep || ''}`;
  return /(vitest|jest|pytest|shard|unit test|\btests?\b|\bspec\b|e2e|playwright)/i.test(hay);
}

/**
 * @param {object} input
 * @param {string} input.workflowName
 * @param {Array} input.failedJobs  - [{name, steps:[{name, conclusion}]}]（只含失败作业）
 * @param {Array} input.annotations - [{jobId, jobName, list:[{annotation_level, message}]}]
 * @returns {{type:string, rootJob:string|null, rootStep:string|null, exitCode:number|null,
 *            signature:string, trackedIn:number|null, fileIssue:boolean, evidence:string}}
 */
function classifyFailure(input) {
  const workflowName = input.workflowName || '(unknown workflow)';
  const root = pickRootJob(input.failedJobs);
  const rootJob = root ? root.name : null;
  const rootStep = root ? firstFailedStep(root) : null;
  const exitCode = rootJob === null ? null : exitCodeFor(input.annotations, rootJob);

  const exitText = exitCode === null ? '无 exit-code annotation' : `exit code ${exitCode}`;
  let evidence = `${workflowName} / ${rootJob || '(无失败作业)'} / ${rootStep || '(无失败步骤)'} / ${exitText}`;

  let type;
  if (exitCode === 124) {
    // 124 是 timeout(1) 的约定码，且 #2525 之后该步骤会自证 elapsed= —— 不再需要人去反推
    type = 'ci-timeout-budget';
  } else if (workflowName === DOC_SYNC_MARKERS.workflowName
    || rootJob === DOC_SYNC_MARKERS.rootJob
    || rootStep === DOC_SYNC_MARKERS.rootStep) {
    type = 'doc-sync-drift';
  } else if (rootJob === null) {
    type = 'ci-failure';
  } else if (SETUP_STEP_RE.test(rootStep || '')) {
    type = 'setup-failure';
  } else if (looksLikeTest(rootJob, rootStep)) {
    type = 'test-failure';
  } else {
    type = 'ci-failure';
  }

  // 归属跟踪项只在**证据支撑的分类**上生效：读不到 exit code 时宁可照常开单，
  // 也不能把该步骤里可能的真实测试回归藏进基础设施单（那是用分类器丢信息）。
  const trackedIn = type === 'ci-timeout-budget' ? trackerFor({ workflowName, rootJob, rootStep }) : null;

  // 测试类步骤必须把"具体哪条测试"取进签名：同一步骤下的不同病因不能并成一张单。
  const isTestStep = rootJob !== null && looksLikeTest(rootJob, rootStep);
  const failingTest = isTestStep ? extractFailingTest((excerptForRoot(input, root) || {}).text) : null;
  const testKey = !isTestStep ? null : (failingTest ? `${failingTest.file}::${failingTest.name.slice(0, 60)}` : 'unknown');
  if (isTestStep) {
    evidence += failingTest ? ` / FAIL ${failingTest.file} > ${failingTest.name}` : ' / 测试名未取得（日志无 FAIL 行或日志不可读）';
  }

  // 已经有跟踪项的已知形状不再开单，改由 handler 在跟踪项下追评（保留复发可见性）。
  const fileIssue = trackedIn === null;

  return {
    type,
    workflowName,
    rootJob,
    rootStep,
    exitCode,
    failingTest,
    trackedIn,
    fileIssue,
    evidence,
    // 汇总作业刻意不进签名：同一次回归有没有带动 Gate Result 红，不该产生两个签名
    signature: `${workflowName}::${rootJob || '-'}::${rootStep || '-'}::exit=${exitCode === null ? 'unknown' : exitCode}${testKey ? `::test=${testKey}` : ''}`,
  };
}

/** 去重标题：不含 sha，同因复发命中同一张单。测试类失败必须带上测试文件，
 *  否则一个跑全量的步骤会把所有不同病因并成一张单（实测该签名下堆过 342 张）。 */
function buildDedupTitle(verdict) {
  const t = verdict.failingTest ? ` :: ${verdict.failingTest.file}` : '';
  return `ci-failure[${verdict.type}] ${verdict.workflowName || '-'}: ${verdict.rootJob || '-'} / ${verdict.rootStep || '-'}${t}`
    .slice(0, 255);
}

/**
 * 从 Actions API 组装分类器输入。`runGh` 注入以便单测喂真实形状载荷；生产入口传 gh CLI。
 * 失败作业之外的 check-run 一律不请求（既省配额，也避免把成功作业的 annotation 混进来）。
 */
async function collectEvidence({ repo, runId, workflowName, runGh }) {
  const jobsRaw = runGh(['api', `repos/${repo}/actions/runs/${runId}/jobs?per_page=100`]);
  if (!jobsRaw) throw new Error(`CI-FAILURE-EVIDENCE_UNAVAILABLE jobs run=${runId}`);
  const parsed = JSON.parse(jobsRaw);
  const failed = (parsed.jobs || []).filter(j => j.conclusion === 'failure');

  const failedJobs = failed.map(j => ({
    id: j.id,
    name: j.name,
    conclusion: j.conclusion,
    // 分类器只吃失败步骤；成功步骤带进来会让签名随"后来哪一步成功了"漂移
    steps: (j.steps || []).filter(s => s.conclusion === 'failure')
      .map(s => ({ name: s.name, conclusion: s.conclusion })),
  }));

  const annotations = [];
  for (const job of failed) {
    const m = /\/check-runs\/(\d+)$/.exec(job.check_run_url || '');
    if (!m) continue;
    let annRaw = null;
    try {
      annRaw = runGh(['api', `repos/${repo}/check-runs/${m[1]}/annotations`]);
    } catch (err) {
      // annotation 缺失只会让分类变粗（124 读不到 → 回落 ci-failure），不会丢单；
      // 但必须出声，否则"分类变粗"会变成一件没人知道的事。
      process.stderr.write(`WARN classify-ci-failure: annotations unavailable job=${job.name}: ${err.message}\n`);
      continue;
    }
    if (!annRaw) continue;
    annotations.push({ jobId: job.id, jobName: job.name, list: JSON.parse(annRaw) });
  }

  // 只有"跑测试"的失败作业才值得下日志（单份可达 5MB）：装依赖/构建/文档同步这类
  // 步骤的病因全在步骤名里，取日志既贵又不增加可归因性。
  const logExcerpts = [];
  const testLike = failedJobs.filter(j => (j.steps || []).some(s => looksLikeTest(j.name, s.name)));
  for (const job of testLike.slice(0, MAX_LOG_JOBS)) {
    let log = null;
    try {
      log = runGh(['api', '--allow-escape-sequences', `repos/${repo}/actions/jobs/${job.id}/logs`]);
    } catch (err) {
      process.stderr.write(`WARN classify-ci-failure: log unavailable job=${job.name}: ${err.message}\n`);
      continue;
    }
    if (!log) continue;
    logExcerpts.push({ jobId: job.id, jobName: job.name, text: log });
  }

  return { workflowName, runId, failedJobs, annotations, logExcerpts };
}

function toOutputLines(verdict, extra) {
  const single = v => String(v === null || v === undefined ? '' : v).replace(/[\r\n]+/g, ' ');
  const rows = {
    TYPE: verdict.type,
    SIGNATURE: verdict.signature,
    TITLE: buildDedupTitle(verdict),
    ROOT_JOB: verdict.rootJob,
    ROOT_STEP: verdict.rootStep,
    EXIT_CODE: verdict.exitCode,
    TRACKED_IN: verdict.trackedIn,
    FAILING_TEST: verdict.failingTest ? `${verdict.failingTest.file} > ${verdict.failingTest.name}` : '',
    FILE_ISSUE: verdict.fileIssue ? 'true' : 'false',
    EVIDENCE: verdict.evidence,
  };
  for (const [k, v] of Object.entries(extra || {})) rows[k] = v;
  return Object.entries(rows).map(([k, v]) => `${k}=${single(v)}`).join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : '';
  };
  const repo = get('--repo');
  const runId = get('--run-id');
  const workflowName = get('--workflow');
  const outFile = get('--output');
  if (!repo || !runId || !outFile) {
    process.stderr.write('usage: classify-ci-failure.js --repo <o/r> --run-id <id> --workflow <name> --output <GITHUB_OUTPUT>\n');
    process.exit(2);
  }
  const { execFileSync } = require('node:child_process');
  const fs = require('node:fs');
  const runGh = (a) => execFileSync('gh', a, { maxBuffer: 64 * 1024 * 1024 }).toString();
  collectEvidence({ repo, runId, workflowName, runGh })
    .then((input) => {
      const verdict = classifyFailure(input);
      fs.appendFileSync(outFile, toOutputLines(verdict) + '\n', 'utf8');
      process.stdout.write(`${verdict.type}\t${verdict.evidence}\n`);
      return null;
    })
    .catch((err) => {
      process.stderr.write(`FATAL classify-ci-failure: ${err.message}\n`);
      process.exit(1);
    });
}

module.exports = { classifyFailure, buildDedupTitle, collectEvidence, toOutputLines, extractFailingTest, ROLLUP_JOBS };
