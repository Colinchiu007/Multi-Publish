/**
 * 质量节拍 — 通用 pre-commit 钩子
 *
 * 检查：
 * 1. 改动的源文件必须有对应的测试文件
 * 2. 禁止直接提交到 main 分支
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

  // 同目录下找 test/ 子目录
  for (const td of CONFIG.testDirs) {
    const candidate = path.join(dir, td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 项目根 tests/ 下找
  for (const td of CONFIG.testDirs) {
    const candidate = path.join(td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 平级测试文件
  const flat = path.join(dir, `${base}${marker}`);
  if (fs.existsSync(flat)) return flat;

  return null;
}

// ── 主逻辑 ──
let hasError = false;
const errors = [];

// 1. 检查分支
const branch = run("git rev-parse --abbrev-ref HEAD");
if (CONFIG.protectedBranches.includes(branch)) {
  errors.push(`❌ 禁止直接提交到 ${branch} 分支。请先切换到 feature 分支。`);
  hasError = true;
}

// 2. 检查改动的源文件是否有测试
const staged = run("git diff --cached --name-only --diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);

for (const file of staged) {
  const isSrc = CONFIG.srcPatterns.some((p) => p.test(file));
  if (!isSrc) continue;

  // 跳过测试文件本身
  const ext = path.extname(file);
  const marker = CONFIG.testMarkers[ext];
  if (marker && file.includes(marker)) continue;

  const testFile = findTestFile(file);
  if (!testFile) {
    errors.push(`❌ ${file}\n    没有对应的测试文件。请先创建测试再提交。`);
    hasError = true;
  }
}

// 3. 输出
if (hasError) {
  console.error("\n🔴 质量节拍 pre-commit 检查未通过：\n");
  errors.forEach((e) => console.error(e));
  console.error(`\n提示：先补充测试文件，或用 git commit --no-verify 跳过（不推荐）`);
  process.exit(1);
} else {
  console.log("✅ 质量节拍 pre-commit 检查通过");
}
