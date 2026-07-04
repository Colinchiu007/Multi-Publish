/**
 * 安装质量节拍 git hooks
 * 在项目根目录运行：node .husky/install.js
 */

const fs = require("fs");
const path = require("path");

const HOOKS_DIR = path.join(__dirname, "..", ".git", "hooks");
const HOOK_SRC = path.join(__dirname, "pre-commit.js");
const HOOK_DEST = path.join(HOOKS_DIR, "pre-commit");

// 创建 pre-commit 钩子（shell 包装，调用 Node.js 脚本）
const hookContent = `#!/usr/bin/env node
/**
 * 质量节拍 pre-commit 钩子（自动生成，勿手动修改）
 * 安装脚本：.husky/install.js
 */
require("${HOOK_SRC.replace(/\\/g, "/")}");
`;

try {
  fs.writeFileSync(HOOK_DEST, hookContent, "utf8");
  // Windows 上不需要 chmod +x，git 会自动处理
  console.log("✅ 质量节拍 pre-commit 钩子已安装");
} catch (err) {
  console.error("❌ 安装失败:", err.message);
  process.exit(1);
}
