/**
 * 质量节拍 — 一键安装器
 *
 * 用法（在目标项目根目录运行）：
 *   npx degit Colinchiu007/quality-rhythm/installer .husky-installer
 *   node .husky-installer/run.js
 *   rm -rf .husky-installer
 *
 * 或直接用 npx：
 *   npx github:Colinchiu007/quality-rhythm/installer
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

const PKG_ROOT = __dirname; // 安装器所在目录
const PROJECT_ROOT = path.resolve("."); // 目标项目根目录

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║    质量节拍 — 一键安装                   ║
║    为当前项目安装质量门禁                  ║
╚══════════════════════════════════════════╝
`);

  const repo = await ask("GitHub 仓库名（如 Colinchiu007/my-repo，跳过则不分支保护）: ");
  const mainBranch = await ask("主分支名（默认 main）: ") || "main";

  console.log("\n正在安装...\n");

  // ── 1. 创建 .quality-rhythm 标记 ──
  fs.writeFileSync(path.join(PROJECT_ROOT, ".quality-rhythm"), "此项目受质量节拍 skill 管辖。\n", "utf8");
  console.log("✅ .quality-rhythm 标记");

  // ── 2. 安装 pre-commit 钩子 ──
  const hookDir = path.join(PROJECT_ROOT, ".husky");
  fs.cpSync(path.join(PKG_ROOT, "husky"), hookDir, { recursive: true });

  // 运行 install.js
  execSync(`node "${path.join(hookDir, "install.js").replace(/\\/g, "/")}"`, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });

  // ── 3. 复制 CI 配置 ──
  const ghDir = path.join(PROJECT_ROOT, ".github", "workflows");
  fs.mkdirSync(ghDir, { recursive: true });
  fs.copyFileSync(
    path.join(PKG_ROOT, "github", "quality-gate.yml"),
    path.join(ghDir, "quality-gate.yml")
  );
  console.log("✅ .github/workflows/quality-gate.yml");

  // ── 4. 设置 GitHub 分支保护（需要 gh CLI） ──
  if (repo) {
    const protectionPath = path.join(PKG_ROOT, "github", "branch-protection.json");
    if (fs.existsSync(protectionPath)) {
      try {
        execSync(
          `gh api repos/${repo}/branches/${mainBranch}/protection --method PUT --input "${protectionPath.replace(/\\/g, "/")}"`,
          { stdio: "pipe" }
        );
        console.log(`✅ GitHub 分支保护已启用（${mainBranch}）`);
      } catch (e) {
        console.log("⚠️  分支保护设置失败（gh 未登录或仓库不存在）:", e.message.slice(0, 80));
      }
    }
  }

  // ── 5. 追加 .gitignore 豁免 ──
  const gitignore = path.join(PROJECT_ROOT, ".gitignore");
  if (fs.existsSync(gitignore)) {
    const content = fs.readFileSync(gitignore, "utf8");
    if (!content.includes("quality-rhythm")) {
      fs.appendFileSync(gitignore, "\n# 质量节拍 skill 文件\n!.codex/skills/质量节拍/\n", "utf8");
      console.log("✅ .gitignore 已添加豁免规则");
    }
  }

  console.log(`
╔══════════════════════════════════════════╗
║   ✅  安装完成                           ║
║                                          ║
║  后续操作：                               ║
║  1. 提交并推送所有变更                     ║
║  2. PR 到 ${mainBranch} 分支即可触发质量门禁   ║
║                                          ║
║  日常使用：                               ║
║  - git commit 时自动检查测试文件           ║
║  - git push 后 CI 自动跑质量门禁           ║
║  - PR 合并前必须通过质量门禁 + 审查         ║
╚══════════════════════════════════════════╝
`);

  rl.close();
}

main().catch((err) => {
  console.error("安装失败:", err);
  process.exit(1);
});
