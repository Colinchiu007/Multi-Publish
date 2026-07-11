/**
 * 质量节拍 pre-commit 钩子
 *
 * 检查：
 * 1. 改动的源文件必须有对应的测试文件
 * 2. 测试必须能通过
 * 3. 不允许直接 commit 到 main 分支
 * 4. 路径变更必须使用 path-utils（禁止 4 级 .. 模式）
 * 5. 无硬编码绝对路径
 *
 * 安装：在项目根目录运行 node .husky/install.js
 * 跳过：git commit --no-verify（不推荐）
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BRANCH_PROTECTED = "main";
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
const PATH_UTILS_REQUIRED = /^apps\/desktop\/electron\/services\/(?!path-utils\.js).*\.js$/;
const FORBIDDEN_PATH_PATTERN = /['"]\.\.['"],\s*['"]\.\.['"],\s*['"]\.\.['"],\s*['"]\.\.['"]/;
const HARDCODED_ABSOLUTE_PATH = /['"][A-Z]:\\[^'"]+['"]|['"]\/home\/[^'"]+['"]|['"]\/opt\/[^'"]+['"]/;

function run(cmd, opts) {
  opts = opts || {};
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (e) {
    return "";
  }
}

function findTestFile(srcFile) {
  const ext = path.extname(srcFile);
  const marker = TEST_MARKERS[ext];
  if (!marker) return null;

  const dir = path.dirname(srcFile);
  const base = path.basename(srcFile, ext);

  if (base.endsWith(".test") || base.endsWith(".spec")) return true;

  for (const td of TEST_DIRS) {
    const candidate = path.join(dir, td, base + marker);
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const td of TEST_DIRS) {
    const candidate = path.join(td, base + marker);
    if (fs.existsSync(candidate)) return candidate;
  }

  var pkgMatch = srcFile.match(/^(packages\/[^\/]+)\/src\/(.+)$/);
  if (pkgMatch) {
    for (const td of TEST_DIRS) {
      const candidate = path.join(pkgMatch[1], td, base + marker);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  const flat = path.join(dir, base + marker);
  if (fs.existsSync(flat)) return flat;

  return null;
}

let hasError = false;
const errors = [];

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch === BRANCH_PROTECTED) {
  errors.push("\u2757 禁止直接提交到 " + BRANCH_PROTECTED + " 分支。请先切换到 feature 分支。");
  hasError = true;
}

const staged = run("git diff --cached --name-only --diff-filter=ACMR")
  .split("\n")
  .filter(Boolean);

for (const file of staged) {
  const isSrc = SRC_PATTERNS.some(function (p) { return p.test(file); });
  if (!isSrc) continue;

  const testFile = findTestFile(file);
  if (!testFile) {
    errors.push("\u2757 " + file + " 没有对应的测试文件。请先创建测试再提交。");
    hasError = true;
  }

  // 路径安全检查：electron/services 下的文件必须使用 path-utils
  if (PATH_UTILS_REQUIRED.test(file)) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (FORBIDDEN_PATH_PATTERN.test(content)) {
        errors.push("\u274c " + file + " 使用了 4 级 '..' 路径模式，必须改用 path-utils.js");
        hasError = true;
      }
      if (HARDCODED_ABSOLUTE_PATH.test(content)) {
        errors.push("\u274c " + file + " 包含硬编码绝对路径，必须改用环境变量或 path-utils");
        hasError = true;
      }
    }
  }
}

if (hasError) {
  console.error("\n\u{1F534} 质量节拍 pre-commit 检查未通过：\n");
  errors.forEach(function (e) { console.error(e); });
  console.error("\n提示：先创建测试文件，或用 git commit --no-verify 跳过（不推荐）");
  process.exit(1);
} else {
  console.log("\u2705 质量节拍 pre-commit 检查通过");
}