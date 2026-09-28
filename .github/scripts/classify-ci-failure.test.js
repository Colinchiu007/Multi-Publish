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

test('夹具本身必须是真实形状（防止将来有人手抄改形）', () => {
  assert.ok(electronSamples.length >= 2, '需要至少两条 Electron CI 真实样本');
  assert.ok(qualitySamples.length >= 1, '需要至少一条 quality-gate 真实样本');
  assert.ok(docSamples.length >= 1, '需要至少一条 Doc Sync Gate 真实样本');
  // 真实载荷里这两类互斥：超时墙 = 124，其余 = 1
  const codes = new Set(
    electronSamples.flatMap(s => s.annotations.flatMap(a => a.list.map(x => x.message)))
      .map(m => (m.match(/exit code (\d+)/) || [])[1])
      .filter(Boolean)
  );
  assert.deepEqual([...codes].sort(), ['124'], 'Electron CI 样本必须覆盖 exit 124（timeout(1) 的约定码）');
});

test('#2458 的预算墙被判成 ci-timeout-budget，而不是无限张 ci-failure', () => {
  for (const sample of electronSamples) {
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

test('去重键必须跨提交稳定 —— 两条不同 run 的同因失败要落在同一个签名上', () => {
  assert.notEqual(electronSamples[0].source.runId, electronSamples[1].source.runId, '夹具得是两次真实 run');
  assert.notEqual(electronSamples[0].source.headSha, electronSamples[1].source.headSha, '夹具得是两个不同提交');
  const a = classifyFailure(inputFrom(electronSamples[0], 'Electron CI'));
  const b = classifyFailure(inputFrom(electronSamples[1], 'Electron CI'));
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

test('quality-gate 的根因作业不得选成 Gate Result（它只是 needs 的汇总）', () => {
  for (const sample of qualitySamples) {
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
