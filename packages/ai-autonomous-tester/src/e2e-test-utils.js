/**
 * e2e-test-utils.js ? pure logic extracted from run-autonomous-e2e.js
 * ???????????
 */
const path = require("path");

function parseArgs(argv) {
  const args = Object.fromEntries(
    (argv || []).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; })
  );
  return args;
}

function resolveDocPaths(rawDocs, rootDir) {
  if (!rawDocs) return [path.join(rootDir, "01-docs/PRD.md")];
  return rawDocs.split(",").map(p => p.trim()).filter(Boolean).map(p => path.resolve(rootDir, p));
}

function resolveFunctionalTargets(enable, raw) {
  if (!enable) return [];
  if (raw) return raw.split(",").map(t => t.trim()).filter(Boolean);
  return ["navigation", "login", "publish", "accounts", "settings"];
}

function makeLlmFn(provider, env = {}) {
  if (!provider) return null;
  const apiKey = env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return { provider, hasKey: true, model: env.LLM_MODEL || (provider === "openai" ? "gpt-4o-mini" : "claude-3-5-sonnet-latest") };
}

function buildAutoFixScript(iterationHistory, appsDir) {
  const fixLines = ["@echo off", "REM Auto-generated fix commands from autonomous loop", ""];
  for (const h of (iterationHistory || [])) {
    if (h.fixResult?.results) {
      for (const r of h.fixResult.results) {
        if (!r.success) continue;
        const fix = r.fix || {};
        if (fix.type === "baseline" && fix.testName) {
          const src = path.join(appsDir, "tests/visual-testing/screenshots", fix.testName + "-current.png");
          const dst = path.join(appsDir, "tests/visual-testing/base-screenshots", fix.testName + ".png");
          fixLines.push("REM Update baseline for " + fix.testName);
          fixLines.push('copy /Y "' + src + '" "' + dst + '" 2>nul');
        }
      }
    }
  }
  return fixLines.length > 3 ? fixLines : null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { parseArgs, resolveDocPaths, resolveFunctionalTargets, makeLlmFn, buildAutoFixScript, sleep };
