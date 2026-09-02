#!/usr/bin/env node
/**
 * ipc-manifest-registrar.js — IPC 通道清单注册器
 *
 * Stage 1.1：双写校验 — 确保每个 ipcMain.handle/on 注册的 channel 都在
 * 01-docs/ipc-manifest.md 中登记，且 manifest 中登记的 channel 都在代码中有对应 handler。
 *
 * 用法：
 *   node scripts/ipc-manifest-registrar.js          # 检查（CI 模式）
 *   node scripts/ipc-manifest-registrar.js --json   # JSON 输出
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, '01-docs', 'ipc-manifest.md');
const SCAN_DIRS = [
  'apps/desktop/electron/services',
  'apps/desktop/electron/ipc-handlers',
];

function parseManifest() {
  const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const channels = new Set();
  const lines = content.split('\n');
  let currentModule = '';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentModule = line.replace('## ', '').trim();
    }
    // Match channel entries like: `channel:name` | IPC invoke | ...
    const match = line.match(/^\|\s*`([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)`/);
    if (match) {
      channels.add(match[1]);
    }
  }

  return { channels, content };
}

function scanHandlers() {
  const handlers = new Set();
  const handlerFiles = new Map();

  function scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');

      // ipcMain.handle('channel:name', ...)
      const handleMatches = content.matchAll(/ipcMain\.handle\(\s*['"]([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)['"]/g);
      for (const m of handleMatches) {
        handlers.add(m[1]);
        handlerFiles.set(m[1], relative);
      }

      // ipcMain.on('channel:name', ...)
      const onMatches = content.matchAll(/ipcMain\.on\(\s*['"]([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)['"]/g);
      for (const m of onMatches) {
        handlers.add(m[1]);
        if (!handlerFiles.has(m[1])) {
          handlerFiles.set(m[1], relative);
        }
      }
    } catch (_) {}
  }

  function walk(dir) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(fullDir, e.name);
      if (e.isDirectory()) { walk(path.join(dir, e.name)); continue; }
      if (!/\.(js|ts)$/.test(e.name) || e.name.includes('.test.')) continue;
      scanFile(fp);
    }
  }

  for (const d of SCAN_DIRS) walk(d);
  return { handlers, handlerFiles };
}

function main() {
  const isJson = process.argv.includes('--json');

  const manifest = parseManifest();
  const code = scanHandlers();

  const missingFromManifest = [];
  for (const h of code.handlers) {
    if (!manifest.channels.has(h)) {
      missingFromManifest.push({ channel: h, file: code.handlerFiles.get(h) || 'unknown' });
    }
  }

  const missingFromCode = [];
  for (const c of manifest.channels) {
    if (!code.handlers.has(c)) {
      missingFromCode.push(c);
    }
  }

  const result = {
    manifestChannels: manifest.channels.size,
    codeChannels: code.handlers.size,
    missingFromManifest,
    missingFromCode,
    pass: missingFromManifest.length === 0 && missingFromCode.length === 0,
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  }

  console.log('=== IPC 通道清单检查 ===');
  console.log(`  Manifest 登记: ${manifest.channels.size} 个通道`);
  console.log(`  代码注册: ${code.handlers.size} 个通道`);
  console.log('');

  if (missingFromManifest.length > 0) {
    console.log(`❌ 代码中有 ${missingFromManifest.length} 个通道未在 manifest 中登记：`);
    for (const m of missingFromManifest) {
      console.log(`   ${m.channel} (${m.file})`);
    }
  }

  if (missingFromCode.length > 0) {
    console.log(`⚠️  Manifest 中有 ${missingFromCode.length} 个通道在代码中未找到：`);
    for (const c of missingFromCode) {
      console.log(`   ${c}`);
    }
  }

  if (result.pass) {
    console.log('✅ IPC 通道清单与代码一致，通过。');
    process.exit(0);
  } else {
    console.log('');
    console.log('修正方式：');
    console.log('  1. 新增通道 → 在 01-docs/ipc-manifest.md 对应模块下添加一行');
    console.log('  2. 废弃通道 → 从 manifest 中删除对应行');
    process.exit(1);
  }
}

main();
