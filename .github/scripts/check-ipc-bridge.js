/**
 * IPC 桥接完整性检查
 */
const fs = require('fs');
const path = require('path');

const HD = 'apps/desktop/electron/ipc-handlers';
const SD = 'apps/desktop/electron/services';
const PP_DIR = 'apps/desktop/electron/preload';

const HIDDEN = new Set([
  'auth:login-silent', 'auth:save-credentials', 'store:update-account',
  'proxy:add', 'proxy:add-batch', 'proxy:get-next', 'proxy:list',
  'proxy:remove', 'proxy:remove-dead', 'proxy:reset', 'proxy:status',
  'proxy:test', 'proxy:test-all',
  'upload:cancel', 'upload:chunked',
  'analytics:overview', 'analytics:platform', 'analytics:platforms',
  'keyword:history', 'keyword:start', 'keyword:status',
  'keyword:stop', 'keyword:stop-all',
  'show-notification', 'hotkeys:list',
  'impact:get-active', 'impact:get-recent-snapshots',
  'intelligence:fetch-trending', 'intelligence:find-references',
  'intelligence:get-benchmark', 'intelligence:get-impact',
  'intelligence:save-impact', 'intelligence:search',
  'intelligence:search-mentions', 'intelligence:search-titles',
  'pipeline:registerStageExecutor', 'pipeline:registerPipeline',
  'pipeline:startOrchestrated', 'pipeline:executeStage',
  'pipeline:advanceToNextCheckpoint', 'pipeline:getRunContext',
  'pipeline:pauseWithCheckpoint', 'pipeline:resumeFromCheckpoint',
]);

const GAPS = new Set([]);

const RE1 = /ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]/g;
const RE2 = /ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]/g;

function extract(content, re) {
  const s = new Set(); let m;
  while ((m = re.exec(content)) !== null) s.add(m[1]);
  return s;
}

const all = new Set();
for (const d of [HD, SD]) {
  for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js') && x !== 'types.js')) {
    const c = fs.readFileSync(path.join(d, f), 'utf8');
    if (c.length < 100) continue;
    extract(c, RE1).forEach(x => all.add(x));
  }
}

const pre = new Set();
function walkPreloadDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkPreloadDir(full); continue; }
    if (!entry.name.endsWith('.js')) continue;
    extract(fs.readFileSync(full, 'utf8'), RE2).forEach(x => pre.add(x));
  }
}
walkPreloadDir(PP_DIR);
const missing = [...all].filter(h => !pre.has(h) && !HIDDEN.has(h) && !GAPS.has(h)).sort();
const gaps = [...all].filter(h => GAPS.has(h)).sort();

console.log('');
console.log('=== IPC 桥接完整性检查 ===');
console.log('');
let code = 0;
if (missing.length) {
  console.log('  [ERROR] Handler 已注册但 preload.js 未暴露:');
  missing.forEach(c => console.log('    ' + c));
  console.log(''); code = 1;
} else {
  console.log('  OK' + ' - 所有 handler 均有对应桥接');
  console.log('');
}
if (gaps.length) {
  console.log('  [KNOWN_GAPS] 已知缺口:');
  gaps.forEach(c => console.log('    ' + c));
  console.log('');
}
console.log('  统计: ' + all.size + ' handlers / ' + pre.size + ' preload');
console.log('        ' + HIDDEN.size + ' 有意隐藏 / ' + gaps.length + ' 已知缺口');
console.log('');
process.exit(code);