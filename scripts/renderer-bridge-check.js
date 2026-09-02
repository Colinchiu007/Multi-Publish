#!/usr/bin/env node
/**
 * renderer-bridge-check.js — 渲染进程桥接一致性检查（Stage 3.4）
 *
 * 扫描 src/ 下渲染进程代码，检查是否有直接调用 window.electronAPI 的代码
 * 而未通过统一的 electron-bridge.js 桥接层。
 *
 * 用法：
 *   node scripts/renderer-bridge-check.js          # 检查
 *   node scripts/renderer-bridge-check.js --json   # JSON 输出
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['apps/desktop/src'];
const EXCLUDE = ['node_modules', 'dist', '.git', 'tests', 'test', '__tests__', 'visual-testing'];
const BRIDGE_FILE = 'api/electron-bridge.js';

function scanDirectAPIUsage() {
  const results = [];
  const bridgeUsers = new Set();

  function walk(dir) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const e of entries) {
      if (EXCLUDE.some(x => e.name.includes(x))) continue;
      const fp = path.join(fullDir, e.name);
      const relative = path.relative(ROOT, fp).replace(/\\/g, '/');
      if (e.isDirectory()) { walk(path.join(dir, e.name)); continue; }
      if (!/\.(js|ts|vue|jsx|tsx)$/.test(e.name)) continue;
      try {
        const content = fs.readFileSync(fp, 'utf8');
        const usesDirectAPI = content.includes('window.electronAPI') && !content.includes(BRIDGE_FILE);
        const usesBridge = content.includes(BRIDGE_FILE) || content.includes('electron-bridge');

        if (usesDirectAPI) {
          const lines = content.split('\n');
          const occurrences = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('window.electronAPI')) {
              occurrences.push({ line: i + 1, text: lines[i].trim().slice(0, 80) });
            }
          }
          results.push({ file: relative, occurrences });
        }
        if (usesBridge) bridgeUsers.add(relative);
      } catch (_) {}
    }
  }

  for (const d of SCAN_DIRS) walk(d);
  return { results, bridgeUsers };
}

function main() {
  const isJson = process.argv.includes('--json');
  const { results, bridgeUsers } = scanDirectAPIUsage();

  const result = {
    bridgeUsers: bridgeUsers.size,
    directAPIUsers: results.length,
    files: results,
    summary: results.length === 0 ? 'all-files-use-bridge' : 'some-files-bypass-bridge',
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(results.length > 0 ? 1 : 0);
  }

  console.log('=== 渲染进程桥接一致性检查 ===');
  console.log(`  使用统一桥接 (electron-bridge.js): ${bridgeUsers.size} 个文件`);
  console.log(`  直接调用 window.electronAPI: ${results.length} 个文件`);
  console.log('');

  if (results.length > 0) {
    console.log('⚠️  以下文件直接调用 window.electronAPI 而未通过 electron-bridge.js：');
    for (const r of results.slice(0, 10)) {
      console.log(`  ${r.file} (${r.occurrences.length} 处)`);
    }
    if (results.length > 10) {
      console.log(`  ... 还有 ${results.length - 10} 个文件`);
    }
    console.log('');
    console.log('建议将直接调用迁移到 src/api/electron-bridge.js 的 invoke() 方法。');
    process.exit(0); // 仅告警，不阻断
  }

  console.log('✅ 所有渲染进程代码通过统一桥接层调用 IPC。');
  process.exit(0);
}

main();
