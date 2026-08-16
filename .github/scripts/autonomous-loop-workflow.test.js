const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const yaml = require('js-yaml');

const workflowsDir = path.join(__dirname, '..', 'workflows');
const autonomousLoopPath = path.join(workflowsDir, 'autonomous-loop.yml');
const qualityGatePath = path.join(workflowsDir, 'quality-gate.yml');

function readWorkflow(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function getStep(workflow, name) {
  return workflow.jobs.loop.steps.find(step => step.name === name);
}

test('所有 GitHub Actions workflow 都能被 YAML 解析器加载', () => {
  const workflowFiles = fs.readdirSync(workflowsDir)
    .filter(file => /\.ya?ml$/i.test(file))
    .sort();

  assert.ok(workflowFiles.length > 0, '至少应存在一个 GitHub Actions workflow');
  for (const file of workflowFiles) {
    assert.doesNotThrow(
      () => readWorkflow(path.join(workflowsDir, file)),
      `${file} 必须是有效 YAML`,
    );
  }
});

test('自主循环只响应指定 PR 标签，并以只读凭据运行 PR 代码', () => {
  const source = fs.readFileSync(autonomousLoopPath, 'utf8');
  const workflow = readWorkflow(autonomousLoopPath);
  const checkout = workflow.jobs.loop.steps.find(step => step.uses === 'actions/checkout@v4');

  assert.notEqual(source.charCodeAt(0), 0xfeff, 'workflow 不应包含 UTF-8 BOM');
  assert.deepEqual(workflow.on.pull_request.types, ['labeled']);
  assert.match(workflow.jobs.loop.if, /github\.event\.label\.name\s*==\s*'autonomous-loop'/);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions['pull-requests'], undefined);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(
    workflow.jobs.loop.env.OPENAI_API_KEY,
    "${{ github.event_name != 'pull_request' && secrets.OPENAI_API_KEY || '' }}",
  );
  assert.equal(
    workflow.jobs.loop.env.FUNCTIONAL_ENABLED,
    "${{ github.event_name != 'workflow_dispatch' || inputs.functional }}",
  );
  assert.doesNotMatch(source, /github\.event\.inputs\.functional\s*\|\|\s*'true'/);
});

test('PR 标签运行覆盖自主测试器及其 workflow 合同变更', () => {
  const workflow = readWorkflow(autonomousLoopPath);

  assert.deepEqual(
    [...workflow.on.pull_request.paths].sort(),
    [...workflow.on.push.paths].sort(),
    'PR 与 main push 必须对同一组自主测试相关路径触发',
  );
});

test('自主循环只产出待审 artifacts，不自动提交或推送工作树内容', () => {
  const source = fs.readFileSync(autonomousLoopPath, 'utf8');
  const workflow = readWorkflow(autonomousLoopPath);
  const upload = getStep(workflow, 'Upload reports and review candidates');

  assert.ok(upload, '必须上传报告和待人工审核的候选文件');
  assert.match(upload.with.path, /apps\/desktop\/tests\/visual-testing\/reports\//);
  assert.match(upload.with.path, /apps\/desktop\/tests\/visual-testing\/base-screenshots\//);
  assert.match(upload.with.path, /apps\/desktop\/patches\//);
  assert.doesNotMatch(source, /git\s+add\s+-A|git\s+commit|git\s+push|--allow-empty/i);
});

function runStatusStep(scriptPath, env) {
  return spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', scriptPath], {
    env,
    encoding: 'utf8',
  });
}

function writeLoopReport(reportDir, finalStatus) {
  const filePath = path.join(reportDir, `autonomous-loop-report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ finalStatus, iterations: 1 }), 'utf8');
  return filePath;
}
function writeCorruptReport(reportDir) {
  const filePath = path.join(reportDir, `autonomous-loop-report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(filePath, '{ not valid json', 'utf8');
  return filePath;
}

test('最终状态在退出码缺失或非法时失败，仅显式 0 成功', () => {
  const workflow = readWorkflow(autonomousLoopPath);
  const reportStep = getStep(workflow, 'Report final status');
  const scriptPath = path.join(os.tmpdir(), `autonomous-loop-status-${process.pid}.ps1`);
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), `al-loop-reports-${process.pid}-`));

  assert.ok(reportStep, '必须存在最终状态步骤');
  assert.match(reportStep.run, /\[int\]::TryParse/);
  assert.doesNotMatch(reportStep.run, /\$env:LOOP_EXIT\s*\|\|/);
  fs.writeFileSync(scriptPath, reportStep.run, 'utf8');

  try {
    for (const [value, expectedStatus] of [[undefined, 1], ['invalid', 1], ['2', 1], ['0', 0]]) {
      const env = { ...process.env, OPENAI_API_KEY: '', LOOP_REPORT_DIR: reportDir };
      if (value === undefined) delete env.LOOP_EXIT;
      else env.LOOP_EXIT = value;

      const result = runStatusStep(scriptPath, env);
      assert.equal(result.status, expectedStatus, `LOOP_EXIT=${value ?? '<missing>'}`);
    }
  } finally {
    fs.rmSync(scriptPath, { force: true });
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});

test('无 LLM key 时 NEED_HUMAN 降级为 warning 退出 0，配置 key 或真实失败保持 error', () => {
  const workflow = readWorkflow(autonomousLoopPath);
  const reportStep = getStep(workflow, 'Report final status');
  const scriptPath = path.join(os.tmpdir(), `autonomous-loop-status-${process.pid}-degrade.ps1`);
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), `al-loop-degrade-${process.pid}-`));

  assert.ok(reportStep, '必须存在最终状态步骤');
  fs.writeFileSync(scriptPath, reportStep.run, 'utf8');

  try {
    // 无 key + NEED_HUMAN → 0 + warning（降级只读检查）
    writeLoopReport(reportDir, 'NEED_HUMAN');
    let result = runStatusStep(scriptPath, { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: '', LOOP_REPORT_DIR: reportDir });
    assert.equal(result.status, 0, '无 key + NEED_HUMAN 应降级为 0');
    assert.match(result.stdout + result.stderr, /::warning::/);
    assert.doesNotMatch(result.stdout + result.stderr, /::error::/);

    // 有 key + NEED_HUMAN → 1（真实需要人工判断，保持 fail-closed）
    fs.rmSync(reportDir, { recursive: true, force: true });
    fs.mkdirSync(reportDir, { recursive: true });
    writeLoopReport(reportDir, 'NEED_HUMAN');
    result = runStatusStep(scriptPath, { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: 'sk-test', LOOP_REPORT_DIR: reportDir });
    assert.equal(result.status, 1, '有 key + NEED_HUMAN 应保持失败');
    assert.match(result.stdout + result.stderr, /::error::/);

    // 无 key + 非 NEED_HUMAN（FAIL）→ 1
    fs.rmSync(reportDir, { recursive: true, force: true });
    fs.mkdirSync(reportDir, { recursive: true });
    writeLoopReport(reportDir, 'FAIL');
    result = runStatusStep(scriptPath, { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: '', LOOP_REPORT_DIR: reportDir });
    assert.equal(result.status, 1, '无 key + 非 NEED_HUMAN 应保持失败');

    // 无报告 → 1（缺失证据不回落在降级）
    fs.rmSync(reportDir, { recursive: true, force: true });
    fs.mkdirSync(reportDir, { recursive: true });
    result = runStatusStep(scriptPath, { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: '', LOOP_REPORT_DIR: reportDir });
    assert.equal(result.status, 1, '无报告时应保持失败');
    // 报告损坏（非法 JSON）→ 1，不降级
    fs.rmSync(reportDir, { recursive: true, force: true });
    fs.mkdirSync(reportDir, { recursive: true });
    writeCorruptReport(reportDir);
    result = runStatusStep(scriptPath, { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: '', LOOP_REPORT_DIR: reportDir });
    assert.equal(result.status, 1, '报告损坏时应保持失败');
    assert.doesNotMatch(result.stdout + result.stderr, /::warning::/);

    // 未配置 LOOP_REPORT_DIR → 回落失败（无默认相对路径，避免依赖 cwd）
    const envNoReportDir = { ...process.env, LOOP_EXIT: '1', OPENAI_API_KEY: '' };
    delete envNoReportDir.LOOP_REPORT_DIR;
    result = runStatusStep(scriptPath, envNoReportDir);
    assert.equal(result.status, 1, '未配置 LOOP_REPORT_DIR 时应保持失败');
  } finally {
    fs.rmSync(scriptPath, { force: true });
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});
test('Quality Gate 执行自主循环 workflow 合同', () => {
  const qualityGate = fs.readFileSync(qualityGatePath, 'utf8');
  assert.match(qualityGate, /\.github\/scripts\/autonomous-loop-workflow\.test\.js/);
});
