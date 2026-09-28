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

const { classifyFailure, buildDedupTitle, collectEvidence, extractFailingTest } = require('./classify-ci-failure.js');

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
    // 第三条是"取日志找失败用例"：该作业的步骤确实是测试类，属预期新增（不是打错端点）。
    'api --allow-escape-sequences repos/o/r/actions/jobs/1/logs',
  ], '只允许对失败作业取 annotation 与日志：成功作业的 check_run 不该被请求');
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

const LOG = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'ci-failure-log-excerpts.json'), 'utf8')
);

test('夹具必须是同一测试-runner 步骤下的三种不同病因（否则这条守卫没有意义）', () => {
  assert.ok(LOG.samples.length >= 3, `需要 ≥3 条真实日志片段，实际 ${LOG.samples.length}`);
  const files = LOG.samples.map(s => s.failLines[0]);
  const distinct = new Set(files);
  assert.equal(distinct.size, LOG.samples.length, '三条 FAIL 行必须互不相同');
  // 三条都来自 QG Coverage / Gate 5 同一步骤（这是本守卫的前提，必须钉住）
  for (const s of LOG.samples) assert.ok(s.source.why.includes('同一步骤') || /QG Coverage/.test(s.source.why), s.source.why);
});

test('同一步骤里的不同测试必须产生不同签名（签名按步骤聚合会把 342 张不同病因并成一张单）', () => {
  const made = LOG.samples.map(s => {
    const sig = classifyFailure({
      workflowName: 'quality-gate',
      runId: s.source.runId,
      headSha: 'b'.repeat(40),
      failedJobs: [{ id: s.source.jobId, name: 'QG Coverage', conclusion: 'failure', steps: [{ name: 'Gate 5 - Test coverage check', conclusion: 'failure' }] }],
      annotations: [{ jobId: s.source.jobId, jobName: 'QG Coverage', list: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }] }],
      logExcerpts: [{ jobId: s.source.jobId, text: s.excerptLines.join('\n') }],
    });
    return sig;
  });
  const sigs = new Set(made.map(m => m.signature));
  assert.equal(sigs.size, 3, `三条不同病因必须给出 3 个签名，实际 ${sigs.size} 个：\n${made.map(m => m.signature).join('\n')}`);
  const titles = new Set(made.map(m => buildDedupTitle(m)));
  assert.equal(titles.size, 3, '标题也必须区分（同签名才去重）');
  // 每条签名都要带上测试文件，且不泄漏整行超长内容
  for (const m of made) assert.match(m.signature, /::test=/);
  assert.ok(made[0].signature.length < 260, `签名长度需有界，实际 ${made[0].signature.length}`);
});

test('failingTest 解析必须给出文件与用例名，且按真实 FAIL 行格式', () => {
  const t = extractFailingTest(LOG.samples[0].excerptLines.join('\n'));
  assert.equal(t.file, 'electron/services/rpa-view-platforms.test.js');
  assert.match(t.name, /kuaishou：publish_btn/);
  const timedOut = extractFailingTest(LOG.samples[2].excerptLines.join('\n'));
  assert.equal(timedOut.file, 'tests/visual-testing/pixel-diff-baseline-guard.test.js');
  assert.match(timedOut.name, /现存全部真实基线均通过守卫/);
  // 负控：日志里没有 FAIL 行时必须返回 null，不得凭空造一个测试名
  assert.equal(extractFailingTest('Test Files 1 failed | 676 passed\nExit status 1'), null);
});

test('日志取不到时签名退化为 test=unknown，且必须能看出是退化（不得伪装成"同一个成因"）', () => {
  const base = {
    workflowName: 'quality-gate', runId: 1, headSha: 'c'.repeat(40),
    failedJobs: [{ id: 9, name: 'QG Coverage', conclusion: 'failure', steps: [{ name: 'Gate 5 - Test coverage check', conclusion: 'failure' }] }],
    annotations: [{ jobId: 9, jobName: 'QG Coverage', list: [{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }] }],
  };
  const v = classifyFailure(base);
  assert.match(v.signature, /::test=unknown$/);
  assert.equal(v.failingTest, null);
  assert.match(v.evidence, /测试名未取得/);
  // 有 logExcerpts 但里面没有 FAIL 行（例如被截断）也走同一退化路径
  const v2 = classifyFailure({ ...base, logExcerpts: [{ jobId: 9, text: 'nothing interesting' }] });
  assert.match(v2.signature, /::test=unknown$/);
});

test('采集只为"测试-runner 类失败作业"取日志，非测试步骤不得触发 5MB 下载', async () => {
  const calls = [];
  const fake = (a) => {
    calls.push(a.join(' '));
    if (/actions\/runs\/55\/jobs/.test(a[1])) {
      return JSON.stringify({ jobs: [
        { id: 1, name: 'QG Coverage', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/o/r/check-runs/11', steps: [{ name: 'Gate 5 - Test coverage check', conclusion: 'failure' }] },
        { id: 2, name: '文档同步检查', conclusion: 'failure', check_run_url: 'https://api.github.com/repos/o/r/check-runs/12', steps: [{ name: '检查文档同步（硬门禁）', conclusion: 'failure' }] },
      ] });
    }
    if (/check-runs\/(11|12)\/annotations$/.test(a[1])) {
      return JSON.stringify([{ annotation_level: 'failure', message: 'Process completed with exit code 1.' }]);
    }
    if (/actions\/jobs\/1\/logs$/.test(a[1])) {
      return '2026-09-28T00:00:00.0000000Z  FAIL  electron/services/x.test.js > suite > case\n';
    }
    throw new Error('unexpected call ' + a.join(' '));
  };
  const input = await collectEvidence({ repo: 'o/r', runId: 55, workflowName: 'quality-gate', runGh: fake });
  const logCalls = calls.filter(c => /\/logs/.test(c));
  assert.deepEqual(logCalls, ['api --allow-escape-sequences repos/o/r/actions/jobs/1/logs'], '只允许对测试类作业取日志；文档同步步骤不得取');
  assert.equal(input.failedJobs.length, 2);
  assert.equal(classifyFailure(input).signature.includes('::test='), true);
});

