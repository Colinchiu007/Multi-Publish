/**
 * PRD Parser - 解析产品需求文档
 *
 * 支持从 Markdown PRD 中提取功能列表:
 * - `- [ ]` / `- [x]` 复选框
 * - 编号列表 `1.` / 列表 `-`
 * - 三级编号标题 `### 1.1 xxx` (叙述式 PRD 常用)
 *
 * 使用方式:
 *   const { PRDParser } = require("@multi-publish/ai-autonomous-tester");
 *   const parser = new PRDParser();
 *   const features = await parser.parse("./PRD.md");
 */

const fs = require("fs");

class PRDParser {
  constructor(options = {}) {
    this.featureKeywords = options.featureKeywords || [
      "功能需求", "Feature", "特性", "Requirement", "功能列表",
    ];
    this.includeHeadings = options.includeHeadings !== false;
  }

  /**
   * 解析 PRD 文件
   */
  async parse(prdPath) {
    if (!fs.existsSync(prdPath)) {
      throw new Error(`PRD file not found: ${prdPath}`);
    }

    const content = fs.readFileSync(prdPath, "utf8");
    const sections = this.splitSections(content);

    const features = [];
    for (const section of sections) {
      if (this.isFeatureSection(section)) {
        features.push(...this.extractFeatures(section));
      }
    }

    return features;
  }

  /**
   * 按一级/二级标题切分（兼容 CRLF/LF），三级标题作为内容保留
   */
  splitSections(content) {
    const sections = [];
    const lines = content.split(/\r?\n/);
    let current = null;

    for (const line of lines) {
      const match = line.match(/^(#{1,2})\s+(.+?)\s*$/);
      if (match) {
        if (current) sections.push(current);
        current = {
          level: match[1].length,
          title: match[2].trim(),
          content: "",
        };
      } else if (current) {
        current.content += line + "\n";
      }
    }

    if (current) sections.push(current);
    return sections;
  }

  /**
   * 判断是否为功能章节
   */
  isFeatureSection(section) {
    return this.featureKeywords.some(kw =>
      section.title.toLowerCase().includes(kw.toLowerCase())
    );
  }

  /**
   * 提取功能条目
   */
  extractFeatures(section) {
    const features = [];
    const lines = section.content.split(/\r?\n/);

    for (const line of lines) {
      const checkbox = line.match(/^-\s+\[([ x])\]\s+(.+)/);
      const numbered = line.match(/^\d+\.\s+(.+)/);
      const dashed = line.match(/^-\s+(?!\[\s?\])(.+)/);
      const subHeading = line.match(/^###\s+(\d+\.\d+)\s+(.+)/);

      if (checkbox) {
        features.push(this.makeFeature(checkbox[2].trim(), "checkbox", checkbox[1] === "x"));
      } else if (subHeading && this.includeHeadings) {
        features.push(this.makeFeature(`${subHeading[1]} ${subHeading[2].trim()}`, "heading"));
      } else if (numbered) {
        features.push(this.makeFeature(numbered[1].trim(), "numbered"));
      } else if (dashed) {
        features.push(this.makeFeature(dashed[1].trim(), "list"));
      }
    }

    return features;
  }

  makeFeature(name, type, completed = false) {
    return {
      id: this.generateId(),
      name,
      completed,
      type,
      source: "prd",
    };
  }

  generateId() {
    return "feat_" + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = { PRDParser };
