#!/usr/bin/env node
/**
 * 质量节拍 — CCG 深度双模型审查驱动（§5.6.2 分层设计 · PR/CI 层）
 *
 * 提交时（pre-commit）由 ccg-review-decider.js 做确定性判定，产出
 *   .ccg/reviews/<sha>.json  { mode: dual | single | skip, ... }
 * 本脚本在 PR/CI 层消费那个 mode，真正跑对抗评审循环。
 *
 * 分工：
 *   提交时  毫秒~秒级  三道确定性门禁 + 模式判定（不调外部模型）
 *   PR/CI   分钟级     本脚本：双模型多轮对抗审查
 *
 * 收敛出口有三条（第三条是本次新增的自扮演裁决）：
 *   1. 分数达标           → converged
 *   2. stall / 轮次耗尽   → 自扮演裁决（避免 CI 里"等人"= 超时失败）
 *   3. 自扮演也不可用     → escalated（给人）
 *      └ 高危域（auth / 加密 / 数据库迁移）不允许自扮演豁免，必须外部复核
 *
 * 用法：
 *   node scripts/ccg-deep-review.js [--sha <sha>] [--base <ref>] [--dry-run]
 *
 * 退出码：
 *   0  无阻断项
 *   1  存在阻断项（Critical 未解决，或高危域争议未获外部复核）
 *   2  自身错误（配置/环境问题）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

// ---------- 定位 ARL 引擎 ----------
// 本驱动可随仓库分发（vendor 到 scripts/），也可指向独立的 adversarial-review-loop。
// 解析顺序：$CCG_ARL_DIR → <repo>/scripts（就地 vendor）→ 已安装的 skill 目录
function resolveArlDir() {
  const home = process.env.USERPROFILE || os.homedir() || "";
  const candidates = [
    process.env.CCG_ARL_DIR,
    path.join(process.cwd(), "scripts"),
    path.join(home, ".claude", "skills", "adversarial-review-loop", "scripts"),
  ].filter(Boolean);
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, "engine.js")) && fs.existsSync(path.join(d, "model-call.js"))) {
      return d;
    }
  }
  return null;
}

const ARL_DIR = resolveArlDir();
if (!ARL_DIR) {
  console.error("找不到 adversarial-review-loop 引擎（engine.js / model-call.js）");
  console.error("请设置 CCG_ARL_DIR 指向引擎目录，或把引擎 vendor 到本仓库 scripts/ 下");
  process.exit(2);
}
const engine = require(path.join(ARL_DIR, "engine.js"));
const mc = require(path.join(ARL_DIR, "model-call.js"));

// ---------- 参数 ----------
function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const SHA = arg("--sha", "");
const BASE = arg("--base", "origin/main");
const DRY_RUN = process.argv.includes("--dry-run");
const REPO = process.cwd();

// ---------- 家族映射（与 references/family-check.md 保持一致）----------
const FAMILY_MAP = {
  claude: ["anthropic"], codex: ["openai"], gemini: ["google"],
  grok: ["xai"], kimi: ["moonshot"], opencode: ["deepseek", "hy3"],
};

// ---------- mode → 引擎配置 ----------
// 判定器已经算过复杂度，这里只做映射，不重复判定。
function cfgForMode(mode) {
  const base = {
    proposer: "opencode",
    critic: "claude",
    objectType: "code",
    maxRounds: 3,
    scoreThreshold: 8.0,
    dimensions: ["correctness", "security", "performance", "maintainability"],
    stallScoreDelta: 0.5,
    stallRounds: 2,
    maxL3RejectionsPerRound: 3,
    retryCount: 2,
    timeoutMs: 600000, // code 审查实测可超 10 分钟，不能用 plan 的 120s
    autoAcceptOnStall: false,
    maxTokensPerTask: 200000,
    selfPlay: { enabled: true, confidenceWeight: 0.6 },
  };
  if (mode === "single") {
    // 单模型：proposer 与 critic 同族，禁用跨家族要求，轮数压到 1
    return Object.assign({}, base, {
      maxRounds: 1,
      requireCrossFamily: false,
      _note: "single 模式：判定器判定为低风险，只跑一轮单模型",
    });
  }
  return base;
}

// ---------- 读取判定结果 ----------
function readDecision(sha) {
  const f = path.join(REPO, ".ccg", "reviews", `${sha}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (_) {
    return null;
  }
}

function currentSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (_) {
    return "";
  }
}

// ---------- 生成 proposal（把 diff 变成评审对象）----------
function buildProposal(sha) {
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", `${BASE}...${sha}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (_) {
    try {
      diff = execFileSync("git", ["show", sha], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    } catch (_) {
      diff = "";
    }
  }
  if (!diff.trim()) return null;
  return [
    `# 变更提案（自动生成，待对抗评审）`,
    ``,
    `- base: \`${BASE}\``,
    `- head: \`${sha}\``,
    `- 变更规模: ${diff.split("\n").length} 行 diff`,
    ``,
    `## 变更内容`,
    ``,
    "```diff",
    diff,
    "```",
    ``,
    `> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述 diff 挑刺。`,
  ].join("\n");
}

// ---------- 自扮演裁决模板 ----------
// 脚本不代替 LLM 裁决，只把待裁决清单落成可填的结构，由 agent/评审人填写。
function writeAdjudicationTemplate(dir, decision) {
  const sp = decision.selfPlay;
  const tpl = {
    schemaVersion: 1,
    adjudicatedBy: "self-play",
    confidenceWeight: sp.confidenceWeight,
    reason: "stall/maxRounds 后自扮演裁决（引擎第三档出口）",
    highRiskNote: "高危域争议项不允许自扮演豁免，必须外部复核",
    requiresExternalReview: sp.requiresExternalReview,
    instructions: [
      "对 items 里每一条争议，依次生成：",
      "  1) 最强指控 —— 论证这条确实是真问题（含具体失败场景）",
      "  2) 最强辩护 —— 论证这不是问题 / 已被别处覆盖",
      "  3) 裁决 —— 哪一边论证更强，verdict 取 upheld（指控成立）/ dismissed（指控不成立）",
      "裁决理由必须可验证，不得只写「看起来没问题」。",
    ],
    items: sp.items.map((i) => ({
      id: i.id,
      severity: i.severity,
      finding: i.finding,
      highRiskDomains: i.highRiskDomains,
      prosecution: null, // 最强指控
      defense: null,     // 最强辩护
      verdict: null,     // upheld | dismissed
      rationale: null,   // 裁决理由
    })),
  };
  const f = path.join(dir, "adjudication.json");
  fs.writeFileSync(f, JSON.stringify(tpl, null, 2) + "\n", "utf8");
  return f;
}

// ---------- 读取已填写的裁决 ----------
function readAdjudication(dir) {
  const f = path.join(dir, "adjudication.json");
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (_) {
    return null;
  }
}

/** 依据裁决结果算出最终阻断项 */
function blockingFromAdjudication(adj) {
  var blocking = [];
  (adj.items || []).forEach(function (i) {
    // 高危域：自扮演不得豁免，一律要求外部复核
    if ((i.highRiskDomains || []).length) {
      blocking.push({ id: i.id, severity: i.severity, reason: 'high_risk_requires_external', domains: i.highRiskDomains });
      return;
    }
    if (i.verdict === 'upheld') {
      blocking.push({ id: i.id, severity: i.severity, reason: 'self_play_upheld' });
    }
  });
  return blocking;
}

// ---------- 回写 .ccg/reviews/<sha>.json ----------
function writeBack(sha, deepReview) {
  const f = path.join(REPO, ".ccg", "reviews", `${sha}.json`);
  if (!fs.existsSync(f)) return;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  rec.deepReview = deepReview;
  fs.writeFileSync(f, JSON.stringify(rec, null, 2) + "\n", "utf8");
}

// ---------- main ----------
function main() {
  const sha = SHA || currentSha();
  if (!sha) {
    console.error("无法确定 sha");
    return 2;
  }

  const decision = readDecision(sha);
  if (!decision) {
    console.log("⏭ 未找到 .ccg/reviews/" + sha.slice(0, 8) + ".json —— 提交时未跑判定器，跳过深度审查");
    console.log("   （若这是 CI 上首次运行，请先在本地提交一次以生成判定记录）");
    return 0;
  }

  const mode = decision.mode;
  console.log(`\n═══ CCG 深度审查 ═══`);
  console.log(`提交判定: ${mode.toUpperCase()}  (${decision.reason})`);

  if (mode === "skip") {
    console.log("判定为 S 复杂度低风险，按决策矩阵不做深度审查 —— 退出 0");
    writeBack(sha, {
      required: false, status: "skipped_by_mode", performedBy: null,
      findings: null, reason: decision.reason, at: new Date().toISOString(),
    });
    return 0;
  }

  const cfg = cfgForMode(mode);
  const fam = engine.familyCheck(FAMILY_MAP, cfg.proposer, cfg.critic);
  if (fam.ok && cfg.requireCrossFamily !== false) {
    console.log(`跨家族校验: proposer=${cfg.proposer} critic=${cfg.critic} 通过`);
  } else if (!fam.ok) {
    console.log(`跨家族校验未通过: ${fam.reason || '家族重叠'} —— 降级为单后端`);
  }

  const slug = `ccg-deep-${sha.slice(0, 8)}`;
  if (!engine.validateSlug(slug)) {
    console.error("非法 slug: " + slug);
    return 2;
  }
  const dir = path.join(REPO, ".adversarial", slug);
  fs.mkdirSync(dir, { recursive: true });

  if (DRY_RUN) {
    console.log(`[dry-run] 将创建 ${path.relative(REPO, dir)}`);
    console.log(`[dry-run] 引擎配置: ${JSON.stringify({ maxRounds: cfg.maxRounds, timeoutMs: cfg.timeoutMs, selfPlay: cfg.selfPlay })}`);
    return 0;
  }

  // 家族快照（保证历史可复现，与 family-snapshot.json 机制一致）
  engine.atomicWriteJson(path.join(dir, "family-snapshot.json"), {
    schemaVersion: 1,
    snapshotCreatedAt: new Date().toISOString(),
    resolvedFamily: fam.resolved || { proposer: cfg.proposer, critic: cfg.critic },
    familyMap: FAMILY_MAP,
  });

  const proposal = buildProposal(sha);
  if (!proposal) {
    console.log("⏭ 取不到 diff（可能 base 与 head 相同）—— 退出 0");
    return 0;
  }
  engine.writeArtifact(dir, "proposal-v1.md", proposal);

  // 跑第一轮：评审方挑刺
  console.log(`\n[轮 1/${cfg.maxRounds}] 调用 critic=${cfg.critic} 评审...`);
  let cr;
  try {
    cr = mc.callCritic({
      backend: cfg.critic,
      workdir: REPO,
      roundN: 1,
      proposalText: proposal,
      wrapperPath: mc.DEFAULT_WRAPPER,
      timeoutMs: cfg.timeoutMs,
      retryCount: cfg.retryCount,
    });
  } catch (err) {
    console.error("评审调用异常: " + err.message);
    writeBack(sha, {
      required: true, status: "error", performedBy: cfg.critic,
      findings: null, error: err.message, at: new Date().toISOString(),
    });
    return 2;
  }

  if (!cr || !cr.ok) {
    const why = (cr && (cr.error || (cr.validationErrors && JSON.stringify(cr.validationErrors)))) || "未知原因";
    console.error("评审失败: " + why);
    writeBack(sha, {
      required: true, status: "error", performedBy: cfg.critic,
      findings: null, error: String(why), at: new Date().toISOString(),
    });
    return 2;
  }
  const critique = cr.data;
  engine.writeArtifact(dir, "critique-v1.md", JSON.stringify(critique, null, 2));
  const scoreList = (critique.scores || []).map(function (s) { return s.score; });
  const minScore = scoreList.length ? Math.min.apply(null, scoreList) : null;
  console.log(`  评审完成：${(critique.issues || []).length} 条问题，` +
              `${scoreList.length} 个维度，最低分 ${minScore}`);

  // 组装 task 并交给收敛决策
  const task = {
    currentRound: 1,
    rounds: [{
      round: 1, minScore: minScore, critique: critique,
      processed: { accepted: [], rejected: [], rejectedWithEvidence: [], partiallyAccepted: [] },
    }],
  };

  const d = engine.convergenceDecision(task, cfg);
  console.log(`\n收敛判定: status=${d.status} reason=${d.reason} minScore=${d.minScore}`);

  if (d.status === "self_play") {
    const tplFile = writeAdjudicationTemplate(dir, d);
    console.log(`\n⚡ 进入自扮演裁决（引擎第三档出口）`);
    console.log(`   置信权重 ${d.selfPlay.confidenceWeight}（低于真跨家族 ${1.0}）`);
    console.log(`   待裁决 ${d.selfPlay.items.length} 条；其中高危域必须外部复核 ${d.selfPlay.requiresExternalReview.length} 条`);
    console.log(`   裁决模板已生成: ${path.relative(REPO, tplFile)}`);
    console.log(`   → 由 agent 逐条填 prosecution / defense / verdict / rationale`);

    const adj = readAdjudication(dir);
    if (!adj) {
      writeBack(sha, {
        required: true, status: "self_play_pending", performedBy: "self-play(pending)",
        confidenceWeight: d.selfPlay.confidenceWeight,
        requiresExternalReview: d.selfPlay.requiresExternalReview,
        findings: null, template: path.relative(REPO, tplFile),
        at: new Date().toISOString(),
      });
      console.log(`\n裁决未填写 —— 本次不判定阻断，状态记为 self_play_pending`);
      return 0;
    }
    const blocking = blockingFromAdjudication(adj);
    writeBack(sha, {
      required: true, status: blocking.length ? "self_play_blocked" : "self_play_resolved",
      performedBy: "self-play", confidenceWeight: adj.confidenceWeight,
      requiresExternalReview: adj.requiresExternalReview,
      findings: adj.items, blocking: blocking,
      at: new Date().toISOString(),
    });
    if (blocking.length) {
      console.log(`\n🔴 自扮演裁决判定存在阻断项 ${blocking.length} 条`);
      blocking.forEach(function (b) { console.log(`   - [${b.severity}] ${b.id}  ${b.reason}`); });
      return 1;
    }
    console.log(`\n✅ 自扮演裁决未发现阻断项`);
    return 0;
  }

  if (d.status === "escalated") {
    writeBack(sha, {
      required: true, status: "escalated", performedBy: cfg.critic,
      findings: critique.issues || [], minScore: minScore,
      note: "自扮演不适用（高危域或未启用），已升级给人",
      at: new Date().toISOString(),
    });
    console.log(`\n⚠ 已升级给人处理（高危域不允许自扮演豁免，或自扮演未启用）`);
    return 1;
  }

  writeBack(sha, {
    required: true, status: d.status, performedBy: cfg.critic,
    findings: critique.issues || [], minScore: minScore,
    at: new Date().toISOString(),
  });
  console.log(`\n✅ 深度审查完成，status=${d.status}，无阻断`);
  return 0;
}

process.exit(main());
