/**
 * ci-hardening 模板契约测试（防漂移）：
 * 1. 所有模板 {{VARS}} 必须被 apply-ci-hardening.js 的 DEFAULTS 覆盖（无残留占位符）
 * 2. quality-gate.yml 渲染产物必须是并行多 job + 触发去重（无 branches-ignore 双跑）
 * 3. quality-gates.md 模板必须包含「本次执行记录」节（pre-commit 自动审计依赖）
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILL = path.join(ROOT, 'skills', 'other', 'ci-hardening');
const TPL_DIR = path.join(SKILL, 'assets', 'templates');
const APPLY = path.join(SKILL, 'scripts', 'apply-ci-hardening.js');

function extractDefaults(src) {
  const m = src.match(/const DEFAULTS = \{([\s\S]*?)\n\};/);
  assert.ok(m, 'DEFAULTS 常量必须存在');
  return [...m[1].matchAll(/^  (\w+):/gm)].map((x) => x[1]);
}

function extractVars(tpl) {
  return [...new Set([...tpl.matchAll(/\{\{(\w+)\}\}/g)].map((x) => x[1]))];
}

test('模板变量全部被 DEFAULTS 覆盖（无 {{VARS}} 残留）', () => {
  const src = fs.readFileSync(APPLY, 'utf8');
  const defaults = extractDefaults(src);
  const files = fs.readdirSync(TPL_DIR).filter((f) => f.endsWith('.tpl'));
  assert.ok(files.length >= 3, '至少 3 个模板');
  for (const f of files) {
    const tpl = fs.readFileSync(path.join(TPL_DIR, f), 'utf8');
    const vars = extractVars(tpl);
    const uncovered = vars.filter((v) => !defaults.includes(v));
    assert.deepStrictEqual(uncovered, [], `${f} 含未覆盖变量: ${uncovered.join(', ')}`);
  }
});

test('quality-gate.yml.tpl 为并行多 job + 触发去重（无 branches-ignore 双跑）', () => {
  const tpl = fs.readFileSync(path.join(TPL_DIR, 'quality-gate.yml.tpl'), 'utf8');
  assert.ok(tpl.includes('static-gates'), '必须含 static-gates job');
  assert.ok(tpl.includes('unit-tests'), '必须含 unit-tests job');
  assert.ok(tpl.includes('workflow_dispatch'), '必须含 workflow_dispatch');
  assert.ok(!tpl.includes('branches-ignore'), '不得含 branches-ignore 双跑触发');
  assert.ok(!tpl.includes('push:'), '不得含 push 触发（PR + 手动即可）');
});

test('quality-gates.md.tpl 含「本次执行记录」节（pre-commit 审计依赖）', () => {
  const tpl = fs.readFileSync(path.join(TPL_DIR, 'quality-gates.md.tpl'), 'utf8');
  assert.ok(tpl.includes('## 本次执行记录'), '必须含执行记录节');
  assert.ok(tpl.includes('提交前自检'), '必须含自检说明');
});

test('installer 斜杠命令模板存在且非空（install-mechanism 复制依赖）', () => {
  const cmdFile = path.join(ROOT, 'installer', 'commands', '质量节拍.md');
  assert.ok(fs.existsSync(cmdFile), 'installer/commands/质量节拍.md 必须存在');
  const content = fs.readFileSync(cmdFile, 'utf8');
  assert.ok(content.includes('质量节拍'), '命令模板必须含技能名');
  assert.ok(content.trim().length > 20, '命令模板不得为空');
});

test('DEFAULTS 中性化：不得含 Multi-Publish 特有路径', () => {
  const src = fs.readFileSync(APPLY, 'utf8');
  const m = src.match(/const DEFAULTS = \{([\s\S]*?)\n\};/);
  const block = m[1];
  assert.ok(!block.includes('@multi-publish'), 'DEFAULTS 不得硬编码 @multi-publish');
  assert.ok(!block.includes('npm.cmd'), 'DEFAULTS 不得硬编码 npm.cmd（跨平台用 npm）');
  // apps/desktop 是 Electron workspace 通用默认（DESKTOP_WORKSPACE_DIR，可经 config 覆盖），允许；
  // 但不得出现 Multi-Publish 特有组合（如 apps/desktop + @multi-publish）
  assert.ok(!block.includes('@multi-publish/desktop'), 'DEFAULTS 不得硬编码 @multi-publish/desktop 工作区');
});
