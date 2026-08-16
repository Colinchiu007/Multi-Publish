const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  classifyCoverageResult,
  evaluateRunResults,
  generateReport,
  runVisualTests,
} = require('../scripts/run-autonomous-e2e');

const visualPass = { diffCount: 0, summary: { failed: 0 } };
const functionalPass = { summary: { total: 1, passed: 1, failed: 0 } };

describe('自主 E2E 结果合同', () => {
  it('无模型 prompt 包必须标记 NEED_HUMAN 并返回非零', () => {
    const coverage = {
      _mode: 'agent-required',
      _verdict: { _mode: 'prompt', prompt: '请人工审查' },
    };

    assert.equal(classifyCoverageResult(coverage), 'NEED_HUMAN');
    assert.deepEqual(
      evaluateRunResults(visualPass, coverage, functionalPass),
      {
        coverageStatus: 'NEED_HUMAN',
        exitCodes: ['COVERAGE_NEED_HUMAN'],
        overall: 'NEED_HUMAN',
      },
    );
  });

  it('明确 PASS 且其他阶段成功时才允许整体 PASS', () => {
    const coverage = { _verdict: { _mode: 'llm', decision: 'PASS' } };

    assert.equal(classifyCoverageResult(coverage), 'PASS');
    assert.deepEqual(evaluateRunResults(visualPass, coverage, functionalPass), {
      coverageStatus: 'PASS',
      exitCodes: [],
      overall: 'PASS',
    });
  });

  it('明确 FAIL 必须阻断', () => {
    const coverage = { _verdict: { _mode: 'llm', decision: 'FAIL' } };

    assert.equal(classifyCoverageResult(coverage), 'FAIL');
    assert.equal(evaluateRunResults(visualPass, coverage, functionalPass).overall, 'FAIL');
    assert.equal(
      classifyCoverageResult({ _mode: 'agent-required', _verdict: { _mode: 'prompt', decision: 'FAIL' } }),
      'FAIL',
    );
  });

  it('矛盾或未知的覆盖裁决必须 fail closed', () => {
    assert.equal(
      classifyCoverageResult({ _mode: 'agent-required', _verdict: { _mode: 'prompt', decision: 'PASS' } }),
      'FAIL',
    );
    assert.equal(classifyCoverageResult({ _verdict: { decision: 'UNKNOWN' } }), 'FAIL');
    assert.equal(classifyCoverageResult({ skipped: true, error: '审计异常' }), 'FAIL');
    assert.equal(classifyCoverageResult({ skipped: true, _verdict: { decision: 'FAIL' } }), 'FAIL');
    assert.equal(
      classifyCoverageResult({ skipped: true, _mode: 'agent-required', _verdict: { _mode: 'prompt' } }),
      'FAIL',
    );
  });

  it('未知或错误的覆盖审计结果必须 fail closed', () => {
    assert.equal(classifyCoverageResult({}), 'FAIL');
    assert.equal(classifyCoverageResult({ error: '审计异常' }), 'FAIL');
    assert.deepEqual(
      evaluateRunResults(visualPass, {}, functionalPass).exitCodes,
      ['COVERAGE_FAIL'],
    );
  });

  it('视觉或功能阶段的基础设施错误必须阻断', () => {
    const coverage = { _verdict: { decision: 'PASS' } };

    assert.deepEqual(
      evaluateRunResults({ error: '视觉工具崩溃', summary: { failed: 0 } }, coverage, functionalPass).exitCodes,
      ['VISUAL_FAIL'],
    );
    assert.deepEqual(
      evaluateRunResults(visualPass, coverage, { error: '浏览器崩溃', summary: { failed: 0 } }).exitCodes,
      ['FUNCTIONAL_FAIL'],
    );
    assert.deepEqual(
      evaluateRunResults({ skipped: true, error: '视觉工具崩溃' }, coverage, functionalPass).exitCodes,
      ['VISUAL_FAIL'],
    );
    assert.deepEqual(
      evaluateRunResults(visualPass, coverage, { skipped: true, error: '浏览器崩溃' }).exitCodes,
      ['FUNCTIONAL_FAIL'],
    );
  });

  it('视觉命令非零退出时即使没有 diff 文件也必须阻断', async (t) => {
    const appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomous-visual-command-'));
    let commandCount = 0;

    t.after(() => fs.rmSync(appsDir, { recursive: true, force: true }));

    const result = await runVisualTests({
      appsDir,
      reportDir: path.join(appsDir, 'reports'),
      execute() {
        commandCount += 1;
        throw new Error(`命令 ${commandCount} 失败`);
      },
    });

    assert.equal(commandCount, 2, '像素测试失败后仍应运行 Agent 诊断');
    assert.equal(result.diffCount, 0, '测试夹具刻意不生成 diff 文件');
    assert.match(result.error, /像素对比测试失败: 命令 1 失败/);
    assert.match(result.error, /Agent 视觉判断失败: 命令 2 失败/);
    assert.deepEqual(
      evaluateRunResults(result, { _verdict: { decision: 'PASS' } }, functionalPass).exitCodes,
      ['VISUAL_FAIL'],
    );
  });

  it('像素套件子进程必须继承循环启动的 TEST_URL / TEST_PORT', async (t) => {
    const appsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomous-visual-env-'));
    let capturedEnv = null;

    t.after(() => fs.rmSync(appsDir, { recursive: true, force: true }));

    await runVisualTests({
      appsDir,
      reportDir: path.join(appsDir, 'reports'),
      execute(_command, options) {
        if (capturedEnv === null) capturedEnv = options && options.env;
        return '';
      },
    });

    const expectedPort = process.env.TEST_PORT || '5173';
    assert.ok(capturedEnv, '像素子进程必须收到继承 env');
    assert.equal(capturedEnv.TEST_URL, `http://127.0.0.1:${expectedPort}`);
    assert.equal(capturedEnv.TEST_PORT, expectedPort);
    assert.equal(capturedEnv.LLM_PROVIDER, process.env.LLM_PROVIDER, '继承 env 不得丢失原有变量');
  });

  it('视觉或功能阶段的未知和畸形结果必须 fail closed', () => {
    const coverage = { _verdict: { decision: 'PASS' } };

    assert.deepEqual(evaluateRunResults({}, coverage, functionalPass).exitCodes, ['VISUAL_FAIL']);
    assert.deepEqual(
      evaluateRunResults({ diffCount: 0, summary: {} }, coverage, functionalPass).exitCodes,
      ['VISUAL_FAIL'],
    );
    assert.deepEqual(
      evaluateRunResults(visualPass, coverage, { summary: { failed: '0' } }).exitCodes,
      ['FUNCTIONAL_FAIL'],
    );
    assert.deepEqual(
      evaluateRunResults(visualPass, coverage, { summary: { failed: Number.NaN } }).exitCodes,
      ['FUNCTIONAL_FAIL'],
    );
  });

  it('功能阶段必须证明至少执行一个测试且汇总自洽', () => {
    const coverage = { _verdict: { decision: 'PASS' } };

    for (const functional of [
      { summary: { total: 0, passed: 0, failed: 0 } },
      { summary: { total: 2, passed: 1, failed: 0 } },
      { summary: { total: 1, passed: 2, failed: 0 } },
    ]) {
      assert.deepEqual(
        evaluateRunResults(visualPass, coverage, functional).exitCodes,
        ['FUNCTIONAL_FAIL'],
      );
    }
  });

  it('显式跳过覆盖审计不应伪造裁决，也不阻断其他成功阶段', () => {
    const coverage = { skipped: true };

    assert.equal(classifyCoverageResult(coverage), 'SKIPPED');
    assert.equal(evaluateRunResults(visualPass, coverage, functionalPass).overall, 'PASS');
  });

  it('报告与退出裁决必须共享同一归一化结果', (t) => {
    const coverage = {
      _mode: 'agent-required',
      _verdict: { _mode: 'prompt', prompt: '请人工审查' },
    };
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomous-e2e-result-'));
    const result = generateReport(visualPass, coverage, functionalPass, {
      now: new Date('2026-07-29T00:00:00.000Z'),
      reportDir,
    });

    t.after(() => {
      fs.rmSync(reportDir, { recursive: true, force: true });
    });

    assert.equal(result.report.overall, 'NEED_HUMAN');
    assert.equal(result.report.coverageStatus, 'NEED_HUMAN');
    assert.deepEqual(result.report.exitCodes, ['COVERAGE_NEED_HUMAN']);
    assert.deepEqual(result.evaluation, {
      coverageStatus: 'NEED_HUMAN',
      exitCodes: ['COVERAGE_NEED_HUMAN'],
      overall: 'NEED_HUMAN',
    });
    assert.match(fs.readFileSync(result.mdPath, 'utf8'), /\| Verdict \| NEED_HUMAN \|/);

    const conflictingResult = generateReport(
      visualPass,
      { _mode: 'agent-required', _verdict: { _mode: 'prompt', decision: 'PASS' } },
      functionalPass,
      { now: new Date('2026-07-29T00:00:00.500Z'), reportDir },
    );
    const conflictingMarkdown = fs.readFileSync(conflictingResult.mdPath, 'utf8');
    assert.equal(conflictingResult.report.overall, 'FAIL');
    assert.match(conflictingMarkdown, /\| Verdict \| FAIL \|/);
    assert.match(conflictingMarkdown, /\| 原始 Verdict \| PASS \|/);
  });

  it('Markdown 必须区分跳过与失败并显示基础设施错误', (t) => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomous-e2e-result-'));
    const result = generateReport(
      { type: 'visual', summary: { total: 0, passed: 0, failed: 0 }, skipped: true },
      { _verdict: { decision: 'PASS' } },
      { type: 'functional', summary: { total: 0, passed: 0, failed: 0 }, error: '浏览器崩溃' },
      { now: new Date('2026-07-29T00:00:01.000Z'), reportDir },
    );

    t.after(() => fs.rmSync(reportDir, { recursive: true, force: true }));

    const markdown = fs.readFileSync(result.mdPath, 'utf8');
    assert.equal(result.report.overall, 'FAIL');
    assert.deepEqual(result.report.exitCodes, ['FUNCTIONAL_FAIL']);
    assert.match(markdown, /## 视觉回归[\s\S]*\| 状态 \| 跳过 \|/);
    assert.match(markdown, /## 功能测试[\s\S]*\| 状态 \| 失败 \|/);
    assert.match(markdown, /\| 错误 \| 浏览器崩溃 \|/);
  });
});
