#!/usr/bin/env node
/**
 * 机制整合包 — 环境验证门禁（质量节拍 5.6 机制集成）
 *
 * 用法：
 *   node verify-env.js [项目路径]     # 默认当前目录
 *
 * 检查项（PASS / FAIL / WARN 逐项报告）：
 *   1. OpenSpec CLI 版本（≥1.8）
 *   2. openspec doctor（目标项目）
 *   3. OpenSpec 契约可见（list --specs，无 specs 为 WARN）
 *   4. codegraph CLI
 *   5. codegraph 项目索引（.codegraph 存在 / status）
 *   6. fastctx CLI + fastctx status
 *   7. ~/.codex/config.toml 含 [mcp_servers.fastctx] 与 [mcp_servers.codegraph]
 *   8. 门禁产物（quality-gate.yml 并行版 + .quality-gates.md 存在；缺失 FAIL）
 *   9. CCG 双模型认证（WARN 不阻塞）：codeagent-wrapper / claude / gemini / antigravity
 *
 * 任一 FAIL → 退出码 1（阻塞"完成"）；WARN 不阻塞但醒目提示。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const TARGET = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.');
const HOME = os.homedir();
const CODEX_CONFIG = path.join(HOME, '.codex', 'config.toml');

const results = [];
function record(level, name, detail) {
  results.push({ level, name, detail });
  const icon = level === 'PASS' ? '✅' : level === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} [${level}] ${name}${detail ? ' — ' + detail : ''}`);
}
function hasCmd(cmd) {
  try { execSync(`${cmd} --version`, { stdio: 'pipe', encoding: 'utf8', timeout: 15000 }); return true; }
  catch { return false; }
}
function tryCmd(cmd, cwd) {
  try { return { ok: true, out: execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', timeout: 30000 }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; }
}

function check() {
  console.log(`\n环境验证门禁 — 目标: ${TARGET}\n`);

  // 1. OpenSpec CLI
  const osv = tryCmd('openspec --version', TARGET);
  if (osv.ok) record('PASS', 'OpenSpec CLI', osv.out.trim().split('\n')[0]);
  else record('FAIL', 'OpenSpec CLI', '未安装（bootstrap-env.js 步骤 3 应已安装）');

  // 2. openspec doctor
  const doc = tryCmd('openspec doctor 2>&1', TARGET);
  if (doc.ok && /OpenSpec root: ok/i.test(doc.out)) record('PASS', 'openspec doctor', 'root ok');
  else record('FAIL', 'openspec doctor', '非 ok（先 openspec init --force）');

  // 3. specs 可见
  const specs = tryCmd('openspec list --specs 2>&1', TARGET);
  if (specs.ok && /requirements \d+/i.test(specs.out)) {
    const m = specs.out.match(/requirements (\d+)/i);
    record('PASS', 'OpenSpec 契约', m ? `${m[1]} requirements` : '可见');
  } else {
    record('WARN', 'OpenSpec 契约', '无 specs（新项目正常，复制 spec-contract.md 后重验）');
  }

  // 3.5 OpenSpec 技能（openspec init 生成于 .agents/skills；技能可见性静态代理）
  const skillDir = path.join(TARGET, '.agents', 'skills', 'openspec-propose');
  if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) record('PASS', 'OpenSpec 技能', '.agents/skills/openspec-propose 存在');
  else record('WARN', 'OpenSpec 技能', '未生成（openspec init 后重启 Codex；或检查 .agents/skills/openspec-*）');

  // 4. codegraph CLI
  if (hasCmd('codegraph')) record('PASS', 'codegraph CLI', '已安装');
  else record('FAIL', 'codegraph CLI', '未安装（bootstrap-env.js 步骤 2）');

  // 5. codegraph 项目索引（深度：status 解析）
  const cgStatus = tryCmd('codegraph status 2>&1', TARGET);
  if (cgStatus.ok && /up to date|indexed/i.test(cgStatus.out)) {
    const m = cgStatus.out.match(/up to date|indexed \d+ files/i);
    record('PASS', 'codegraph 索引', 'status: ' + (m ? m[0] : 'ok'));
  } else if (fs.existsSync(path.join(TARGET, '.codegraph'))) {
    record('WARN', 'codegraph 索引', '.codegraph 存在但 status 未确认（重跑 codegraph init/status）');
  } else {
    record('FAIL', 'codegraph 索引', '未建（install-mechanism.js 步骤 3 应已 codegraph init）');
  }

  // 6. fastctx
  if (hasCmd('fastctx')) {
    const fx = tryCmd('fastctx status 2>&1', TARGET);
    if (fx.ok && /PASS|ok|enabled/i.test(fx.out)) record('PASS', 'fastctx', 'status 正常');
    else record('WARN', 'fastctx', 'CLI 在但 status 未全 PASS（重启 Codex 后再验）');
  } else record('FAIL', 'fastctx', '未安装（bootstrap-env.js 步骤 1）');

  // 7. config.toml MCP 段
  if (fs.existsSync(CODEX_CONFIG)) {
    const cfg = fs.readFileSync(CODEX_CONFIG, 'utf8');
    const f = cfg.includes('[mcp_servers.fastctx]');
    const c = cfg.includes('[mcp_servers.codegraph]');
    if (f && c) record('PASS', 'config.toml MCP 段', 'fastctx + codegraph 均已配置');
    else record('WARN', 'config.toml MCP 段', `fastctx=${f} codegraph=${c}（缺失项用 bootstrap-env.js 补齐）`);
  } else record('FAIL', 'config.toml', '~/.codex/config.toml 不存在');

  // 8. 门禁产物（ci-hardening 脚手架渲染结果；缺失/旧版串行双跑 → FAIL）
  const qgPath = path.join(TARGET, '.github', 'workflows', 'quality-gate.yml');
  const qgatesPath = path.join(TARGET, '.quality-gates.md');
  if (fs.existsSync(qgPath) && fs.existsSync(qgatesPath)) {
    const qg = fs.readFileSync(qgPath, 'utf8');
    const hasParallel = qg.includes('static-gates') && qg.includes('unit-tests');
    const hasLegacyTrigger = qg.includes('branches-ignore');
    const hasPlaceholder = /{{[A-Z_]+}}/.test(qg);
    if (hasParallel && !hasLegacyTrigger && !hasPlaceholder) {
      record('PASS', '门禁产物', 'quality-gate.yml 并行版 + .quality-gates.md（无旧双跑触发/无占位符）');
    } else {
      const why = hasLegacyTrigger ? '仍含 branches-ignore 旧双跑触发' : hasPlaceholder ? '含未替换占位符 {{VARS}}' : '缺 static-gates/unit-tests 并行 job';
      record('FAIL', '门禁产物', 'quality-gate.yml ' + why + '（重跑 install-mechanism.js 或 apply-ci-hardening.js）');
    }
  } else {
    record('FAIL', '门禁产物', '缺 quality-gate.yml 或 .quality-gates.md（install-mechanism.js 应已生成）');
  }

  // 9. CCG 双模型认证（WARN 不阻塞）
  // wrapper 检测：优先文件存在性（Windows 常见路径），再退命令存在性（避免误报）
  const wrapperFiles = [
    path.join(HOME, '.claude', 'bin', 'codeagent-wrapper.exe'),
    path.join(HOME, '.claude', 'bin', 'codeagent-wrapper'),
    '/usr/local/bin/codeagent-wrapper',
  ];
  const wrapperExists = wrapperFiles.some((f) => fs.existsSync(f)) || hasCmd('codeagent-wrapper');
  const authChecks = [];
  if (wrapperExists) authChecks.push('codeagent-wrapper ✅');
  else authChecks.push('codeagent-wrapper ❌');
  authChecks.push(hasCmd('claude') ? 'claude ✅' : 'claude ❌');
  authChecks.push(hasCmd('gemini') ? 'gemini ✅' : 'gemini ❌');
  authChecks.push(hasCmd('antigravity') ? 'antigravity ✅' : 'antigravity ❌');
  record('WARN', 'CCG 双模型认证', authChecks.join(' | '));
  // 配置指引（帮助用户补认证）
  if (!wrapperExists) console.log('      → codeagent-wrapper: 运行 npx ccg-workflow 生成');
  if (!hasCmd('claude')) console.log('      → Claude Code: npm i -g @anthropic-ai/claude-code 后 claude login');
  if (!hasCmd('gemini')) console.log('      → Gemini CLI: 官方安装后登录（认证后 gemini 可用）');
  if (!hasCmd('antigravity')) console.log('      → antigravity CLI: 官方安装后登录');
  console.log('      （认证缺失时 CCG 退化为单模型 + 子代理，机制文本仍生效）');

  // 汇总
  const fails = results.filter((r) => r.level === 'FAIL');
  const warns = results.filter((r) => r.level === 'WARN');
  console.log(`\n汇总: PASS ${results.length - fails.length - warns.length} | WARN ${warns.length} | FAIL ${fails.length}`);
  if (fails.length) {
    console.log('❌ 存在 FAIL 项，未完成。修复后重跑: node verify-env.js <项目>');
    process.exitCode = 1;
  } else {
    console.log(warns.length ? '✅ 无 FAIL；WARN 项请按提示处理（认证/重启后重验）。' : '✅ 全部 PASS。');
  }
}

check();