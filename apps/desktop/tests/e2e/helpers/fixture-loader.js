/**
 * Fixture Loader
 *
 * 加载 tests/e2e/fixtures/ 下的 JSON 文件，序列化为可注入浏览器的字符串。
 *
 * 使用：
 *   const fixtures = loadFixtures(); // { accounts, articles, publishHistory, providers, comments }
 *   await page.addInitScript({ content: `window.__fixtures = ${fixtures};` + fs.readFileSync('ipc-mock.js') });
 */

const fs = require('fs');
const path = require('path');

function loadFixtures() {
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const files = ['accounts', 'articles', 'publish-history', 'model-providers', 'comments'];
  const out = {};
  for (const name of files) {
    const filePath = path.join(fixturesDir, name + '.json');
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      out[camelCase(name)] = data;
    } catch (e) {
      console.warn('[fixtures] skip ' + name + ': ' + e.message);
      out[camelCase(name)] = {};
    }
  }
  return out;
}

function camelCase(name) {
  return name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
}

/**
 * 加载 IPC mock 源码（注入字符串）
 */
function loadIpcMockSource() {
  return fs.readFileSync(path.join(__dirname, 'ipc-mock.js'), 'utf8');
}

/**
 * 生成 Playwright addInitScript 的 content 字符串。
 * 注入顺序：
 *   1. window.__fixtures = {...}
 *   2. IPC mock 源码（设置 window.electronAPI）
 */
function buildInitScript() {
  const fixtures = loadFixtures();
  const ipcMock = loadIpcMockSource();
  return 'window.__fixtures = ' + JSON.stringify(fixtures) + ';\n' + ipcMock + '\n;';
}

module.exports = { loadFixtures, loadIpcMockSource, buildInitScript };