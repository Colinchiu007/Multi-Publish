const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { PRDParser } = require("../src/parsers/prd-parser");
const TMPDIR = path.join(__dirname, ".tmp");

function mkPrd(content) {
  fs.mkdirSync(TMPDIR, { recursive: true });
  const f = path.join(TMPDIR, "TEST-PRD-" + Date.now() + ".md");
  fs.writeFileSync(f, content, "utf8");
  return f;
}

describe("PRDParser", () => {
  const p = new PRDParser();

  it("parse: 返回 PRD 功能列表（中文章节）", async () => {
    const f = mkPrd(`
# 测试 PRD

## 三、功能需求
- [x] 用户登录
- [ ] 文章发布
1. 读取平台配置
2. 校验内容字段
`);
    const items = await p.parse(f);
    assert.equal(items.length, 4);
    assert.equal(items[0].name, "用户登录");
    assert.ok(items[0].completed);
    assert.equal(items[1].name, "文章发布");
    assert.ok(!items[1].completed);
    assert.equal(items[2].name, "读取平台配置");
    assert.equal(items[3].name, "校验内容字段");
    fs.rmSync(f);
  });

  it("parse: 空 PRD 返回空数组", async () => {
    const f = mkPrd(`# Empty\n\n内容`);
    const items = await p.parse(f);
    assert.equal(items.length, 0);
    fs.rmSync(f);
  });

  it("parse: 文件不存在抛错", async () => {
    await assert.rejects(() => p.parse("/nonexistent/prd.md"));
  });

  it("parseStructured: 返回完整章节结构", async () => {
    const f = mkPrd(`
# 项目 PRD

## 一、概述
这是一段描述。

## 三、功能需求
- [ ] 登录
`);
    const s = await p.parseStructured(f);
    assert.equal(s.title, "项目 PRD");
    assert.ok(s.sections.length >= 2);
    const featSec = s.sections.find(sec => sec.title.includes("功能需求"));
    assert.ok(featSec);
    assert.equal(featSec.items.length, 1);
    assert.equal(featSec.items[0].name, "登录");
    assert.ok(featSec.contentPreview);
    fs.rmSync(f);
  });

  it("splitSections: 支持 h1/h2/h3", () => {
    const sections = p.splitSections(
      "# H1\nc1\n## H2\nc2\n### H3\nc3\n"
    );
    assert.equal(sections.length, 3);
    assert.equal(sections[0].level, 1);
    assert.equal(sections[1].level, 2);
    assert.equal(sections[2].level, 3);
    assert.equal(sections[0].title, "H1");
  });

  it("isFeatureSection: 匹配中文关键词", () => {
    assert.ok(p.isFeatureSection({ title: "三、功能需求" }));
    assert.ok(p.isFeatureSection({ title: "Feature Requirements" }));
    assert.ok(!p.isFeatureSection({ title: "一、概述" }));
  });

  it("extractFeatures: checkbox + numbered + subheading", () => {
    const section = {
      content: `- [x] 已完成\n- [ ] 未完成\n1. 序号列表\n### 3.1 子标题`,
    };
    const items = p.extractFeatures(section);
    assert.equal(items.length, 4);
    assert.equal(items[0].name, "已完成");
    assert.ok(items[0].completed);
    assert.equal(items[1].name, "未完成");
    assert.ok(!items[1].completed);
    assert.equal(items[2].name, "序号列表");
    assert.equal(items[3].name, "3.1 子标题");
  });

  it("makeFeature: 生成带 id 的 feature", () => {
    const f = p.makeFeature("测试", "numbered");
    assert.ok(f.id.startsWith("feat_"));
    assert.equal(f.name, "测试");
    assert.equal(f.type, "numbered");
    assert.equal(f.source, "prd");
  });
});