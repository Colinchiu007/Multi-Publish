/**
 * 质量节拍 — 安装脚本
 *
 * 用法：node install.js [--force]
 *
 * 把 pre-commit 钩子安装到 .git/hooks/ 并创建 .quality-rhythm 标记。
 * 同时尝试在 AGENTS.md 末尾追加质量节拍段落（如果存在）。
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const HOOKS_DIR = path.join(PROJECT_ROOT, ".git", "hooks");
const HOOK_SRC = path.join(__dirname, "pre-commit.js");
const HOOK_DEST = path.join(HOOKS_DIR, "pre-commit");
const MARKER = path.join(PROJECT_ROOT, ".quality-rhythm");
const AGENTS_FILE = path.join(PROJECT_ROOT, "AGENTS.md");
const CLAUDE_CMDS = path.join(PROJECT_ROOT, ".claude", "commands");
const CURSOR_CMDS = path.join(PROJECT_ROOT, ".cursor", "commands");

const AGENTS_APPEND = `
## 强制质量流程

本项目受质量节拍 skill 管辖。所有需求变更、规划、开发、评审和测试，
**必须**遵循以下流程：

- 日常循环（每次编码）：source-driven-dev → TDD → incremental-impl → /review
- 阶段检查（每 Phase 结束）：verification-before-completion → /health → documentation-and-adrs
- 特殊场景（按需触发）：/investigate | /cso | defense-in-depth | ...

详细定义见 \`.codex/skills/质量节拍/SKILL.md\` 或 quality-rhythm skill。

违规后果：
- 跳过 TDD 直接写代码 = 代码不被接受
- 跳过 /review 直接合入 = 合入被拒绝
`;

// ── 主逻辑 ──
let ok = true;

// 1. 安装 pre-commit 钩子
try {
  if (!fs.existsSync(HOOKS_DIR)) {
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  }
  const hookContent = `#!/usr/bin/env node
/** 质量节拍 pre-commit 钩子（自动生成，勿手动修改） */
require("${HOOK_SRC.replace(/\\/g, "/")}");
`;
  fs.writeFileSync(HOOK_DEST, hookContent, "utf8");
  console.log("✅ pre-commit 钩子已安装");
} catch (err) {
  console.error("❌ pre-commit 钩子安装失败:", err.message);
  ok = false;
}

// 2. 创建 .quality-rhythm 标记
try {
  if (!fs.existsSync(MARKER)) {
    fs.writeFileSync(
      MARKER,
      "此项目受质量节拍 skill 管辖。\n",
      "utf8"
    );
  }
  console.log("✅ .quality-rhythm 标记已就绪");
} catch (err) {
  console.error("❌ .quality-rhythm 标记创建失败:", err.message);
  ok = false;
}

// 3. 追加 AGENTS.md（如果存在）
if (fs.existsSync(AGENTS_FILE)) {
  try {
    const content = fs.readFileSync(AGENTS_FILE, "utf8");
    if (!content.includes("质量节拍")) {
      fs.appendFileSync(AGENTS_FILE, AGENTS_APPEND, "utf8");
      console.log("✅ AGENTS.md 已追加强制流程段落");
    } else {
      console.log("ℹ️  AGENTS.md 已有质量节拍内容，跳过");
    }
  } catch (err) {
    console.error("❌ AGENTS.md 更新失败:", err.message);
    ok = false;
  }
} else {
  console.log("ℹ️  AGENTS.md 不存在，跳过");
}

// 4. 创建斜杠命令文件（Claude Code）
try {
  if (!fs.existsSync(CLAUDE_CMDS)) {
    fs.mkdirSync(CLAUDE_CMDS, { recursive: true });
  }
  const cmdContent = `# 质量节拍

按质量节拍 skill 执行：日常循环(4步) + 阶段检查(3步) + 特殊场景(按需触发)。

详细定义见质量节拍 skill（~/.agents/skills/质量节拍/SKILL.md）。
`;
  fs.writeFileSync(path.join(CLAUDE_CMDS, "质量节拍.md"), cmdContent, "utf8");
  console.log("✅ Claude Code 斜杠命令已创建");
} catch {
  console.log("ℹ️  .claude/commands 创建失败（非必须），跳过");
}

// 5. 创建斜杠命令文件（Cursor）
try {
  if (!fs.existsSync(CURSOR_CMDS)) {
    fs.mkdirSync(CURSOR_CMDS, { recursive: true });
  }
  const cmdContent = `# 质量节拍

按质量节拍 skill 执行：日常循环(4步) + 阶段检查(3步) + 特殊场景(按需触发)。

详细定义见质量节拍 skill（~/.agents/skills/质量节拍/SKILL.md）。
`;
  fs.writeFileSync(path.join(CURSOR_CMDS, "质量节拍.md"), cmdContent, "utf8");
  console.log("✅ Cursor 斜杠命令已创建");
} catch {
  console.log("ℹ️  .cursor/commands 创建失败（非必须），跳过");
}

console.log(ok ? "\n✅ 质量节拍安装完成" : "\n⚠️  部分安装失败，请检查上方错误信息");
process.exit(ok ? 0 : 1);
