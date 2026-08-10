#!/usr/bin/env node
/**
 * apply-ci-hardening — ci-hardening skill 脚手架（C）
 * 把 assets/templates 里的参数化模板渲染到目标仓库：
 *   - quality-gate.yml（并行 QG + 触发去重）
 *   - quality-gates.md（本地提交门禁）
 *   - electron-ci.yml（可选，仅 --with-electron 或 config.electron）
 * 用法：
 *   node apply-ci-hardening.js --repo <path> [--config <file>] [--with-electron] [--dry-run]
 * 配置：默认值见 DEFAULTS；可在目标仓库放 ci-hardening.config.json 或 --config 传入覆盖。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(SKILL_ROOT, 'assets', 'templates');

// 中性默认值（跨项目通用）；项目特有路径/命令通过 ci-hardening.config.json 覆盖。
// Multi-Publish 参考覆盖示例见 references/methodology.md「新项目应用」。
const DEFAULTS = {
  DEFAULT_BRANCH: 'main',
  RUNNER_OS: 'ubuntu-latest',
  NODE_VERSION: '22',
  PACKAGE_MANAGER: 'npm',
  INSTALL_CMD: 'npm ci',
  TSC_CMD: 'npx tsc --noEmit',
  JS_SYNTAX_ROOT: 'src',
  SECRETS_SCAN_CMD: 'echo "add your secrets scan command"',
  IPC_CHECK_CMD: 'echo "add your ipc bridge check command"',
  UNIT_TIMEOUT: 40,
  PM_BIN: 'npm',
  UNIT_ARGS: '"run","test","--workspaces","--if-present"',
  STARTUP_SMOKE_CMD: 'echo "add your startup smoke command"',
  COVERAGE_CMD: 'echo "add your coverage command"',
  VISUAL_CMD: 'echo "add your visual regression command"',
  VISUAL_ARTIFACTS: '**/visual-testing/reports/**',
  E2E_CMD: 'echo "add your e2e command"',
  E2E_ARTIFACTS: '**/e2e/reports/**',
  PLAYWRIGHT_INSTALL_CMD: 'npx playwright install chromium',
  ELECTRON_ARTIFACT: 'electron-v43.1.1-linux-x64.zip',
  ELECTRON_CHECKSUM: 'REPLACE_ME',
  ELECTRON_MIRROR: 'https://cdn.npmmirror.com/binaries/electron/',
  ELECTRON_REBUILD_CMD: 'npx @electron/rebuild -f -w <native-module>',
  SKIP_ENV_LINE: '',
  VITEST_CMD: 'npm test',
  DESKTOP_WORKSPACE_DIR: 'apps/desktop',
  TEST_COMMAND: 'npm test',
  COVERAGE_THRESHOLD: '40',
};

function parseArgs(argv) {
  const args = { repo: null, config: null, withElectron: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') args.repo = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--with-electron') args.withElectron = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function loadConfig(args) {
  const cfg = {};
  const candidates = [];
  if (args.config) candidates.push(args.config);
  if (args.repo) candidates.push(path.join(args.repo, 'ci-hardening.config.json'));
  for (const c of candidates) {
    if (c && fs.existsSync(c)) Object.assign(cfg, JSON.parse(fs.readFileSync(c, 'utf8')));
  }
  if (args.withElectron) cfg.electron = true;
  return cfg;
}

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo) {
    console.error('用法: node apply-ci-hardening.js --repo <path> [--config <file>] [--with-electron] [--dry-run]');
    process.exit(1);
  }
  const repo = path.resolve(args.repo);
  if (!fs.existsSync(path.join(repo, '.git')) && !fs.existsSync(path.join(repo, 'package.json'))) {
    console.error('目标不是仓库根（缺少 .git 或 package.json）:', repo);
    process.exit(1);
  }
  const vars = { ...DEFAULTS, ...loadConfig(args) };
  const outputs = [
    {
      file: path.join(repo, '.github', 'workflows', 'quality-gate.yml'),
      tpl: 'quality-gate.yml.tpl',
    },
    { file: path.join(repo, '.quality-gates.md'), tpl: 'quality-gates.md.tpl' },
  ];
  if (vars.electron) {
    outputs.push({ file: path.join(repo, '.github', 'workflows', 'electron-ci.yml'), tpl: 'electron-ci.yml.tpl' });
  }

  let wrote = 0;
  for (const out of outputs) {
    const tplPath = path.join(TEMPLATE_DIR, out.tpl);
    if (!fs.existsSync(tplPath)) { console.error('缺少模板:', tplPath); process.exit(1); }
    const content = render(fs.readFileSync(tplPath, 'utf8'), vars);
    if (args.dryRun) {
      console.log('[dry-run]', out.file, `(${content.split('\n').length} 行)`);
    } else {
      fs.mkdirSync(path.dirname(out.file), { recursive: true });
      fs.writeFileSync(out.file, content, 'utf8');
      console.log('写入', out.file);
    }
    wrote++;
  }
  if (args.dryRun) return;

  console.log('\n已完成 ' + wrote + ' 个文件。下一步（M3 契约同步法）:');
  console.log('1. 全仓 grep 契约测试：', 'grep -rn "quality-gate" .github/scripts/ */tests/ 2>/dev/null');
  console.log('2. 替换模板中的 REPLACE_ME 与占位命令（secret scan/coverage/visual/e2e/startup smoke）');
  console.log('3. 本地跑契约测试（node --test .github/scripts/*.test.js 等）');
  console.log('4. 分支 + PR，PR 自身 CI 验证并行 QG（观察 job 并行与时长）');
  console.log('5. 文档/CHANGELOG/learnings 同步');
}

main();
