/**
 * AgentJudge - 让运行环境中的 Agent 做语义判断
 *
 * 核心原则：PRD 与代码的匹配是语义推理任务，不应由框架算法承担。
 * 本框架只做事实采集（PRD items + code features + evidence），
 * 把事实打包成"待 Agent 审查"的 prompt，由 Agent 用自带的 LLM 判断。
 *
 * 两种使用模式:
 *
 * 模式 A：Prompt 包（推荐用于交互式 Agent，如 Codex/Claude Desktop）
 *   const judge = new AgentJudge();
 *   const prompt = judge.buildVerdictPrompt({ facts, task: "coverage" });
 *   // 把 prompt 给 Agent，Agent 读 prompt + 调用 read_file / view_image
 *   // Agent 输出 verdict JSON
 *   const verdict = judge.parseVerdict(agentRawOutput);
 *
 * 模式 B：注入 LLM 函数（用于 CI/无人值守流水线）
 *   const judge = new AgentJudge({ llmFn: async (prompt) => llmClient.complete(prompt) });
 *   const verdict = await judge.judge({ facts, task: "coverage" });
 *
 * Verdict JSON Schema (稳定契约):
 * {
 *   task: "coverage" | "bug-classify" | "fix-approve",
 *   decision: "PASS" | "FAIL" | "NEED_HUMAN",
 *   score: 0.0-1.0,
 *   items: [{ prdFeature, status, matchedImpl, evidence, reasoning }],
 *   summary: { covered, partial, missing, coverageRate },
 *   recommendations: [...],
 *   reasoning: "...",
 * }
 */

const { buildCoveragePrompt } = require("../verifier/requirements-verifier");

class AgentJudge {
  constructor(options = {}) {
    this.llmFn = options.llmFn || null;
    this.logger = options.logger || console;
    this.mode = options.mode || (this.llmFn ? "llm-fn" : "prompt");
  }

  /**
   * 主入口：构造 prompt 或调用 LLM，返回 verdict
   */
  async judge(context = {}) {
    const { facts, task = "coverage", llmFn } = context;
    const prompt = this.buildVerdictPrompt({ facts, task });

    if (llmFn || this.llmFn) {
      const fn = llmFn || this.llmFn;
      const output = await fn(prompt);
      return this.parseVerdict(output, { task, facts });
    }

    // 无 LLM 时返回 prompt 包，让上游 Agent 自己处理
    return {
      _mode: "prompt",
      _action: "AGENT_REQUIRED",
      task,
      prompt,
      facts,
      instructions: this._instructions(task),
    };
  }

  /**
   * 构造结构化 prompt 包
   * 包含事实清单 + 任务说明 + 输出 schema + 判断准则
   */
  buildVerdictPrompt(context = {}) {
    const { facts, task = "coverage" } = context;

    if (!facts || !facts.prdItems) {
      throw new Error("AgentJudge.buildVerdictPrompt: facts.prdItems is required");
    }

    const sections = [];
    sections.push(this._roleBlock(task));
    sections.push(this._taskBlock(task));
    sections.push(this._factsBlock(facts));
    sections.push(this._schemaBlock(task));
    sections.push(this._judgingRulesBlock(task));

    return sections.join("\n\n");
  }

  /**
   * 解析 Agent/LLM 输出的 verdict
   * 容错：剥离 markdown 代码块、抽取 JSON、处理 wrap
   */
  parseVerdict(rawOutput, meta = {}) {
    if (rawOutput == null) {
      return this._errorVerdict("Empty output from Agent/LLM", meta);
    }

    const text = typeof rawOutput === "string"
      ? rawOutput
      : (rawOutput.text || rawOutput.content || JSON.stringify(rawOutput));

    try {
      const json = extractJson(text);
      return this._normalizeVerdict(json, meta);
    } catch (e) {
      // 容错：尝试从自然语言推断最小 verdict
      return this._heuristicVerdict(text, meta, e);
    }
  }

  /**
   * 验证 verdict 完整性
   */
  validateVerdict(verdict) {
    if (!verdict || typeof verdict !== "object") return false;
    if (!verdict.task) return false;
    if (!verdict.decision) return false;
    if (!["PASS", "FAIL", "NEED_HUMAN"].includes(verdict.decision)) return false;
    if (typeof verdict.score !== "number") return false;
    return true;
  }

  // ===== Prompt 构造块 =====

  _roleBlock(task) {
    return [
      "You are a senior QA engineer reviewing test results for a frontend application.",
      "You have access to the project source code (use read_file / grep as needed)",
      "and you can view screenshots (use view_image tool).",
      "Make semantic judgments - do not rely on keyword matching alone.",
    ].join("\n");
  }

  _taskBlock(task) {
    const tasks = {
      coverage: [
        "Task: PRD-vs-Code Coverage Audit",
        "Given the PRD features below and the detected code features below,",
        "decide for each PRD feature whether it is implemented, partially implemented, or missing.",
      ].join("\n"),
      "bug-classify": [
        "Task: Bug Classification",
        "Review the failing tests / visual diffs and classify each as:",
        "- REAL_BUG: needs code fix",
        "- EXPECTED_CHANGE: UI was intentionally updated, update baseline",
        "- NOISE: flaky test, render artifact, or false positive",
      ].join("\n"),
      "fix-approve": [
        "Task: Fix Approval",
        "Review the proposed code changes against the failing test.",
        "Decide: APPROVE (safe to merge), REJECT (still broken), or NEED_HUMAN.",
      ].join("\n"),
    };
    return tasks[task] || `Task: ${task}`;
  }

  _factsBlock(facts) {
    const prdList = (facts.prdItems || []).map((p, i) =>
      `${i + 1}. [${p.type || "feature"}] ${p.name}${p.completed ? " (✓ checked in PRD)" : ""}`
    ).join("\n");

    const implList = (facts.implItems || []).map((f, i) => {
      const bits = [`${i + 1}. [${f.type || "feature"}] ${f.name}`];
      if (f.path) bits.push(`(route: ${f.path})`);
      if (f.routeName) bits.push(`(routeName: ${f.routeName})`);
      if (f.file) bits.push(`(file: ${shortPath(f.file)})`);
      if (f.testid) bits.push(`(testid: ${f.testid})`);
      return bits.join(" ");
    }).join("\n");

    const evidenceList = (facts.evidence || []).map(e =>
      `- ${e.feature} → ${shortPath(e.file)}${e.path ? ` (${e.path})` : ""}`
    ).join("\n");

    return [
      `## PRD Features (${(facts.prdItems || []).length})`,
      prdList || "(none)",
      "",
      `## Detected Code Features (${(facts.implItems || []).length})`,
      implList || "(none)",
      "",
      `## Evidence (file paths for further reading)`,
      evidenceList || "(none)",
    ].join("\n");
  }

  _schemaBlock(task) {
    return [
      "## Output JSON Schema",
      "Respond with ONLY a JSON object (no markdown, no commentary):",
      "{",
      '  "task": "' + task + '",',
      '  "decision": "PASS" | "FAIL" | "NEED_HUMAN",',
      '  "score": <0.0 to 1.0>,',
      '  "items": [',
      '    {',
      '      "prdFeature": "...",',
      '      "status": "COVERED" | "PARTIAL" | "NOT_IMPLEMENTED",',
      '      "matchedImpl": "<feature name or empty>",',
      '      "evidence": "<file path or route or empty>",',
      '      "reasoning": "<short explanation>"',
      '    }',
      '  ],',
      '  "summary": { "covered": N, "partial": N, "missing": N, "coverageRate": 0.0-1.0 },',
      '  "recommendations": ["<high-priority items to implement>"],',
      '  "reasoning": "<overall reasoning>"',
      "}",
    ].join("\n");
  }

  _judgingRulesBlock(task) {
    if (task === "coverage") {
      return [
        "## Judging Rules",
        "- Read the actual source files when uncertain (use file paths in evidence).",
        "- A PRD feature is COVERED only if a code feature clearly implements its intent.",
        "- If a route exists but the page is empty or stub, mark PARTIAL.",
        "- If you can only infer coverage indirectly (e.g. via API call), mark PARTIAL with reasoning.",
        "- coverageRate = covered / total_prd_items (do not count partial as covered).",
      ].join("\n");
    }
    if (task === "bug-classify") {
      return [
        "## Judging Rules",
        "- REAL_BUG: visual diff / functional failure that breaks user value.",
        "- EXPECTED_CHANGE: diff matches an intentional design update.",
        "- NOISE: anti-aliasing, font hinting, cursor blink, sub-pixel rounding.",
      ].join("\n");
    }
    return "## Judging Rules\n- Use semantic reasoning. Read code when in doubt.";
  }

  _instructions(task) {
    return [
      `## How to respond`,
      `1. Read the prompt above carefully.`,
      `2. If needed, read the source files listed in "Evidence" section.`,
      `3. For task "${task}", apply the judging rules.`,
      `4. Output ONLY a JSON object matching the schema.`,
      `5. Do not include markdown code fences around the JSON.`,
    ].join("\n");
  }

  // ===== 解析与归一化 =====

  _normalizeVerdict(json, meta) {
    const verdict = {
      task: json.task || meta.task || "coverage",
      decision: normalizeDecision(json.decision),
      score: clampScore(json.score),
      items: Array.isArray(json.items) ? json.items.map(normalizeItem) : [],
      summary: normalizeSummary(json.summary),
      recommendations: Array.isArray(json.recommendations) ? json.recommendations : [],
      reasoning: json.reasoning || "",
      _facts: meta.facts,
    };

    verdict.valid = this.validateVerdict(verdict);
    return verdict;
  }

  _heuristicVerdict(text, meta, error) {
    // 当 LLM 输出无法解析为 JSON 时，做最弱的兜底
    const verdict = {
      task: meta.task || "coverage",
      decision: "NEED_HUMAN",
      score: 0,
      items: [],
      summary: { covered: 0, partial: 0, missing: 0, coverageRate: 0 },
      recommendations: [],
      reasoning: `Failed to parse Agent output: ${error.message}. Raw: ${text.slice(0, 200)}...`,
      valid: false,
      _parseError: error.message,
      _rawOutput: text,
      _facts: meta.facts,
    };
    return verdict;
  }

  _errorVerdict(reason, meta) {
    return {
      task: meta.task || "coverage",
      decision: "NEED_HUMAN",
      score: 0,
      items: [],
      summary: { covered: 0, partial: 0, missing: 0, coverageRate: 0 },
      recommendations: [],
      reasoning: reason,
      valid: false,
      _facts: meta.facts,
    };
  }
}

// ===== 辅助函数 =====

function extractJson(text) {
  if (!text) throw new Error("Empty text");
  // 剥离 markdown 代码块
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/```\s*$/, "");
  cleaned = cleaned.trim();

  // 找第一个 { 到最后一个 }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }

  return JSON.parse(cleaned);
}

function normalizeDecision(d) {
  const s = String(d || "").toUpperCase().trim();
  if (["PASS", "ACCEPT", "OK", "APPROVED", "COVERED", "SUCCESS"].includes(s)) return "PASS";
  if (["FAIL", "REJECT", "BLOCK", "REJECTED", "NOT_IMPLEMENTED"].includes(s)) return "FAIL";
  if (["NEED_HUMAN", "REVIEW", "MANUAL", "PARTIAL"].includes(s)) return "NEED_HUMAN";
  return "NEED_HUMAN";
}

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeItem(it) {
  return {
    prdFeature: it.prdFeature || it.name || "",
    status: normalizeStatus(it.status),
    matchedImpl: it.matchedImpl || it.implementedBy || "",
    evidence: it.evidence || "",
    reasoning: it.reasoning || "",
  };
}

function normalizeStatus(s) {
  const v = String(s || "").toUpperCase().trim();
  if (["COVERED", "IMPLEMENTED", "DONE"].includes(v)) return "COVERED";
  if (["PARTIAL", "PARTIALLY"].includes(v)) return "PARTIAL";
  if (["NOT_IMPLEMENTED", "MISSING", "ABSENT"].includes(v)) return "NOT_IMPLEMENTED";
  return "PARTIAL";
}

function normalizeSummary(s) {
  if (!s || typeof s !== "object") {
    return { covered: 0, partial: 0, missing: 0, coverageRate: 0 };
  }
  return {
    covered: Number(s.covered) || 0,
    partial: Number(s.partial) || 0,
    missing: Number(s.missing) || 0,
    coverageRate: clampScore(s.coverageRate),
  };
}

function shortPath(p) {
  if (!p) return "";
  return String(p).split(/[\\\/]/).slice(-3).join("/");
}

module.exports = { AgentJudge };