/**
 * run-agent-judge.js - AI 视觉/需求判断 CLI（v0.8.0）
 *
 * 跑：collectFacts → AgentJudge → 输出 verdict JSON + Markdown report
 *
 * 使用方式:
 *   # 无 LLM（生成 prompt 包 + 标记 NEED_HUMAN）
 *   node scripts/run-agent-judge.js --prd=./01-docs/PRD.md --src=./apps/desktop/src
 *
 *   # 注入 OpenAI 兼容 LLM
 *   OPENAI_API_KEY=sk-xxx node scripts/run-agent-judge.js --llm=openai --model=gpt-4o-mini
 *
 *   # 注入 Anthropic
 *   ANTHROPIC_API_KEY=sk-xxx node scripts/run-agent-judge.js --llm=anthropic --model=claude-3-5-sonnet-latest
 *
 *   # 自定义 OpenAI 兼容端点 (LM Studio / Ollama / vLLM)
 *   LLM_BASE_URL=http://localhost:1234/v1 node scripts/run-agent-judge.js --llm=openai
 *
 *   # 完整自主循环（推荐用于 CI）
 *   node scripts/run-agent-judge.js --prd=./01-docs/PRD.md --src=./apps/desktop/src --llm=openai --iterations=3
 *
 * 输出:
 *   - reports/agent-judge-verdict-{ts}.json   (机器可读)
 *   - reports/agent-judge-report-{ts}.md      (人工可读)
 *   - reports/agent-judge-prompt-{ts}.md      (无 LLM 时给 Agent 读)
 *
 * 退出码:
 *   0  PASS (coverageRate >= threshold)
 *   1  FAIL (verdict.decision === "FAIL" 且 coverageRate < threshold)
 *   2  NEED_HUMAN (无 LLM 或 LLM 给出 NEED_HUMAN，需人工审查)
 *   3  INFRA_ERROR (文件缺失、API 错误等)
 */

const path = require("path");
const fs = require("fs");
const { RequirementsVerifier, AgentJudge, FixEngine } = require("../index");

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const ROOT = path.resolve(__dirname, "../..", "..");
const prdPath = args.prd
  ? path.resolve(args.prd)
  : path.join(ROOT, "01-docs/PRD.md");
const srcDir = args.src
  ? path.resolve(args.src)
  : path.join(ROOT, "apps/desktop/src");
const llmProvider = normalizeLlmProvider(args.llm || process.env.LLM_PROVIDER); // openai | anthropic | none
const llmModel = args.model || process.env.LLM_MODEL || defaultModel(llmProvider);
const iterations = parseInt(args.iterations, 10) || 1;
const parsedCoverageThreshold = parseFloat(args.coverageThreshold ?? args.threshold ?? process.env.COVERAGE_THRESHOLD);
const coverageThreshold = Number.isFinite(parsedCoverageThreshold) ? parsedCoverageThreshold : 0.8;
const reportDir = args.out
  ? path.resolve(args.out)
  : path.join(ROOT, "apps/desktop/tests/visual-testing/reports");
const task = args.task || "coverage";

function defaultModel(provider) {
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "anthropic") return "claude-3-5-sonnet-latest";
  return null;
}

function normalizeLlmProvider(provider) {
  if (typeof provider !== "string") return provider || null;
  const normalized = provider.trim().toLowerCase();
  return normalized === "" || normalized === "none" ? null : normalized;
}

async function main() {
  console.log("================================================================");
  console.log("  AI Agent Judge — Coverage Audit");
  console.log("================================================================");
  console.log(`PRD:        ${prdPath}`);
  console.log(`Source:     ${srcDir}`);
  console.log(`LLM:        ${llmProvider || "(none, will output prompt package)"}`);
  if (llmProvider) console.log(`Model:      ${llmModel}`);
  console.log(`Task:       ${task}`);
  console.log(`Threshold:  ${coverageThreshold}`);
  console.log(`Iterations: ${iterations}`);
  console.log(`Output:     ${reportDir}`);
  console.log("================================================================\n");

  // 1. 校验输入
  if (!fs.existsSync(prdPath)) {
    console.error(`[ERROR] PRD not found: ${prdPath}`);
    process.exit(3);
  }
  if (!fs.existsSync(srcDir)) {
    console.warn(`[WARN] Source dir not found: ${srcDir} — feature detection will be empty`);
  }

  // 2. 构造 LLM 函数
  const llmFn = llmProvider ? makeLlmFn(llmProvider, llmModel) : null;

  // 3. 构造 PRDParser（CLI 默认宽松模式覆盖关键词，覆盖 F1/F2/F3 等子项）
  const parserOpts = args.strict
    ? { featureKeywords: ["功能需求", "Feature", "特性", "Requirement", "功能列表"] }
    : {
        featureKeywords: [
          "功能需求", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8",
          "3.", "3.1", "3.2", "3.3", "6.", "6.1", "6.2", "6.3", "6.4", "6.5",
        ],
      };

  // 4. 跑循环（多次迭代直到 PASS 或 NEED_HUMAN）
  fs.mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  let finalReport = null;
  let exitCode = 0;

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n--- Iteration ${i}/${iterations} ---`);

    const verifier = new RequirementsVerifier({ prdParser: new (require("../src/parsers/prd-parser").PRDParser)(parserOpts) });
    const judge = new AgentJudge({ llmFn, logger: console });

    const facts = await verifier.collectFacts({ prdPath, srcDir });
    console.log(`[facts] PRD items: ${facts.summary.prdCount}, Code features: ${facts.summary.implCount}`);

    const verdict = await judge.judge({ facts, task, llmFn });
    const verdict_ = verdict._mode === "prompt" ? verdict : verdict;

    // Prompt 包模式
    if (verdict_._mode === "prompt") {
      const promptPath = path.join(reportDir, `agent-judge-prompt-${ts}.md`);
      fs.writeFileSync(promptPath, buildPromptMarkdown(verdict_));
      console.log(`[output] Prompt package written: ${promptPath}`);
      console.log(`[output] (No LLM configured — Agent must read this prompt and respond with verdict JSON)`);
      finalReport = { mode: "prompt", verdict: verdict_, iteration: i };
      exitCode = 2;
      break;
    }

    // 正常 verdict
    const jsonPath = path.join(reportDir, `agent-judge-verdict-${ts}-i${i}.json`);
    const mdPath = path.join(reportDir, `agent-judge-report-${ts}-i${i}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(verdict, null, 2));
    fs.writeFileSync(mdPath, buildVerdictMarkdown(verdict, facts));
    console.log(`[output] Verdict JSON: ${jsonPath}`);
    console.log(`[output] Report MD:   ${mdPath}`);

    console.log(`\n[verdict] decision=${verdict.decision} score=${verdict.score} coverageRate=${verdict.summary?.coverageRate}`);

    finalReport = {
      mode: "llm",
      verdict,
      facts: { prdCount: facts.summary.prdCount, implCount: facts.summary.implCount },
      iteration: i,
    };

    // 决策退出码
    if (verdict.decision === "PASS") {
      exitCode = 0;
      console.log(`[result] PASS - coverage acceptable`);
      break;
    }
    if (verdict.decision === "NEED_HUMAN") {
      exitCode = 2;
      console.log(`[result] NEED_HUMAN - ${verdict.reasoning}`);
      break;
    }
    // FAIL: 看 coverageRate 是否达标
    const rate = verdict.summary?.coverageRate ?? 0;
    if (rate >= coverageThreshold) {
      exitCode = 0;
      console.log(`[result] PASS (coverageRate ${rate} >= threshold ${coverageThreshold}, even with FAIL decision)`);
      break;
    }
    // 真的有 gap → 生成 FixEngine 计划
    if (i < iterations) {
      const fixes = FixEngine.fromVerdict(verdict, { maxFixes: 10 });
      console.log(`[fixes] ${fixes.length} recommendations generated:`);
      fixes.forEach((f, idx) => {
        console.log(`  ${idx + 1}. [${f.priority}/${f.effort}] ${f.testName}`);
      });
      console.log(`[hint] Apply these fixes, then re-run to verify.`);
      exitCode = 1;
      break;
    } else {
      exitCode = 1;
    }
  }

  // 5. 写最终报告
  const summaryPath = path.join(reportDir, `agent-judge-summary-${ts}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    prdPath, srcDir,
    llmProvider, llmModel,
    iterations, coverageThreshold,
    exitCode,
    finalReport,
  }, null, 2));
  console.log(`\n[summary] ${summaryPath}`);

  console.log(`\n================================================================`);
  console.log(`Final exit code: ${exitCode}`);
  console.log(`  0 = PASS, 1 = FAIL, 2 = NEED_HUMAN, 3 = INFRA_ERROR`);
  console.log(`================================================================`);
  process.exit(exitCode);
}

// ===== LLM 构造 =====

function makeLlmFn(provider, model) {
  if (provider === "openai") return makeOpenAiFn(model);
  if (provider === "anthropic") return makeAnthropicFn(model);
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

function makeOpenAiFn(model) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY env var required for --llm=openai");
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  return async (prompt) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a senior QA engineer. Respond with ONLY valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  };
}

function makeAnthropicFn(model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var required for --llm=anthropic");
  return async (prompt) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
        system: "You are a senior QA engineer. Respond with ONLY valid JSON, no markdown.",
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  };
}

// ===== Markdown 渲染 =====

function buildPromptMarkdown(pkg) {
  return `# Agent Judge Prompt Package

**Generated**: ${new Date().toISOString()}
**Task**: ${pkg.task}
**Mode**: ${pkg._mode} (${pkg._action})

---

## Prompt (paste this to an Agent / LLM)

\`\`\`
${pkg.prompt}
\`\`\`

---

${pkg.instructions}

---

## How to respond

1. Read the prompt above carefully.
2. If needed, read the source files listed in "Evidence" section.
3. Output ONLY a JSON object matching the schema in the prompt.
4. Do not include markdown code fences around the JSON.
5. Save the JSON to \`verdict.json\` and re-run:

\`\`\`bash
node scripts/run-agent-judge.js --prd=... --src=... --from-verdict=verdict.json
\`\`\`

(Or use the AgentJudge programmatically: \`new AgentJudge().parseVerdict(jsonText)\`)
`;
}

function buildVerdictMarkdown(verdict, facts) {
  const v = verdict;
  const lines = [];
  lines.push(`# AI Agent Judge — Coverage Audit Report`);
  lines.push("");
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push(`**Decision**: \`${v.decision}\`  `);
  lines.push(`**Score**: ${v.score}  `);
  lines.push(`**Coverage Rate**: ${(v.summary?.coverageRate ?? 0) * 100}%  `);
  lines.push(`**PRD Items**: ${facts.summary.prdCount}  `);
  lines.push(`**Detected Code Features**: ${facts.summary.implCount}  `);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| ✅ Covered | ${v.summary?.covered ?? 0} |`);
  lines.push(`| ⚠️ Partial | ${v.summary?.partial ?? 0} |`);
  lines.push(`| ❌ Missing | ${v.summary?.missing ?? 0} |`);
  lines.push("");
  lines.push(`## PRD Feature Status`);
  lines.push("");
  lines.push(`| PRD Feature | Status | Matched | Evidence |`);
  lines.push(`|-------------|--------|---------|----------|`);
  for (const it of v.items || []) {
    const status = it.status === "COVERED" ? "✅" : it.status === "PARTIAL" ? "⚠️" : "❌";
    lines.push(`| ${it.prdFeature} | ${status} ${it.status} | ${it.matchedImpl || "—"} | ${it.evidence || "—"} |`);
  }
  lines.push("");
  if (v.recommendations && v.recommendations.length > 0) {
    lines.push(`## Recommendations`);
    lines.push("");
    for (const rec of v.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }
  if (v.reasoning) {
    lines.push(`## Reasoning`);
    lines.push("");
    lines.push(v.reasoning);
    lines.push("");
  }
  return lines.join("\n");
}

main().catch(err => {
  console.error("[FATAL]", err.message);
  console.error(err.stack);
  process.exit(3);
});
