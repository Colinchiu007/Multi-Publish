#!/usr/bin/env node
/**
 * OpenSpec 归档三同步检查（机制硬化 Requirement: 归档三同步自动检查）
 *
 * 扫描 .ccg/tasks 下所有 task.json（含 archive）：
 *   - task.status === 'completed' 且存在 openspecChange 关联
 *   - 但对应 change 仍 active（openspec/changes/<change> 存在，未 archive）
 * 则输出警告并返回非零；无关联任务跳过，不误报。
 *
 * 用法: node scripts/openspec-sync-check.js [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT, '.ccg', 'tasks');
const CHANGES_DIR = path.join(ROOT, 'openspec', 'changes');
const ARCHIVE_DIR = path.join(CHANGES_DIR, 'archive');

function isJson(name) {
  return name === 'task.json';
}

function collectTaskFiles(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTaskFiles(full, out);
    else if (entry.isFile() && isJson(entry.name)) out.push(full);
  }
  return out;
}

function changeIsActive(changeName) {
  const active = path.join(CHANGES_DIR, changeName);
  if (!changeName || typeof changeName !== 'string') return false;
  if (!fs.existsSync(active)) return false;
  const archive = path.join(ARCHIVE_DIR, changeName);
  return !fs.existsSync(archive);
}

function main() {
  const wantJson = process.argv.includes('--json');
  const taskFiles = collectTaskFiles(TASKS_DIR, []);
  const warnings = [];

  for (const file of taskFiles) {
    let task;
    try {
      task = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (wantJson) {
        warnings.push({ file: path.relative(ROOT, file), error: 'unparseable task.json: ' + err.message });
      } else {
        console.warn(`[openspec-sync] 跳过无法解析的 task.json: ${path.relative(ROOT, file)} (${err.message})`);
      }
      continue;
    }
    const changeName = task.openspecChange;
    if (!changeName) continue; // 无关联任务跳过
    const completed = task.status === 'completed' || task.currentPhase === 'completed';
    if (completed && changeIsActive(changeName)) {
      warnings.push({
        file: path.relative(ROOT, file),
        task: task.id || path.basename(path.dirname(file)),
        change: changeName,
        message: 'CCG task 已 completed 但关联 OpenSpec change 仍 active，未归档（三同步断裂）。请执行: openspec archive ' + changeName,
      });
    }
  }

  if (wantJson) {
    console.log(JSON.stringify({ ok: warnings.length === 0, warnings }, null, 2));
  } else if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`[openspec-sync] 警告: ${w.message} (task: ${w.file})`);
    }
  } else {
    console.log('[openspec-sync] OK: 无「completed 但未归档」的关联任务。');
  }

  process.exitCode = warnings.length > 0 ? 1 : 0;
}

main();