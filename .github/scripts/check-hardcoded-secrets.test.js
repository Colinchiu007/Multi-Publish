const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findHardcodedSecrets } = require('./check-hardcoded-secrets');

test('报告生产代码中的硬编码密钥及准确行号', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));

  try {
    const source = path.join(root, 'service.js');
    fs.writeFileSync(source, "const safe = true;\nconst apiKey = 'abcdefghijklmnop';\n");

    assert.deepEqual(findHardcodedSecrets(root), [{
      file: source,
      line: 2,
      text: "const apiKey = '<redacted>';",
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('报告生产对象配置中的硬编码密钥', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));

  try {
    const source = path.join(root, 'config.js');
    fs.writeFileSync(source, "module.exports = { token: 'abcdefghijklmnop' };\n");

    assert.deepEqual(findHardcodedSecrets(root), [{
      file: source,
      line: 1,
      text: "module.exports = { token: '<redacted>' };",
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('忽略测试夹具和非赋值形式', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));

  try {
    fs.mkdirSync(path.join(root, 'tests'));
    fs.writeFileSync(path.join(root, 'service.test.js'), "const token = 'abcdefghijklmnop';\n");
    fs.writeFileSync(path.join(root, 'tests', 'fixture.js'), "const password = 'abcdefghijklmnop';\n");
    fs.writeFileSync(path.join(root, 'service.js'), "const config = { enabled: true };\n");

    assert.deepEqual(findHardcodedSecrets(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
