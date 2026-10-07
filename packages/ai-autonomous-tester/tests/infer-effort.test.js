const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { inferEffortFromText } = require("../src/utils/infer-effort");
const { RequirementsVerifier } = require("../src/verifier/requirements-verifier");

// 本测试守护 2026-10-07 修复的一个**静默行为缺陷**：
//
//   `_estimateEffort` 此前是独立于 `ai-analyzer.js` / `fix-engine.js` 的
//   第二份关键词实现，其中文词在 d52dcc0(v0.8.0) 提交时已被写成 U+FFFD。
//   英文分支完好 ⇒ 任何英文用例都测不出问题；中文需求恒被判 MEDIUM，
//   于是 `ai-analyzer.js` 里 `uncovered.filter(u => u.effort === 'HIGH')`
//   对中文 PRD 永远返回空，永远走不到 NEED_HUMAN 分支。
//
// 真实影响面在 ai-analyzer.js:252。测试里锁死"中文必须命中"这一条，
// 任何再次把中文写成替换字符的改动都会让本文件变红。

const SRC = path.join(__dirname, "..", "src");

describe("infer-effort 唯一实现", () => {
  it("中文 HIGH 关键词必须命中（回归：曾恒为 MEDIUM）", () => {
    for (const name of [
      "批量导入用户数据",
      "自动化工作流",
      "支持OAuth登录",
      "对接内部API",
    ]) {
      assert.equal(inferEffortFromText(name), "HIGH", `「${name}」应判 HIGH`);
    }
  });

  it("中文 LOW 关键词必须命中（回归：曾恒为 MEDIUM）", () => {
    for (const name of [
      "用户列表展示页",
      "设置提示按钮",
      "重命名按钮文案",
      "调整css颜色",
    ]) {
      assert.equal(inferEffortFromText(name), "LOW", `「${name}」应判 LOW`);
    }
  });

  it("英文分支不退化", () => {
    assert.equal(inferEffortFromText("batch import users"), "HIGH");
    assert.equal(inferEffortFromText("export data"), "HIGH");
    assert.equal(inferEffortFromText("show panel"), "LOW");
  });

  it("无信号与空值落 MEDIUM", () => {
    assert.equal(inferEffortFromText("支付回调"), "MEDIUM");
    assert.equal(inferEffortFromText(""), "MEDIUM");
    assert.equal(inferEffortFromText(null), "MEDIUM");
    assert.equal(inferEffortFromText(undefined), "MEDIUM");
  });

  it("已知词表缺口：中文「导入/导出」无英文配对，判 MEDIUM", () => {
    // 词表里是 `import|export|批量|batch|自动化|automate` ——
    // `批量/batch`、`自动化/automate` 有中英配对，`import`/`export` **没有**，
    // 所以纯中文「导入」「导出」匹配不到任何 HIGH 词。
    // 这是**修复前就存在**的词表缺陷（v0.5.0 即如此），与本次 U+FFFD 修复无关。
    // 补词属于行为变更，需独立评估影响面，故此处按现状锁定、不顺手改。
    // TODO(词表): 评估为 HIGH 补 `导入|导出`、为 LOW 补 `文案|改字`。
    assert.equal(inferEffortFromText("导出为CSV"), "MEDIUM");
    assert.equal(inferEffortFromText("导入历史数据"), "MEDIUM");
    // 英文侧正常，印证缺口仅限中文侧
    assert.equal(inferEffortFromText("export CSV"), "HIGH");
    assert.equal(inferEffortFromText("import history"), "HIGH");
  });

  it("大小写不敏感", () => {
    assert.equal(inferEffortFromText("BATCH IMPORT"), "HIGH");
    assert.equal(inferEffortFromText("Show Panel"), "LOW");
  });
});

describe("三处调用方共用同一份实现（防再次漂移）", () => {
  const CASES = [
    "批量导入用户数据",
    "自动化工作流",
    "用户列表展示",
    "设置提示按钮",
    "支持OAuth登录",
    "支付回调",
    "batch import",
    "show panel",
  ];

  it("verifier._estimateEffort 与共享实现逐例一致", () => {
    const v = new RequirementsVerifier();
    for (const name of CASES) {
      assert.equal(
        v._estimateEffort(name),
        inferEffortFromText(name),
        `「${name}」两份实现必须一致`
      );
    }
  });

  it("源码里不存在第二份就地关键词正则", () => {
    // 若有人再写一份 `/(import|export|批量|...)/ .test(...)` 而不 import 共享模块，
    // 这里就会红。门禁纪律同 scripts/check-text-encoding-integrity.js。
    const FFFD = String.fromCodePoint(0xfffd);
    const files = [
      path.join(SRC, "verifier", "requirements-verifier.js"),
      path.join(SRC, "ai-analyzer.js"),
      path.join(SRC, "fix-engine.js"),
    ];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      assert.equal(
        src.includes(FFFD),
        false,
        `${path.basename(f)} 含有 U+FFFD 替换字符——中文关键词疑似再次损坏`
      );
      // 原地实现会留下 `.test(s) return 'HIGH'` 这类字面量正则
      assert.doesNotMatch(
        src,
        /\/\(import\|export\|/,
        `${path.basename(f)} 出现就地关键词正则，请改用 utils/infer-effort`
      );
    }
  });

  it("ai-analyzer.js 与 fix-engine.js 都已 require 共享模块", () => {
    for (const f of ["ai-analyzer.js", "fix-engine.js"]) {
      const src = fs.readFileSync(path.join(SRC, f), "utf8");
      assert.match(
        src,
        /require\(["']\.\/utils\/infer-effort["']\)/,
        `${f} 应当 require 共享实现`
      );
    }
  });
});

describe("ai-analyzer 的复杂度筛选（缺陷的真实影响面）", () => {
  it("中文 HIGH 需求能进入 NEED_HUMAN 判定，不被静默漏掉", () => {
    // 复刻 ai-analyzer.js:252 的判定：只有 effort==='HIGH' 才会升级人工
    const decide = (uncovered) =>
      uncovered.filter((u) => u.effort === "HIGH").length > 0
        ? "NEED_HUMAN"
        : "FIX_AND_RETRY";

    const uncovered = ["批量导入用户数据", "用户列表展示"].map((n) => ({
      prdFeature: n,
      status: "NOT_IMPLEMENTED",
      effort: inferEffortFromText(n),
    }));

    // 修复前：两个都是 MEDIUM → 判 FIX_AND_RETRY（复杂需求被漏掉）
    // 修复后：批量导入是 HIGH → 判 NEED_HUMAN
    assert.equal(decide(uncovered), "NEED_HUMAN");
  });
});
