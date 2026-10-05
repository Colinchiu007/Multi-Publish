#!/usr/bin/env node
/**
 * 质量节拍 — CCG 外部模型审查模式判定器（§5.6.1 分层设计 · 提交时层）
 *
 * 纯确定性计算，不调用任何外部模型，因此在 pre-commit 里是毫秒级的。
 * 它把 CCG 托管块里那三条「文字约定」变成可执行的判定：
 *
 *   变更 > 30 行                          → dual    双模型审查
 *   变更 ≤ 30 行但涉及 auth/数据库/加密    → dual    双模型审查
 *   变更 ≤ 30 行且低风险                   → single  只调一个模型
 *   S 复杂度 + 低风险（≤10 行且无敏感命中）  → skip    不调
 *
 * 深度双模型审查本身不在这里跑（那是 PR/CI 层的事），本脚本只负责：
 *   1. 算出模式与理由
 *   2. 把结论落盘到 .ccg/reviews/<sha>.json，供 PR 层与事后审计读取
 *
 * 用法：
 *   node scripts/ccg-review-decider.js              # 判定并落盘
 *   node scripts/ccg-review-decider.js --print      # 只打印，不落盘
 *   node scripts/ccg-review-decider.js --sha <sha>  # 指定 sha（PR 层用）
 *
 * 退出码恒为 0：判定结果不阻断提交（深度审查在 PR 层），阻断由那层负责。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

// ═══════════════════════════════════════════════════════════════════
//  规则配置
// ═══════════════════════════════════════════════════════════════════

const RULES = {
  // 变更行数阈值
  dualLineThreshold: 30, // > 此行数 → dual
  skipLineThreshold: 10, // ≤ 此行数且无敏感命中 → skip

  // 只统计源码文件的变更行数（文档/资源不计入复杂度）
  codeExtensions: new Set([
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte",
    ".py", ".go", ".java", ".kt", ".rs", ".rb", ".php", ".cs", ".c", ".cpp", ".h",
    ".sql", ".sh", ".bash", ".ps1", ".yaml", ".yml", ".toml", ".json", ".env",
  ]),

  // 敏感路径：命中即视为 auth / 数据库 / 加密相关
  sensitivePaths: [
    /(^|[\\/])auth([\\/]|\.|$)/i,
    /(^|[\\/])(login|logout|signin|signup|session|jwt|oauth|sso|permission|acl|rbac)([\\/]|\.|$)/i,
    /(^|[\\/])(crypto|cipher|encrypt|decrypt|hash|salt|password|passwd|secret|token|credential)([\\/]|\.|$)/i,
    /(^|[\\/])(migrations?|schema|alembic|db|migrations)([\\/]|\.|$)/i,
    /\.(sql|pem|key|p12|pfx|keystore)$/i,
  ],

  // 敏感内容：改动行里出现即视为敏感
  // ⚠️ 标识符前缀必须容忍下划线与 camelCase：\b 在 DB_PASSWORD / apiSecret 里
  //    都不成立（_ 和字母都算 \w），用 \b 会漏掉最常见的命名方式。
  sensitiveContents: [
    /[A-Za-z0-9_.-]*(password|passwd|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|credential)s?\s*[:=]/i,
    /(?:^|[^A-Za-z0-9_])(bcrypt|scrypt|argon2|pbkdf2|jwt|oauth|aes|des|rsa)\s*\(/i,
    /[A-Za-z0-9_]*(md5|sha1|sha256)\s*\(/i,
    /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/i,
    /(密钥|加密|解密|口令|密码|凭据|鉴权|授权)/,
  ],
};

// ═══════════════════════════════════════════════════════════════════
//  采集
// ═══════════════════════════════════════════════════════════════════

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
      ...opts,
    });
  } catch (_) {
    return null;
  }
}

/** 读取暂存区变更：文件 + 行数 + 改动内容 */
function collectStaged() {
  const numstat = git(["diff", "--cached", "--numstat"]);
  if (numstat === null) return null;

  const diff = git(["diff", "--cached", "-U0"]) || "";
  // 变更行内容：只取 + / - 开头的新增与删除行
  const changedLines = diff
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .map((l) => l.slice(1));

  const files = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [add, del, file] = line.split("\t");
      return {
        file,
        added: add === "-" ? null : Number(add),
        deleted: del === "-" ? null : Number(del),
      };
    });

  return { files, changedLines };
}

// ═══════════════════════════════════════════════════════════════════
//  判定
// ═══════════════════════════════════════════════════════════════════

function judge(staged) {
  const codeFiles = staged.files.filter((f) =>
    RULES.codeExtensions.has(path.extname(f.file).toLowerCase())
  );
  const changedLines = codeFiles.reduce(
    (sum, f) => sum + (f.added || 0) + (f.deleted || 0),
    0
  );

  // 敏感命中：路径 或 内容，任一即可
  const pathHits = codeFiles
    .map((f) => f.file)
    .filter((f) => RULES.sensitivePaths.some((re) => re.test(f)));
  const contentHits = staged.changedLines.filter((l) =>
    RULES.sensitiveContents.some((re) => re.test(l))
  );
  const sensitive = pathHits.length > 0 || contentHits.length > 0;

  let mode, reason;
  if (changedLines > RULES.dualLineThreshold) {
    mode = "dual";
    reason = `变更 ${changedLines} 行 > ${RULES.dualLineThreshold} 行阈值`;
  } else if (sensitive) {
    mode = "dual";
    const parts = [];
    if (pathHits.length) parts.push(`敏感路径 ${pathHits.slice(0, 3).join(", ")}`);
    if (contentHits.length) parts.push(`敏感内容 ${contentHits.length} 处`);
    reason = `变更 ${changedLines} 行（≤ ${RULES.dualLineThreshold}）但命中 auth/数据库/加密：${parts.join("；")}`;
  } else if (changedLines <= RULES.skipLineThreshold) {
    mode = "skip";
    reason = `变更 ${changedLines} 行 ≤ ${RULES.skipLineThreshold} 行且未命中敏感 → S 复杂度低风险`;
  } else {
    mode = "single";
    reason = `变更 ${changedLines} 行（≤ ${RULES.dualLineThreshold}）且低风险`;
  }

  return {
    mode,
    reason,
    stats: {
      changedLines,
      fileCount: staged.files.length,
      codeFileCount: codeFiles.length,
      sensitivePathHits: pathHits,
      sensitiveContentHits: contentHits.length,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
//  落盘（可审计）
// ═══════════════════════════════════════════════════════════════════

function saveRecord(result, sha) {
  const dir = path.join(process.cwd(), ".ccg", "reviews");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sha}.json`);
  const record = {
    sha,
    mode: result.mode,
    reason: result.reason,
    stats: result.stats,
    decidedAt: new Date().toISOString(),
    decidedBy: "ccg-review-decider",
    // 深度审查由 PR/CI 层执行；此处仅登记要求
    deepReview: {
      required: result.mode !== "skip",
      status: "pending",
      performedBy: null,
      findings: null,
    },
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
  return file;
}

function currentSha() {
  return (git(["rev-parse", "HEAD"]) || "").trim() || "unknown";
}

function detectBackends() {
  const wrapper =
    process.env.CODEAGENT_WRAPPER ||
    path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "bin", "codeagent-wrapper.exe");
  const exists = fs.existsSync(wrapper);
  return {
    wrapper,
    wrapperExists: exists,
    // 是否装了对应 CLI（只判断可执行文件在不在，不做认证探测——那要联网）
    claude: hasOnPath("claude"),
    opencode: hasOnPath("opencode"),
  };
}

function hasOnPath(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], {
    encoding: "utf8",
  });
  return r.status === 0 && !!r.stdout.trim();
}

// ═══════════════════════════════════════════════════════════════════
//  main
// ═══════════════════════════════════════════════════════════════════

function main() {
  const argv = process.argv.slice(2);
  const printOnly = argv.includes("--print");
  const shaIdx = argv.indexOf("--sha");
  const sha = shaIdx >= 0 && argv[shaIdx + 1] ? argv[shaIdx + 1] : currentSha();

  const staged = collectStaged();
  if (!staged) {
    console.log("   [CCG] 判定器无法读取 git 暂存区，跳过（不影响提交）");
    return 0;
  }
  if (staged.files.length === 0) {
    console.log("   [CCG] 暂存区无变更，跳过审查模式判定");
    return 0;
  }

  const result = judge(staged);
  const backends = detectBackends();

  console.log(`   [CCG] 审查模式判定: ${result.mode.toUpperCase()}`);
  console.log(`          ${result.reason}`);
  console.log(
    `          变更 ${result.stats.changedLines} 行 / ${result.stats.codeFileCount} 个源文件` +
      (result.stats.sensitivePathHits.length || result.stats.sensitiveContentHits
        ? ` / 敏感命中 ${result.stats.sensitivePathHits.length} 路径 + ${result.stats.sensitiveContentHits} 内容`
        : " / 无敏感命中")
  );

  if (result.mode === "skip") {
    console.log("          S 复杂度低风险，按 CCG 决策矩阵不调外部模型");
  } else {
    const available = ["claude", "opencode"].filter((b) => backends[b]);
    const target = result.mode === "dual" ? "双模型(claude + opencode)" : "单模型(claude)";
    if (available.length === 0) {
      console.log(`          ⚠ 要求 ${target} 深度审查，但两个后端 CLI 都不可用`);
      console.log("            → 降级为 SELF-REVIEW：必须由 agent 自行完成评审并记录结论");
    } else if (result.mode === "dual" && available.length < 2) {
      console.log(`          ⚠ 要求 ${target}，但仅 ${available.join("+")} 可用`);
      console.log("            → 降级为单后端 + 补一次 agent 自评");
    } else {
      console.log(`          要求 ${target} 深度审查，后端就绪（${available.join(" + ")}）`);
    }
    console.log("          → 深度审查在 PR/CI 层执行；本地提交只需完成确定性门禁");
  }

  if (!printOnly) {
    const f = saveRecord(result, sha);
    console.log(`          判定已落盘: ${path.relative(process.cwd(), f)}`);
  }
  return 0;
}

process.exit(main());
