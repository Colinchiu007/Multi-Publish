/**
 * 质量节拍 pre-commit 钩子
 *
 * 检查：
 * 1. 改动的源文件必须有对应的测试文件
 * 2. 测试必须能通过
 * 3. 不允许直接 commit 到 main 分支
 *
 * 安装：在项目根目录运行 node .husky/install.js
 * 跳过：git commit --no-verify（不推荐）
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── 配置 ──────────────────────────────────────────────────────────
const BRANCH_PROTECTED = "main"; // 禁止直接提交的分支
const SRC_PATTERNS = [
  /^apps\/desktop\/src\/.*\.(vue|js|ts|tsx)$/,
  /^apps\/desktop\/electron\/.*\.(js|ts)$/,
  /^packages\/.*\/src\/.*\.(js|ts|tsx|vue)$/,
  /^packages\/.*\/.*\.py$/,
];
const TEST_MARKERS = {
  ".js": ".test.js",
  ".ts": ".test.ts",
  ".tsx": ".test.tsx",
  ".vue": ".test.js",
  ".py": "_test.py",
};
const TEST_DIRS = ["tests", "__tests__", "test"];

// ── 工具函数 ───────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch {
    return "";
  }
}

function findTestFile(srcFile) {
  const ext = path.extname(srcFile);
  const marker = TEST_MARKERS[ext];
  if (!marker) return null;

  const dir = path.dirname(srcFile);
  const base = path.basename(srcFile, ext);

  // 同目录下找测试
  for (const td of TEST_DIRS) {
    const candidate = path.join(dir, td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 项目根 tests/ 下找
  for (const td of TEST_DIRS) {
    const candidate = path.join(td, `${base}${marker}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // 平级测试文件（.test.js 在同目录）
  const flat = path.join(dir, `${base}${marker}`);
  if (fs.existsSync(flat)) return flat;

  return null;
}

// ── 主逻辑 ─────────────────────────────────────────────────────────
let hasError = false;
const errors = [];

// 1. 检查分支
const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch === BRANCH_PROTECTED) {
  errors.push(
    `❌ 禁止直接提交到 ${BRANCH_PROTECTED} 分支。请先切换到 feature 分支。`
  );
  hasError = true;
}

// 2. 检查改动的源文件是否有测试
const staged = run("git diff --cached --name-only --diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);

for (const file of staged) {
  const isSrc = SRC_PATTERNS.some((p) => p.test(file));
  if (!isSrc) continue;

  const testFile = findTestFile(file);
  if (!testFile) {
    errors.push(
      `❌ ${file} 没有对应的测试文件。请先创建测试再提交。`
    );
    hasError = true;
  }
}

// 3. 输出结果
if (hasError) {
  console.error("\n🔴 质量节拍 pre-commit 检查未通过：\n");
  errors.forEach((e) => console.error(e));
  console.error(
    `\n提示：先创建测试文件，或用 git commit --no-verify 跳过（不推荐）`
  );
  process.exit(1);
} else {
  console.log("✅ 质量节拍 pre-commit 检查通过");
}
