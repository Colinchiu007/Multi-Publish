const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', 'workflows', 'visual-test.yml');

test('视觉工作流的运行系统与 Linux 命令保持一致', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /sudo apt-get update/);
  assert.match(workflow, /shell:\s*bash/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /setsid bash -c/);
  assert.match(workflow, /kill -- -"\$vite_pid"/);
  assert.match(workflow, /npm run test:visual:pixel -w @multi-publish\/desktop/);
  assert.doesNotMatch(workflow, /agent-visual-judge\.js \|\| true/);
});
