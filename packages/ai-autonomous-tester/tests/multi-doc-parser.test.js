const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { MultiDocParser } = require("../src/parsers/multi-doc-parser");

const TMPDIR = path.join(__dirname, ".tmp-mdp-" + Date.now());

function writeDoc(filename, content) {
  fs.mkdirSync(TMPDIR, { recursive: true });
  const f = path.join(TMPDIR, filename);
  fs.writeFileSync(f, content, "utf8");
  return f;
}

describe("MultiDocParser - 文档解析器测试", () => {
  const p = new MultiDocParser({ strictMode: false });

  after(() => {
    try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch (_) {}
  });

  // ===== _detectType =====
  it("_detectType: PRD 文档", () => {
    assert.equal(p._detectType("PRD.md").type, "prd");
    assert.equal(p._detectType("PRD.md").label, "PRD 需求文档");
  });

  it("_detectType: README 文档", () => {
    assert.equal(p._detectType("README.md").type, "readme");
    assert.equal(p._detectType("README-zh.md").type, "readme");
  });

  it("_detectType: 架构/设计/集成/手册/变更日志", () => {
    assert.equal(p._detectType("ARCHITECTURE.md").type, "architecture");
    assert.equal(p._detectType("DESIGN.md").type, "design");
    assert.equal(p._detectType("INTEGRATION.md").type, "integration");
    assert.equal(p._detectType("CHANGELOG.md").type, "changelog");
    assert.equal(p._detectType("user-manual.md").type, "manual");
    assert.equal(p._detectType("使用说明.md").type, "manual");
  });

  it("_detectType: 未知类型", () => {
    assert.equal(p._detectType("other-file.md").type, "other");
  });

  // ===== parseAll =====
  it("parseAll: 单个 PRD 文档", async () => {
    const f = writeDoc("PRD.md", "# PRD\n\n## 功能需求\n- [x] 用户登录功能\n- [ ] 文章批量发布\n");
    const result = await p.parseAll([f]);
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].type, "prd");
    assert.ok(result.items.length >= 2);
  });

  it("parseAll: 多文档合并", async () => {
    const prd = writeDoc("PRD.md", "# PRD\n\n## 功能需求\n- [x] 用户登录功能\n");
    const readme = writeDoc("README.md", "# 项目\n\n## 特性\n- 高性能渲染引擎\n## 快速开始\n- npm install 安装依赖\n");
    const result = await p.parseAll([prd, readme]);
    assert.equal(result.sources.length, 2);
    const sourceTypes = [...new Set(result.items.map(i => i.sourceDoc))];
    assert.ok(sourceTypes.includes("prd"), "PRD items should have sourceDoc=prd");
    assert.ok(sourceTypes.includes("readme"), "README items should have sourceDoc=readme");
  });

  it("parseAll: 文件不存在时跳过", async () => {
    const f = writeDoc("PRD.md", "# PRD\n\n## 功能需求\n- [x] A功能模块\n");
    const result = await p.parseAll(["/nonexistent/doc.md", f]);
    assert.equal(result.sources.length, 1);
  });

  it("parseAll: 去重逻辑 — 同名功能只出现一次", async () => {
    const prd = writeDoc("PRD.md", "# PRD\n\n## 功能需求\n- [x] 用户登录功能\n");
    const readme = writeDoc("README.md", "# 项目\n\n## 特性\n- 用户登录功能\n");
    const result = await p.parseAll([prd, readme]);
    const loginItems = result.items.filter(i => i.name === "用户登录功能");
    assert.equal(loginItems.length, 1, "同名功能应去重");
  });

  it("parseAll: 空文档数组返回空结果", async () => {
    const result = await p.parseAll([]);
    assert.equal(result.items.length, 0);
    assert.equal(result.sources.length, 0);
  });

  it("parseAll: 接受字符串参数（非数组）", async () => {
    const f = writeDoc("PRD.md", "# PRD\n\n## 功能需求\n- [x] A功能模块开发\n");
    const result = await p.parseAll(f);
    assert.equal(result.sources.length, 1);
  });

  // ===== _parseReadme =====
  it("_parseReadme: 功能章节提取", async () => {
    const f = writeDoc("README.md", "# Project\n\n## Features\n- AI writing assistant\n- Multi-platform publishing\n\n## Quick Start\n- Run npm install\n- Start dev server\n");
    const items = await p._parseReadme(f);
    assert.ok(items.length >= 2);
    assert.ok(items.some(i => i.name.includes("AI")));
    assert.ok(items.some(i => i._tag === "usage-flow"));
  });

  it("_parseReadme: 中文解析", async () => {
    const f = writeDoc("README.md", "# 项目\n\n## 功能特性\n- 用户管理系统\n- 多平台内容发布\n\n## 快速开始\n- 安装项目依赖包\n");
    const items = await p._parseReadme(f);
    assert.ok(items.length >= 2);
    assert.ok(items.some(i => i.name.includes("用户管理")));
  });

  it("_parseReadme: 无功能章节返回空", async () => {
    const f = writeDoc("README.md", "# Project\n\n## Installation\n- npm install\n\n## License\n- MIT");
    const items = await p._parseReadme(f);
    assert.equal(items.length, 0);
  });

  // ===== _parseStructuredDoc =====
  it("_parseStructuredDoc: 架构文档提取功能项", async () => {
    const f = writeDoc("ARCH.md", "# Arch\n\n## Components\n- 前端模块系统\n- 后端服务网关\n\n## Data Flow\n- 请求处理流程\n");
    const items = await p._parseStructuredDoc(f, { type: "architecture", label: "架构文档" });
    assert.ok(items.length >= 1, "应有功能项被提取");
    assert.ok(items.every(i => i.source === "architecture"));
  });

  it("_parseStructuredDoc: 过滤非功能章节", async () => {
    const f = writeDoc("DESIGN.md", "# Design\n\n## 概述\n一般描述文字\n\n## UI Components\n- 按钮组件设计\n- 表单输入组件\n\n## 技术栈\n- Vue 框架\n");
    const items = await p._parseStructuredDoc(f, { type: "design", label: "设计文档" });
    assert.ok(!items.some(i => i.name.includes("概述")), "概述应被过滤");
    assert.ok(items.some(i => i.name.includes("组件")), "技术内容应保留");
  });

  it("_parseStructuredDoc: 短名称被过滤", async () => {
    const f = writeDoc("INTEGRATION.md", "# Integration\n\n## Setup\n- abc\n");
    const items = await p._parseStructuredDoc(f, { type: "integration", label: "集成说明" });
    assert.equal(items.length, 0);
  });

  // ===== _parseChangelog =====
  it("_parseChangelog: 提取最近两个版本的新增功能", async () => {
    const f = writeDoc("CHANGELOG.md", "# Changelog\n\n## [1.1.0] - 2024-01-01\n### Added\n- 新增批量发布功能\n- 新增数据分析面板\n\n## [1.0.1] - 2023-12-01\n### Fixed\n- 修复登录问题\n\n## [1.0.0] - 2023-11-01\n### Added\n- 初始版本发布\n");
    const items = await p._parseChangelog(f);
    assert.ok(items.length >= 2);
    assert.ok(items.some(i => i.name.includes("批量发布")), "应有 batch publish");
    assert.ok(items.some(i => i.name.includes("数据分析")), "应有 data analysis");
    assert.equal(items.every(i => i.source === "changelog"), true);
  });

  it("_parseChangelog: 空 CHANGELOG 返回空", async () => {
    const f = writeDoc("CHANGELOG.md", "# Changelog\n\nNothing here.\n");
    const items = await p._parseChangelog(f);
    assert.equal(items.length, 0);
  });

  // ===== _parseGeneric =====
  it("_parseGeneric: 通用文档解析", async () => {
    const f = writeDoc("OTHER.md", "# Other\n\n## Section One\n- 前端功能模块开发\n- 后端接口实现\n\n## Section Two\n- 数据库表结构设计\n");
    const items = await p._parseGeneric(f);
    assert.ok(items.length >= 2);
  });

  it("_parseGeneric: 短名称过滤", async () => {
    const f = writeDoc("OTHER.md", "# Other\n\n## Section\n- a");
    const items = await p._parseGeneric(f);
    assert.equal(items.length, 0);
  });
});
