#!/usr/bin/env node
/**
 * 质量节拍 — CCG 质量门禁（独立可执行版）
 *
 * 用途：把 CCG 门禁接进已有的 pre-commit 钩子，而不替换那个钩子。
 * 本文件只负责 CCG 三道门禁，不含质量节拍自身的分支保护/测试存在性检查，
 * 那些由各项目原有的钩子负责。
 *
 * 门禁力度（与 quality-rhythm/installer/husky/pre-commit.js 保持一致）：
 *   verify-change   --mode staged   仅告警（判定依赖仓库文档结构，新库易误判）
 *   verify-security                   阻断（严重/高危即拒绝提交）
 *   verify-quality                    仅告警（风格类）
 *
 * 用法：
 *   node scripts/ccg-gate.js
 *
 * 环境变量：
 *   CCG_SKILLS_DIR   指定 CCG 技能目录（默认依次尝试：$CCG_SKILLS_DIR
 *                    → <仓库同级>/ccg → ~/.claude/skills/ccg）
 *   SKIP_CCG_GATE=1  临时跳过全部 CCG 门禁
 *
 * 设计约束：
 *   - CCG 未安装时告警跳过，绝不因缺 CCG 阻断提交
 *   - 门禁白名单硬编码，override-refusal（frontmatter 名 hi）永不入链：
 *     该 skill 会改写会话历史中的模型输出，属越狱持久化工具
 *   - CCG 扫描器只认 .py/.js/.ts/.go/.java/.rs/.c/.cpp/.php
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CONFIG = {
  enabled: true,

  // ⛔ 白名单：刻意不包含 override-refusal
  allowedGates: [
    "verify-change",
    "verify-quality",
    "verify-security",
    "verify-module",
    "gen-docs",
  ],

  gates: [
    {
      name: "verify-change",
      args: ["--mode", "staged"],
      blocking: false,
      note: "文档同步与模块完整性审计（依赖仓库结构，新库可能误报）",
    },
    {
      name: "verify-security",
      args: [],
      blocking: true,
      note: "安全漏洞扫描（严重/高危即阻断）",
    },
    {
      name: "verify-quality",
      args: [],
      blocking: false,
      note: "代码质量指标（风格类，告警为主）",
    },
  ],

  // CCG 扫描器认识的扩展名；其余类型不在扫描范围
  scannableExts: new Set([
    ".py", ".js", ".ts", ".go", ".java", ".rs", ".c", ".cpp", ".php",
  ]),

  // 只检查本次提交涉及的源码文件，且最多检查这么多个（控制耗时）。
  // ⚠️ 刻意不按目录扫描：按目录扫会把仓库既有的历史问题算到本次提交头上，
  //    在有技术债的存量仓库里会导致每次提交都被拦，门禁直接失效。
  maxFiles: 20,
  timeoutMs: 60000,
};

/** 定位 CCG 技能目录；找不到返回 null（调用方据此跳过） */
function resolveCcgDir() {
  const home = process.env.USERPROFILE || os.homedir() || "";
  const candidates = [
    process.env.CCG_SKILLS_DIR,
    path.resolve(__dirname, "..", "ccg"),
    path.join(home, ".claude", "skills", "ccg"),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "run_skill.js"))) return dir;
    } catch (_) {
      /* 忽略不可访问的候选路径 */
    }
  }
  return null;
}

/** 校验门禁存在且在白名单内 */
function gateAvailable(ccgDir, gateName) {
  if (!CONFIG.allowedGates.includes(gateName)) return false;
  try {
    const dir = path.join(ccgDir, "tools", gateName, "scripts");
    return fs.readdirSync(dir).some((f) => f.endsWith(".js"));
  } catch (_) {
    return false;
  }
}

function gitStagedFiles() {
  const res = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf8",
  });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout.split("\n").filter(Boolean);
}

/**
 * 取本次提交涉及的源码文件（去重、上限 maxFiles）。
 * 只看"这次改了什么"，不看仓库里还欠着什么。
 */
function resolveTargetFiles(staged) {
  const files = [];
  for (const file of staged) {
    if (!CONFIG.scannableExts.has(path.extname(file).toLowerCase())) continue;
    if (!files.includes(file)) files.push(file);
    if (files.length >= CONFIG.maxFiles) break;
  }
  return files;
}

function runGate(ccgDir, gate, target) {
  const args = target ? [...gate.args, target] : [...gate.args];
  const res = spawnSync(
    process.execPath,
    [path.join(ccgDir, "run_skill.js"), gate.name, ...args],
    { encoding: "utf8", timeout: CONFIG.timeoutMs }
  );
  if (res.error) {
    return { name: gate.name, code: -1, output: `执行失败: ${res.error.message}`, blocking: gate.blocking };
  }
  const output = `${res.stdout || ""}${res.stderr || ""}`.trim();
  return {
    name: gate.name,
    code: res.status,
    output,
    blocking: res.status !== 0 && gate.blocking,
  };
}

function main() {
  if (!CONFIG.enabled) {
    console.log("   [CCG] 门禁已在 ccg-gate.js 的 CONFIG.enabled 中关闭。");
    return 0;
  }
  if (process.env.SKIP_CCG_GATE === "1") {
    console.log("   [CCG] 门禁已被 SKIP_CCG_GATE=1 跳过。");
    return 0;
  }

  const ccgDir = resolveCcgDir();
  if (!ccgDir) {
    console.log(
      "   [CCG] 未找到 CCG（run_skill.js），已跳过 CCG 门禁。" +
        "安装：npx ccg-workflow；或设置 CCG_SKILLS_DIR 后重试。"
    );
    return 0;
  }

  const staged = gitStagedFiles();
  const targetFiles = resolveTargetFiles(staged);

  const errors = [];
  const warnings = [];
  let passed = 0;

  for (const gate of CONFIG.gates) {
    if (!gateAvailable(ccgDir, gate.name)) {
      warnings.push(`CCG 门禁 ${gate.name} 不可用，已跳过。`);
      continue;
    }
    // verify-change --mode staged 自行读取暂存区，不需要路径
    const needsTarget = !gate.args.includes("--mode");
    if (needsTarget && targetFiles.length === 0) continue;

    const results = targetFiles.length
      ? targetFiles.map((f) => runGate(ccgDir, gate, f))
      : [runGate(ccgDir, gate, null)];

    const failed = results.filter((r) => r.code !== 0);
    if (failed.length === 0) {
      passed++;
      continue;
    }

    const detail = failed
      .map((r) => r.output.split("\n").slice(0, 12).join("\n"))
      .join("\n---\n");

    if (failed.some((r) => r.blocking)) {
      errors.push(`❌ CCG 门禁 ${gate.name} 未通过：\n${detail}`);
    } else {
      warnings.push(`⚠️ CCG 门禁 ${gate.name} 有告警（不阻断提交）：\n${detail}`);
    }
  }

  for (const w of warnings) console.log(`   ${w}`);

  if (errors.length) {
    console.error("\n🔴 CCG 质量门禁未通过：\n");
    errors.forEach((e) => console.error(e));
    console.error(
      "\n修复后重试；确认可放行时用 SKIP_CCG_GATE=1 git commit（不推荐）"
    );
    return 1;
  }

  if (passed) console.log(`   [CCG] 门禁已执行：${passed} 项通过`);
  return 0;
}

process.exit(main());
