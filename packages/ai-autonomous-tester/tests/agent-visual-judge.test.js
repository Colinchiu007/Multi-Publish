const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AgentVisualJudge, MAX_IMAGE_BYTES } = require("../src/agent/agent-visual-judge");

// 生成最小 PNG 签名文件（encodeImage 只读字节，不校验图像内容）
function writeFakePng(dir, name) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("0123456789abcdef"),
  ]));
  return filePath;
}

describe("AgentVisualJudge", () => {
  const judge = new AgentVisualJudge();

  it("noise: diff <0.5% returns noise", async () => {
    const r = await judge.judge({ testName: "home", misMatchPercentage: 0.3 });
    assert.equal(r.verdict, "noise");
    assert.equal(r.confidence, "high");
  });

  it("regression: interactive component >2% returns regression", async () => {
    const r = await judge.judge({ testName: "login-button", misMatchPercentage: 3.5 });
    assert.equal(r.verdict, "regression");
    assert.equal(r.confidence, "medium");
  });

  it("need_review: large diff >5% returns need_review", async () => {
    const r = await judge.judge({ testName: "home-page", misMatchPercentage: 8.0 });
    assert.equal(r.verdict, "need_review");
  });

  it("expected: moderate diff on non-interactive returns expected", async () => {
    const r = await judge.judge({ testName: "banner-image", misMatchPercentage: 1.5 });
    assert.equal(r.verdict, "noise");
  });

  it("LLM mode: when llmFn provided, returns parsed verdict", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      llmFn: async () => JSON.stringify({ verdict: "expected", reasoning: "Intentional color change", confidence: "high" }),
    });
    const r = await judgeWithLLM.judge({ testName: "theme-update", misMatchPercentage: 12.0 });
    assert.equal(r.verdict, "expected");
    assert.equal(r.confidence, "high");
    assert.ok(r.reasoning);
  });

  it("LLM mode: handles malformed JSON gracefully", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      llmFn: async () => "not json at all",
    });
    const r = await judgeWithLLM.judge({ testName: "broken", misMatchPercentage: 5.0 });
    assert.equal(r.verdict, "need_review");
  });

  it("judgeBatch: handles empty array", async () => {
    const results = await judge.judgeBatch([]);
    assert.deepEqual(results, []);
  });

  it("judgeBatch: handles multiple diffs", async () => {
    const diffs = [
      { testName: "noise", misMatchPercentage: 0.1 },
      { testName: "regression-button", misMatchPercentage: 3.0 },
    ];
    const results = await judge.judgeBatch(diffs);
    assert.equal(results.length, 2);
    assert.equal(results[0].verdict, "noise");
    assert.equal(results[1].verdict, "regression");
  });

  it("vision: llmFn 收到 base64 图片（diff/基线/当前）", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajv-vision-"));
    try {
      const diffPath = writeFakePng(tmp, "diff.png");
      const baselinePath = writeFakePng(tmp, "baseline.png");
      const currentPath = writeFakePng(tmp, "current.png");
      let received = null;
      const judgeWithLLM = new AgentVisualJudge({
        vision: true,
        llmFn: async input => {
          received = input;
          return JSON.stringify({ verdict: "regression", reasoning: "布局错位", confidence: "high" });
        },
      });
      const r = await judgeWithLLM.judge({ testName: "home", misMatchPercentage: 3.0, diffPath, baselinePath, currentPath });
      assert.equal(r.verdict, "regression");
      assert.equal(r.visionUsed, true);
      assert.equal(typeof received, "object");
      assert.equal(received.images.length, 3);
      assert.equal(received.images[0].path, diffPath);
      assert.match(received.images[0].dataUrl, /^data:image\/png;base64,/);
      assert.equal(received.images[0].mimeType, "image/png");
      assert.ok(received.images[0].base64.length > 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("vision: 模型拒绝图片时降级纯文本并标记 visionFallback", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajv-fallback-"));
    try {
      const diffPath = writeFakePng(tmp, "diff.png");
      const baselinePath = writeFakePng(tmp, "baseline.png");
      const currentPath = writeFakePng(tmp, "current.png");
      const calls = [];
      const judgeWithLLM = new AgentVisualJudge({
        vision: true,
        llmFn: async input => {
          calls.push(input);
          if (typeof input === "object") {
            const err = new Error("LLM API 400: this model does not support images");
            err.status = 400;
            throw err;
          }
          return JSON.stringify({ verdict: "expected", reasoning: "纯文本判定", confidence: "medium" });
        },
      });
      const r = await judgeWithLLM.judge({ testName: "home", misMatchPercentage: 3.0, diffPath, baselinePath, currentPath });
      assert.equal(calls.length, 2);
      assert.equal(r.verdict, "expected");
      assert.equal(r.visionUsed, false);
      assert.equal(r.visionFallback, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("vision: 视觉关闭时即使有图片也走纯文本", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajv-novision-"));
    try {
      const diffPath = writeFakePng(tmp, "diff.png");
      let received = null;
      const judgeWithLLM = new AgentVisualJudge({
        vision: false,
        llmFn: async input => {
          received = input;
          return JSON.stringify({ verdict: "expected", reasoning: "x", confidence: "low" });
        },
      });
      const r = await judgeWithLLM.judge({ testName: "home", misMatchPercentage: 3.0, diffPath });
      assert.equal(typeof received, "string");
      assert.equal(r.visionUsed, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("vision: 图片文件缺失时自动回落纯文本", async () => {
    let received = null;
    const judgeWithLLM = new AgentVisualJudge({
      vision: true,
      llmFn: async input => {
        received = input;
        return JSON.stringify({ verdict: "noise", reasoning: "无 diff 图", confidence: "medium" });
      },
    });
    const r = await judgeWithLLM.judge({ testName: "missing-images", misMatchPercentage: 3.0 });
    assert.equal(typeof received, "string");
    assert.equal(r.verdict, "noise");
    assert.equal(r.visionUsed, false);
  });

  it("vision: 超大图片被体积护栏跳过（不内联）", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajv-big-"));
    try {
      const bigPath = path.join(tmp, "big.png");
      fs.writeFileSync(bigPath, Buffer.alloc(MAX_IMAGE_BYTES + 1)); // >3MB
      let received = null;
      const judgeWithLLM = new AgentVisualJudge({
        vision: true,
        llmFn: async input => {
          received = input;
          return JSON.stringify({ verdict: "noise", reasoning: "x", confidence: "high" });
        },
      });
      const r = await judgeWithLLM.judge({ testName: "big-shot", misMatchPercentage: 3.0, diffPath: bigPath });
      assert.equal(typeof received, "string"); // 无图可发 → 回落纯文本
      assert.equal(r.visionUsed, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("LLM mode: 纯文本调用抛错时 fail-closed 返回 need_review（不向调用方抛异常）", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      vision: false,
      llmFn: async () => { throw new Error("LLM API 500"); },
    });
    const r = await judgeWithLLM.judge({ testName: "home", misMatchPercentage: 3.0 });
    assert.equal(r.verdict, "need_review");
    assert.equal(r.visionUsed, false);
    assert.match(r.reasoning, /LLM 调用失败/);
  });

  it("vision: 视觉与降级文本都失败 → fail-closed need_review（visionFallback 标记）", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ajv-hardfail-"));
    try {
      const diffPath = writeFakePng(tmp, "diff.png");
      const judgeWithLLM = new AgentVisualJudge({
        vision: true,
        llmFn: async () => { throw new Error("LLM API 500"); },
      });
      const r = await judgeWithLLM.judge({ testName: "home", misMatchPercentage: 3.0, diffPath });
      assert.equal(r.verdict, "need_review");
      assert.equal(r.visionFallback, true);
      assert.match(r.reasoning, /LLM 调用失败/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("vision: LLM 返回 need_review 时原样透传", async () => {
    const judgeWithLLM = new AgentVisualJudge({
      vision: true,
      llmFn: async () => JSON.stringify({ verdict: "need_review", reasoning: "ambiguous", confidence: "low" }),
    });
    const r = await judgeWithLLM.judge({ testName: "ambiguous", misMatchPercentage: 3.0 });
    assert.equal(r.verdict, "need_review");
    assert.equal(r.visionUsed, false);
  });
});
