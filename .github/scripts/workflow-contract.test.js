const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', 'workflows', 'visual-test.yml');
const qualityGatePath = path.join(__dirname, '..', 'workflows', 'quality-gate.yml');

test('视觉工作流使用与基线一致的 Windows 渲染环境', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /runs-on:\s*windows-latest/);
  assert.match(workflow, /shell:\s*pwsh/);
  assert.match(workflow, /Start-Process -FilePath "npx\.cmd"/);
  assert.match(workflow, /taskkill \/PID/);
  assert.match(workflow, /npm\.cmd run test:visual:pixel/);
  assert.doesNotMatch(workflow, /sudo apt-get|setsid bash|trap cleanup EXIT/);
  assert.doesNotMatch(workflow, /agent-visual-judge\.js \|\| true/);
});

test('Quality Gate Gate 7 与视觉工作流使用一致的渲染参数', () => {
  const workflow = fs.readFileSync(qualityGatePath, 'utf8');
  const gate7 = workflow.match(/- name: "Gate 7 - Visual regression"[\s\S]*?(?=\n      # --- Gate 8)/)?.[0];

  assert.ok(gate7, 'Gate 7 workflow step must exist');
  assert.match(gate7, /TEST_URL:\s*http:\/\/127\.0\.0\.1:5174/);
  assert.match(gate7, /HEADLESS:\s*["']?true["']?/);
  assert.match(gate7, /PIXEL_THRESHOLD:\s*["']?0\.02["']?/);
});
