// 回归锁：CI 失败分类器 + 证据采集。
//
// 存在理由：`ci-failure-handler.yml` 的「解析 CI 失败原因」步骤是一个常量
// （`FAILURE_TYPE=ci-failure` / `AUTO_FIXABLE=true`），去重键又是 per-SHA
// （`ci-failure-<40位sha>` in:title），于是每个失败提交都开一张新单、且正文里没有任何
// 失败信息。实测（2026-09-28）：`labels=ci-failure` 的 open 单 **≥200 张**，8 天累积
// （quality-gate 97 / Electron CI 58 / Doc Sync Gate 39 / Build & Release 6），
// 其中 `Electron CI` 那一档的失败步骤全部是 #2458 那个已被修掉的 20m 预算墙。
//
// 夹具来源：`.github/scripts/fixtures/ci-failure-samples.json`，由脚本从**真实** Actions
// API 载荷生成（runs + jobs + check-run annotations），禁止手抄形状。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { classifyFailure, buildDedupTitle, collectEvidence } = require('./classify-ci-failure.js');

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'ci-failure-samples.json'), 'utf8')
);

// 把一条真实样本喂给分类器（handler 在 CI 里就是这么拼的）
function inputFrom(sample, workflowName) {
  return {
    workflowName,
    runId: sample.source.runId,
    headSha: sample.source.headSha,
    failedJobs: sample.failedJobs,
    annotations: sample.annotations,
  };
}

const electronSamples = FIXTURE.samples.filter(s => s.source.workflowFile === 'electron-ci.yml');
const qualitySamples = FIXTURE.samples.filter(s => s.source.workflowFile === 'quality-gate.yml');
const docSamples = FIXTURE.samples.filter(s => s.source.workflowFile === 'doc-gate.yml');
const guiSamples = FIXTURE.samples.filter(s => s.source.workflowFile === 'gui-test.yml');

const hasExit = (sample, code) => sample.annotations.some(a => a.list.some(x => x.message.includes(`exit code ${code}.`)));
// 同一个步骤名（Unit tests…）在真实数据里既有 124 也有 1 —— 这正是"判据必须是 exit code，
// 不能是步骤名"的实证来源，所以两类都要留在夹具里并分开断言。
const budgetSamples = electronSamples.filter(s => hasExit(s, 124));
const assertionSamples = electronSamples.filter(s => !hasExit(s, 124) && hasExit(s, 1));
const shardSamples = qualitySamples.filter(s => s.failedJobs.some(j => /^QG Desktop Shards/.test(j.name)));
const rollupOnlySamples = qualitySamples.filter(s => s.failedJobs.every(j => j.name === 'Gate Result'));

test('夹具必须逐形状齐备（防止将来有人手抄改形或删样本）', () => {
  for (const [label, list, min] of [
    ['Electron CI 预算墙（exit 124）', budgetSamples, 1],
    ['Electron CI 真实断言失败（同步骤 exit 1）', assertionSamples, 1],
    ['quality-gate 根因 + rollup 同时红', shardSamples, 1],
    ['quality-gate 只剩 rollup 红', rollupOnlySamples, 1],
    ['Doc Sync Gate（exit 1）', docSamples, 1],
    ['GUI Tests 环境/安装步骤红', guiSamples, 2],
  ]) {
    assert.ok(list.length >= min, `夹具缺少形状「${label}」：需要 ≥${min} 条，实际 ${list.length} 条`);
  }
});

test('#2458 的预算墙被判成 ci-timeout-budget，而不是无限张 ci-failure', () => {
  for (const sample of budgetSamples) {
    const v = classifyFailure(inputFrom(sample, 'Electron CI'));
    assert.equal(v.type, 'ci-timeout-budget');
    assert.equal(v.exitCode, 124);
    assert.equal(v.rootJob, 'electron-tests');
    assert.equal(v.rootStep, 'Unit tests (Vitest, non-Electron, single-worker deterministic)');
    // 已登记的归属：#2458 才是这件事的跟踪项，不该再随机指派给当次 push 的人
    assert.equal(v.trackedIn, 2458);
    assert.equal(v.fileIssue, false, '预算墙已有跟踪项，不再开单');
    assert.match(v.evidence, /exit code 124/);
  }
});

test('同一个步骤名下的真实断言失败不得被冒充成预算墙（判据是 exit code 不是步骤名）', () => {
  for (const sample of assertionSamples) {
    const v = classifyFailure(inputFrom(sample, 'Electron CI'));
    assert.equal(v.exitCode, 1, '夹具必须确实是 exit 1，否则这条对照不成立');
    assert.notEqual(v.type, 'ci-timeout-budget');
    assert.equal(v.type, 'test-failure');
    assert.equal(v.rootStep, 'Unit tests (Vitest, non-Electron, single-worker deterministic)');
    assert.equal(v.trackedIn, null, '真实测试回归必须照常开单，不得藏进基础设施跟踪项');
    assert.equal(v.fileIssue, true);
  }
});

test('去重键必须跨提交稳定 —— 两条不同 run 的同因失败要落在同一个签名上', () => {
  assert.ok(budgetSamples.length >= 2, '需要两条独立的 124 样本才有意义');
  assert.notEqual(budgetSamples[0].source.runId, budgetSamples[1].source.runId, '夹具得是两次真实 run');
  assert.notEqual(budgetSamples[0].source.headSha, budgetSamples[1].source.headSha, '夹具得是两个不同提交');
  const a = classifyFailure(inputFrom(budgetSamples[0], 'Electron CI'));
  const b = classifyFailure(inputFrom(budgetSamples[1], 'Electron CI'));
  assert.equal(a.signature, b.signature);
  assert.equal(buildDedupTitle(a), buildDedupTitle(b));
  // 标题里**不得**再出现 sha —— 那正是"每个失败提交一张单"的根因
  assert.doesNotMatch(buildDedupTitle(a), /[0-9a-f]{40}/);
});

test('Doc Sync Gate 的红按 job/步骤名分类（它的退出码和真实测试失败同为 1，只能靠名字）', () => {
  const v = classifyFailure(inputFrom(docSamples[0], 'Doc Sync Gate'));
  assert.equal(v.type, 'doc-sync-drift');
  assert.equal(v.exitCode, 1, '夹具必须确实与测试失败同码，否则这条分类依据不成立');
  assert.equal(v.rootJob, '文档同步检查');
  assert.equal(v.rootStep, '检查文档同步（硬门禁）');
  assert.equal(v.fileIssue, true, '漂移仍要有人知道，但只开一张、后续追评');
});

test('环境/安装步骤红不得被步骤名里的 "test" 判成测试失败（生产误判 #2568 的形状）', () => {
  const install = guiSamples.find(s => s.failedJobs[0].steps.some(x => /Install .*test dependencies/.test(x.name)));
  assert.ok(install, '夹具必须含"装依赖"步骤红的真实样本');
  const v = classifyFailure(inputFrom(install, 'GUI Tests'));
  assert.equal(v.type, 'setup-failure', '这是环境装配失败，不是测试回归');
  assert.equal(v.rootJob, 'gui-test');
  assert.match(v.rootStep, /Install Python backend runtime/);
  assert.equal(v.exitCode, 1);
  assert.equal(v.fileIssue, true);

  const build = guiSamples.find(s => s.failedJobs[0].steps.some(x => /^Build /.test(x.name)));
  assert.ok(build, '夹具必须含 Build 步骤红的真实样本');
  assert.equal(classifyFailure(inputFrom(build, 'GUI Tests')).type, 'setup-failure');

  // 负控：setup 规则**不得**把真正的测试失败一起吃掉（同一夹具里的 electron exit-1 样本）
  for (const s of assertionSamples) {
    assert.equal(classifyFailure(inputFrom(s, 'Electron CI')).type, 'test-failure');
  }
  // 也不得吃掉覆盖率卡点这类"名字像检查、实质是质量门禁红"的形状
  const coverageShaped = {
    workflowName: 'quality-gate', runId: 1, headSha: 'a'.repeat(40),
    failedJobs: [{ id: 1, name: 'QG Coverage', steps: [{ name: 'Gate 5 - Test coverage check', conclusion: 'failure' }] }],
    annotations: [{ jobId: 1, jobName: 'QG Coverage', list: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }] }],
  };
  assert.equal(classifyFailure(coverageShaped).type, 'test-failure');
});

test('只剩 rollup 作业红时也要报出作业名，不得输出 null / null 的空标题', () => {
  const sample = rollupOnlySamples[0];
  const v = classifyFailure(inputFrom(sample, 'quality-gate'));
  assert.equal(v.rootJob, 'Gate Result', '有rollup可报时不得把根因留空');
  assert.equal(v.type, 'ci-failure');
  assert.equal(v.fileIssue, true);
  const title = buildDedupTitle(v);
  assert.doesNotMatch(title, /null/, `标题不得含空占位: ${title}`);
  assert.match(title, /Gate Result/, `标题应报出可归因的作业名: ${title}`);
});

test('quality-gate 的根因作业不得选成 Gate Result（它只是 needs 的汇总）', () => {
  for (const sample of shardSamples) {
    const names = sample.failedJobs.map(j => j.name);
    assert.ok(names.includes('Gate Result'), '夹具须包含 rollup 作业才有意义');
    const v = classifyFailure(inputFrom(sample, 'quality-gate'));
    assert.notEqual(v.rootJob, 'Gate Result');
    assert.match(v.rootJob, /^QG Desktop Shards \(\d\/2\)$/);
    assert.equal(v.type, 'test-failure');
    assert.equal(v.fileIssue, true);
    // 汇总作业本身不得进签名，否则同一次回归会因 rollup 与否产生两个签名
    assert.doesNotMatch(v.signature, /Gate Result/);
  }
});

test('未知形状必须回落到今天的行为（分类器只准缩窄噪声，不得吞掉信息）', () => {
  const v = classifyFailure({
    workflowName: 'Some New Workflow',
    runId: 1,
    headSha: 'f'.repeat(40),
    failedJobs: [{ id: 9, name: 'mystery-job', steps: [{ name: 'Do the thing', conclusion: 'failure' }] }],
    annotations: [{ jobId: 9, jobName: 'mystery-job', list: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }] }],
  });
  assert.equal(v.type, 'ci-failure');
  assert.equal(v.trackedIn, null);
  assert.equal(v.fileIssue, true);
  assert.equal(v.rootStep, 'Do the thing');
});

test('没有 annotations 载荷时（API 抽风/权限不足）不得判成超时墙', () => {
  const sample = electronSamples[0];
  const v = classifyFailure({
    workflowName: 'Electron CI',
    runId: sample.source.runId,
    headSha: sample.source.headSha,
    failedJobs: sample.failedJobs,
    annotations: [],
  });
  assert.notEqual(v.type, 'ci-timeout-budget', '124 只能来自 annotation，不得从步骤名猜');
  // 该步骤确实是测试作业 ⇒ 回落成 test-failure 是对的，但绝不允许冒充成超时墙
  assert.equal(v.type, 'test-failure');
  assert.equal(v.exitCode, null);
  assert.equal(v.fileIssue, true);
});

test('证据采集必须打对端点，且只取失败作业（打错端点=静默错分类）', async () => {
  const calls = [];
  const fakeRunGh = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'api' && /actions\/runs\/42\/jobs(\?|$)/.test(args[1])) {
      return JSON.stringify({
        jobs: [
          { id: 1, name: 'electron-tests', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/o/r/check-runs/11', steps: [{ name: 'Unit tests (Vitest, non-Electron, single-worker deterministic)', conclusion: 'failure' }, { name: 'Post Setup', conclusion: 'success' }] },
          { id: 2, name: 'Build Vue frontend', conclusion: 'success', check_run_url: 'https://api.github.com/repos/o/r/check-runs/12', steps: [] },
        ],
      });
    }
    if (args[0] === 'api' && /check-runs\/11\/annotations$/.test(args[1])) {
      return JSON.stringify([{ annotation_level: 'failure', message: 'Process completed with exit code 124.', path: '.github', start_line: 63710 }]);
    }
    throw new Error('unexpected gh call: ' + args.join(' '));
  };
  const input = await collectEvidence({ repo: 'o/r', runId: 42, workflowName: 'Electron CI', runGh: fakeRunGh });
  assert.deepEqual(calls, [
    'api repos/o/r/actions/runs/42/jobs?per_page=100',
    'api repos/o/r/check-runs/11/annotations',
  ], '只允许对失败作业取 annotation：成功作业的 check_run 不该被请求');
  assert.equal(input.workflowName, 'Electron CI', 'workflowName 由 handler 从 workflow_run 事件带上，不再多打一次 API');
  assert.deepEqual(input.failedJobs.map(j => j.name), ['electron-tests']);
  assert.deepEqual(input.failedJobs[0].steps.map(s => s.name), ['Unit tests (Vitest, non-Electron, single-worker deterministic)'], '不得把 success 步骤带进去');
  assert.equal(input.annotations[0].jobName, 'electron-tests');
  // 端到端：采集到的形状直接喂分类器必须落到 ci-timeout-budget
  assert.equal(classifyFailure(input).type, 'ci-timeout-budget');
});

test('采集端单次 API 失败必须原样抛出而不是降级成"无失败作业"', async () => {
  const fake = () => { throw new Error('Server Error (HTTP 502)'); };
  await assert.rejects(
    () => collectEvidence({ repo: 'o/r', runId: 7, workflowName: 'Electron CI', runGh: fake }),
    /HTTP 502|Server Error/,
    '静默降级会让分类器把真失败判成未知形状，等于丢信息'
  );
});

// --- 接线守卫：handler 与分类器之间的字段合同 ---------------------------------------
// 分类器的输出键与 workflow 里 `steps.parse-failure.outputs.X` 是**手工对齐**的两份清单，
// 漏一处的症状是"那个字段静默变空串"（GH011 之类都不会报），所以读源码逐个核对。
const RACE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'ci-failure-attempt-race.json'), 'utf8')
);

// —— #2572 的竞态：handler 读的是"最新 attempt"，重跑成功后就看不到任何失败作业 ——
test('采集要把"没有结论的步骤"带到分类器（否则线索在链路上就丢了）', async () => {
  // 真实形状取自 run 36405013013 attempt 1：作业 failure、Unit tests 被 skipped、后续步骤 conclusion 为 null
  const a1 = RACE.attempts.find(x => x.attempt === 1);
  const et1 = a1.jobs.find(j => j.name === 'electron-tests');
  assert.ok(et1.steps.some(s => s.conclusion === null || s.conclusion === undefined),
    '夹具必须确实含"无结论步骤"，否则这条链路守卫是空的');
  const fake = (a) => {
    if (/jobs(\?|$)/.test(a[1])) return JSON.stringify({ jobs: a1.jobs });
    if (/annotations$/.test(a[1])) return JSON.stringify([{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }]);
    if (/\/logs$/.test(a[1])) return 'nothing\n';
    throw new Error('unexpected call ' + a.join(' '));
  };
  const input = await collectEvidence({ repo: 'o/r', runId: RACE.source.runId, workflowName: 'Electron CI', runAttempt: 1, runGh: fake });
  const steps = input.failedJobs[0].steps;
  // ① success / skipped 一律不带（否则签名会随"后来哪些步骤跑成功了"漂移）
  assert.equal(steps.some(s => s.conclusion === 'success' || s.conclusion === 'skipped'), false, JSON.stringify(steps));
  // ② 无结论的步骤必须留着 —— 它是"作业红但没有 failure 步骤"唯一的现场
  assert.ok(steps.length >= 1, '放宽口径没生效：无结论步骤被丢掉了');
  // ③ 端到端：这条输入必须能让分类器给出诚实标签 + 线索
  const v = classifyFailure({ ...input, workflowName: 'Electron CI' });
  assert.equal(v.rootJob, 'electron-tests');
  assert.equal(v.rootStep, null);
  assert.match(v.evidence, /首个非成功步骤/, `线索应当出现在 evidence 里：${v.evidence}`);
  assert.match(buildDedupTitle(v), /未定位到失败步骤/);
});

test('handler 必须把 run_attempt 传给分类器（否则 #2572 的重跑竞态会复现）', () => {
  const handler = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'ci-failure-handler.yml'), 'utf8');
  assert.match(handler, /--run-attempt /, '调用处必须带 --run-attempt');
  assert.match(handler, /workflow_run\.run_attempt/, '值必须取自事件的 run_attempt，不能自己猜');
});

test('采集必须按 run_attempt 打 attempt 级端点（否则重跑会把失败证据抹掉）', async () => {
  const calls = [];
  const fake = (a) => {
    calls.push(a.join(' '));
    if (/actions\/runs\/77\/attempts\/1\/jobs/.test(a[1])) {
      return JSON.stringify({ jobs: RACE.attempts[0].jobs });
    }
    if (/actions\/runs\/77\/jobs/.test(a[1])) {
      // 这就是 bug 的形状：不带 attempt 的端点返回的是**最新 attempt**（已 success）
      return JSON.stringify({ jobs: RACE.attempts[1].jobs });
    }
    if (/check-runs\/\d+\/annotations$/.test(a[1])) {
      return JSON.stringify([{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }]);
    }
    if (/\/logs$/.test(a[1])) return 'no FAIL line here\n';
    throw new Error('unexpected gh call: ' + a.join(' '));
  };
  const input = await collectEvidence({ repo: 'o/r', runId: 77, workflowName: 'Electron CI', runAttempt: 1, runGh: fake });
  assert.ok(calls.some(c => /attempts\/1\/jobs/.test(c)), `必须打 attempt 级端点，实际调用：\n${calls.join('\n')}`);
  assert.deepEqual(input.failedJobs.map(j => j.name), ['electron-tests'], 'attempt 1 的真实失败作业必须被带出来');
  assert.equal(input.runAttempt, 1, 'attempt 号要随输入带下去，便于 evidence 自证');
});

test('不带 runAttempt 时退回最新 attempt，但必须把"可能不是失败那一次"写进 evidence', async () => {
  const calls = [];
  const fake = (a) => {
    calls.push(a.join(' '));
    if (/actions\/runs\/78\/jobs/.test(a[1])) return JSON.stringify({ jobs: RACE.attempts[1].jobs });
    return JSON.stringify([]);
  };
  const input = await collectEvidence({ repo: 'o/r', runId: 78, workflowName: 'Electron CI', runGh: fake });
  assert.equal(calls.some(c => /attempts\//.test(c)), false, '没给 attempt 就不得凭空猜一个');
  const v = classifyFailure({ ...input, workflowName: 'Electron CI' });
  assert.match(v.evidence, /attempt/, `无 attempt 信息时要留痕，实际：${v.evidence}`);
});

test('夹具本身：同一 run 的 attempt 1 是 failure 且没有 failure 步骤，attempt 2 是 success', () => {
  const a1 = RACE.attempts.find(x => x.attempt === 1);
  const a2 = RACE.attempts.find(x => x.attempt === 2);
  assert.ok(a1 && a2, '夹具必须两个 attempt 齐备');
  const et1 = a1.jobs.find(j => j.name === 'electron-tests');
  const et2 = a2.jobs.find(j => j.name === 'electron-tests');
  assert.equal(et1.conclusion, 'failure');
  assert.equal(et2.conclusion, 'success');
  assert.equal(et1.steps.filter(s => s.conclusion === 'failure').length, 0, '真实形状：作业红但没有 failure 步骤');
  assert.ok(et1.steps.filter(s => s.conclusion !== 'success' && s.conclusion !== 'skipped').length >= 1);
  assert.equal(RACE.source.issueNumber, 2572, '夹具必须绑定它来自的那张真实单');
});

test('作业红而无 failure 步骤时：根因给作业名 + 诚实标签，不得输出 "- / -"', () => {
  const a1 = RACE.attempts.find(x => x.attempt === 1);
  const et1 = a1.jobs.find(j => j.name === 'electron-tests');
  const v = classifyFailure({
    workflowName: 'Electron CI', runId: RACE.source.runId, runAttempt: 1, headSha: 'd'.repeat(40),
    failedJobs: [{ id: et1.id, name: et1.name, conclusion: et1.conclusion, steps: et1.steps.filter(s => s.conclusion !== 'success' && s.conclusion !== 'skipped') }],
    annotations: [{ jobId: et1.id, jobName: et1.name, list: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }] }],
    logExcerpts: [],
  });
  assert.equal(v.rootJob, 'electron-tests', '有失败作业时根因不得为空');
  // 作业名含 "test" 但**没有红步骤**时不得判 test-failure：真实断言失败一定会把一个步骤
  // 标成 failure（夹具 12 条样本逐条核实），没有红步骤 = 作业被整体掐掉，病因未知。
  assert.equal(v.type, 'ci-failure', `拿不到步骤级证据时不得凭作业名定性病因，实际判成 ${v.type}`);
  const title = buildDedupTitle(v);
  assert.doesNotMatch(title, /- \/ -/, `标题不得留空占位：${title}`);
  assert.match(title, /未定位到失败步骤/, title);
  // 提示（不是结论）：首个非成功非 skipped 步骤要出现在 evidence 里，并标明它只是线索
  assert.match(v.evidence, /首个非成功步骤/);
  assert.match(v.evidence, /Electron smoke test/);
});

test('一个失败作业都定位不到时（重跑竞态残留），标题与签名都要说明这一点', () => {
  const v = classifyFailure({
    workflowName: 'Electron CI', runId: 1, runAttempt: 2, headSha: 'e'.repeat(40),
    failedJobs: [], annotations: [], logExcerpts: [],
  });
  assert.equal(v.type, 'ci-failure');
  const title = buildDedupTitle(v);
  assert.doesNotMatch(title, /- \/ -/, title);
  assert.match(title, /未定位到失败作业/, title);
  assert.match(v.signature, /::none::/, v.signature);
  assert.match(v.evidence, /attempt 2/, `evidence 要带上 attempt，便于认出重跑，实际：${v.evidence}`);
  // 无作业时不得写「未定位到失败步骤」——那是"有作业、步骤没定位到"的另一种空，
  // 两种空的原因不同，混写会让下一个读者去找一条并不存在的步骤。
  assert.doesNotMatch(v.evidence, /未定位到失败步骤/, `无作业时的空位措辞不得与"无步骤"混写：${v.evidence}`);
  assert.match(v.evidence, /无作业可定位/, v.evidence);
});

const HANDLER = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'ci-failure-handler.yml'), 'utf8');

test('handler 消费的每个 output 键都必须由分类器投影出来', () => {
  const consumed = new Set(
    [...HANDLER.matchAll(/steps\.parse-failure\.outputs\.([A-Z_][A-Z0-9_]*)/g)].map(m => m[1])
  );
  assert.ok(consumed.size >= 6, `应当至少核对 6 个字段，实际 ${consumed.size} —— 正则可能已经失配`);
  // COMMIT_SHA 等由 parse-failure 步骤自己 echo，其余必须来自 toOutputLines
  const selfEchoed = new Set(['WORKFLOW_NAME', 'COMMIT_SHA', 'PR_NUMBER', 'RUN_ID']);
  const produced = new Set(
    require('./classify-ci-failure.js')
      .toOutputLines({
        type: 't', workflowName: 'w', rootJob: 'j', rootStep: 's', exitCode: 1,
        trackedIn: null, fileIssue: true, signature: 'x', evidence: 'e',
      })
      .split('\n')
      .map(line => line.split('=')[0])
  );
  assert.ok(produced.has('TYPE') && produced.has('SIGNATURE'), '投影本身必须至少含 TYPE/SIGNATURE，否则这条守卫是空的');
  const missing = [...consumed].filter(k => !produced.has(k) && !selfEchoed.has(k));
  assert.deepEqual(missing, [], `handler 引用了分类器没投影的字段: ${missing.join(', ')}`);
});

test('handler 不得退回常量或 per-SHA 去重（这两条正是本 PR 修的东西）', () => {
  assert.doesNotMatch(HANDLER, /FAILURE_TYPE=ci-failure/, '分类结果不得再写常量');
  assert.doesNotMatch(HANDLER, /AUTO_FIXABLE=true/, '同上');
  assert.doesNotMatch(HANDLER, /ci-failure-\$SHA in:title/, '去重键不得是 per-commit');
  assert.match(HANDLER, /node \.github\/scripts\/classify-ci-failure\.js/, '必须真的调用分类器');
  // 动态标签会让 gh issue create 直接失败（仓库无这些标签），故标签集合必须保持静态
  assert.match(HANDLER, /--label "bug,ci-failure,level-4"/, '标签必须是既有集合');
  assert.doesNotMatch(HANDLER, /--label "bug,ci-failure,\$\{\{/, '禁止把分类值塞进 --label');
  // 分类步骤自身失败要回落，否则 -e 会让 handler 变红且一张单都不开
  assert.match(HANDLER, /if ! node \.github\/scripts\/classify-ci-failure\.js/, '缺少回落分支');
  assert.match(HANDLER, /回落到旧行为/, '回落分支必须出声');
});

// --- 注入面守卫：run: 正文里不得内联 ${{ -------------------------------------------
// 存在理由：GitHub 表达式是**字面替换**进 shell 文本的，替换发生在 bash 解析之前。
// 本 handler 由 workflow_run 触发、带 issues:write / pull-requests:write，而
// `workflow_run.name` 是失败那个工作流文件自己声明的字符串——fork 的 PR 想写什么写什么。
// 修法只有一条：值进 env:，正文里读 shell 变量。
function runBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)run:\s*[|>][-+]?\s*$/.exec(lines[i]);
    if (!head) continue;
    const indent = head[1].length;
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      const lead = /^\s*/.exec(line)[0].length;
      if (line.trim() !== '' && lead <= indent) break;
      body.push(line);
    }
    blocks.push({ startLine: i + 1, text: body.join('\n') });
    i = j - 1;
  }
  return blocks;
}

test('run: 正文里不得内联 ${{ 表达式（字面替换先于 bash 解析 = 命令注入面）', () => {
  const blocks = runBlocks(HANDLER);
  assert.ok(blocks.length >= 6, `至少应解析出 6 个 run 块，实际 ${blocks.length} —— 解析器失配会让本守卫变成装饰`);
  const offending = blocks.filter(b => b.text.includes('${{')).map(b => b.startLine);
  assert.deepEqual(offending, [], `这些 run: 块正文里内联了 \${{ ... }}（起始行 ${offending.join(', ')}）`);
  // 反向自证：不是"整份文件没有表达式"造成的假绿——env 传的值必须真的被正文读走
  const first = blocks[0].text;
  assert.match(first, /"\$EVT_WORKFLOW_NAME"/, '工作流名必须由 env 变量提供');
  assert.match(first, /--run-attempt "\$EVT_RUN_ATTEMPT"/, 'attempt 必须由 env 变量提供');
  assert.match(HANDLER, /EVT_WORKFLOW_NAME: \$\{\{ github\.event\.workflow_run\.name \}\}/, 'env 侧必须绑定事件字段');
  // 正文读走的每个 $EVT_* 都必须在 env: 里声明过。漏声明不报错，只是**空串**——
  // 而空 attempt 正是"读最新 attempt"的旧行为，等于把 #2572 的竞态静默改回来。
  const declared = new Set([...HANDLER.matchAll(/^[ \t]+(EVT_[A-Z_]+):/gm)].map(m => m[1]));
  const used = new Set([...HANDLER.matchAll(/\$(EVT_[A-Z_]+)/g)].map(m => m[1]));
  assert.ok(used.size >= 5, `至少应有 5 个 $EVT_ 引用，实际 ${used.size} —— 正则失配则本条为空守卫`);
  assert.deepEqual([...used].filter(u => !declared.has(u)), [], '有 $EVT_* 没有对应的 env: 声明');
});
