/**
 * 质量节拍 — 通用 pre-commit 钩子（自动化版 v2）
 *
 * 检查（自动执行真实命令，无需人工勾选清单）：
 * 1. 禁止直接提交到 protected 分支
 * 2. 改动的源文件必须有对应的测试文件
 * 3. 自动质量检查：
 *    - staged .js/.ts/.tsx/.mjs/.cjs 语法检查（node --check）
 *    - staged 文本内容密钥/敏感信息扫描（高置信模式）
 * 4. 自动生成/更新 .quality-gates.md「本次执行记录」审计记录
 *    （自动勾选已通过的检查项并附证据，随本次提交一起 git add）
 *
 * 深度验证（测试运行/覆盖率/视觉/E2E/安全）由 CI quality-gate 自动执行，
 * 本地钩子只做快速、可机器验证的检查。
 *
 * 使用方式：node .husky/install.js
 * 跳过：git commit --no-verify（不推荐）
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════════
//  配置区 — 可根据项目需求修改
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  // 禁止直接提交的分支列表
  protectedBranches: ["main", "master", "production"],

  // 源文件匹配模式（匹配到的文件必须有测试）
  srcPatterns: [
    /^src\/.*\.(vue|js|ts|tsx)$/,
    /^app\/.*\.(vue|js|ts|tsx)$/,
    /^packages\/.*\/src\/.*\.(js|ts|tsx|vue)$/,
    /^electron\/.*\.(js|ts)$/,
    /^server\/.*\.(js|ts|py)$/,
    /^.*\.(py)$/,
  ],

  // 测试文件命名规则
  testMarkers: {
    ".js": ".test.js",
    ".ts": ".test.ts",
    ".tsx": ".test.tsx",
    ".vue": ".test.js",
    ".py": "_test.py",
    ".jsx": ".test.jsx",
  },

  // 测试文件查找目录
  testDirs: ["tests", "__tests__", "test", "spec"],

  // 质量门禁文件（缺失时仅 WARN，不阻塞——兼容未初始化项目）
  gatesFile: ".quality-gates.md",
  // 执行记录节标题（模板结构：## 本次执行记录）
  recordMarker: "## 本次执行记录",

  // 语法检查的文件扩展名（node --check）
  syntaxExts: [".js", ".ts", ".tsx", ".mjs", ".cjs"],
  // 密钥扫描排除文件（占位/说明类文件不扫描）
  secretScanExcludes: [/\.quality-gates\.md$/, /\.env\.example$/, /\.example\./i, /\.md$/, /\.lock$/, /\.json$/, /\.ya?ml$/, /\.toml$/],
  // 高置信密钥模式（命中即 FAIL，避免通用 key=value 误报）
  secretPatterns: [
    /ghp_[A-Za-z0-9]{36}/,
    /gho_[A-Za-z0-9]{36}/,
    /ghu_[A-Za-z0-9]{36}/,
    /github_pat_[A-Za-z0-9_]{22,}/,
    /sk-[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z0-9 ]+ PRIVATE KEY-----/,
  ],
};

// ═══════════════════════════════════════════════════════════════════
//  逻辑（通常不需要改）
// ═══════════════════════════════════════════════════════════════════

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch {
    return "";
  }
}

function findTestFile(srcFile) {
  const ext = path.extname(srcFile);
  const marker = CONFIG.testMarkers[ext];
  if (!marker) return null;

  const dir = path.dirname(srcFile);
  const base = path.basename(srcFile, ext);

  for (const td of CONFIG.testDirs) {
    const candidate = path.join(dir, td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const td of CONFIG.testDirs) {
    const candidate = path.join(td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  const flat = path.join(dir, `${base}${marker}`);
  if (fs.existsSync(flat)) return flat;

  return null;
}

function quoteArg(p) {
  return `"${String(p).replace(/"/g, '\\"')}"`;
}

// ── 主逻辑 ──
let hasError = false;
const errors = [];
const passedChecks = [];

let branch = run("git rev-parse --abbrev-ref HEAD");
if (!branch) {
  // root-commit 或非标准环境：从 .git/HEAD 解析（ref: refs/heads/xxx）
  try {
    const head = fs.readFileSync(path.join(process.cwd(), ".git", "HEAD"), "utf8").trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    if (m) branch = m[1];
  } catch (_) {}
}

// 1. 分支保护
if (CONFIG.protectedBranches.includes(branch)) {
  errors.push(`❌ 禁止直接提交到 ${branch} 分支。请先切换到 feature 分支。`);
  hasError = true;
} else {
  passedChecks.push(`分支合规（${branch}）`);
}

const staged = run("git diff --cached --name-only --diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);

// 2. 源文件必须有测试
let srcCount = 0;
for (const file of staged) {
  const isSrc = CONFIG.srcPatterns.some((p) => p.test(file));
  if (!isSrc) continue;

  const ext = path.extname(file);
  const marker = CONFIG.testMarkers[ext];
  if (marker && file.includes(marker)) continue;

  const testFile = findTestFile(file);
  if (!testFile) {
    errors.push(`❌ ${file}\n    没有对应的测试文件。请先创建测试再提交。`);
    hasError = true;
  } else {
    srcCount++;
  }
}
if (srcCount > 0) passedChecks.push(`变更的 ${srcCount} 个源文件均有对应测试`);

// 3a. 语法检查（staged js/ts 文件）
const syntaxFiles = staged.filter((f) => CONFIG.syntaxExts.includes(path.extname(f)));
let syntaxOkCount = 0;
for (const f of syntaxFiles) {
  try {
    execSync(`node --check ${quoteArg(f)}`, { stdio: "pipe", encoding: "utf8" });
    syntaxOkCount++;
  } catch (e) {
    errors.push(`❌ 语法错误 ${f}\n    ${String(e.stderr || e.message).split("\n").slice(0, 3).join("\n    ")}`);
    hasError = true;
  }
}
if (syntaxOkCount > 0) passedChecks.push(`语法检查通过（node --check ${syntaxOkCount} 个文件）`);

// 3b. 密钥/敏感信息扫描（高置信模式；排除占位/文档文件）
const scanFiles = staged.filter((f) => {
  const lower = f.toLowerCase();
  if (CONFIG.secretScanExcludes.some((re) => re.test(lower))) return false;
  const txt = /\.(js|ts|tsx|jsx|vue|py|sh|bat|ps1|txt|conf|ini|cfg|html|css|scss|env|properties)$/i;
  return txt.test(lower) || !path.extname(lower);
});
let secretHits = 0;
for (const f of scanFiles) {
  let content = "";
  try { content = fs.readFileSync(f, "utf8"); } catch { continue; }
  for (const re of CONFIG.secretPatterns) {
    const m = content.match(re);
    if (m) {
      secretHits++;
      errors.push(`❌ 检测到疑似密钥/敏感信息：${f}\n    模式: ${re.toString()}\n    命中片段: ${m[0].slice(0, 24)}***（请改用环境变量/配置）`);
      hasError = true;
    }
  }
}
if (secretHits === 0 && scanFiles.length > 0) {
  passedChecks.push(`密钥扫描通过（${scanFiles.length} 个文件，${CONFIG.secretPatterns.length} 个高置信模式）`);
}

// 4. 自动生成审计记录（仅全部通过时）
if (!hasError) {
  const gatesAbs = path.join(process.cwd(), CONFIG.gatesFile);
  if (fs.existsSync(gatesAbs)) {
    let text = fs.readFileSync(gatesAbs, "utf8");
    const date = new Date().toISOString().slice(0, 10);
    const title = `## ${date} ${branch} ${staged.length} 个文件 提交前自检（自动）`;
    const recIdx = text.indexOf(CONFIG.recordMarker);
    const recordBody = passedChecks.map((c) => `- [x] ${c}`).join("\n") + "\n- [x] 深度验证（测试/覆盖率/视觉/E2E/安全）由 CI quality-gate 自动执行\n";

    let appended = false;
    if (recIdx >= 0) {
      const sec = text.slice(recIdx + CONFIG.recordMarker.length);
      if (!sec.includes(title)) {
        // 追加到「本次执行记录」节末尾（最新记录在最后，时间倒序清晰）
        text = text.slice(0, recIdx + CONFIG.recordMarker.length) + "\n" + sec.trimEnd() + "\n\n" + title + "\n" + recordBody;
        appended = true;
      }
    } else {
      text += `\n\n## 本次执行记录\n\n${title}\n${recordBody}`;
      appended = true;
    }
    if (appended) {
      fs.writeFileSync(gatesAbs, text, "utf8");
      run(`git add ${quoteArg(CONFIG.gatesFile)}`);
      console.log(`📝 已自动更新 ${CONFIG.gatesFile}（${date} ${branch} 审计记录，随提交入库）`);
    }
  } else {
    console.warn("⚠️ 未找到 .quality-gates.md，跳过审计记录生成（建议先运行 install-mechanism.js 初始化）");
  }
}

// 5. 输出
if (hasError) {
  console.error("\n🔴 质量节拍 pre-commit 检查未通过：\n");
  errors.forEach((e) => console.error(e));
  console.error(`\n提示：修复上述问题，或用 git commit --no-verify 跳过（不推荐）`);
  process.exit(1);
} else {
  console.log(`✅ 质量节拍 pre-commit 检查通过（${passedChecks.length} 项自动验证）`);
  passedChecks.forEach((c) => console.log(`   - ${c}`));
}
