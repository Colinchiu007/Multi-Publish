/**
 * PRD Parser - 解析产品需求文档（为 Agent 提供结构化清单）
 *
 * 解析 Markdown PRD 产出结构化功能列表，供 Agent 阅读决策。
 * 不做匹配判断，不替代 Agent 的语义理解。
 *
 * 使用方式:
 *   const parser = new PRDParser();
 *   const items = await parser.parse("./PRD.md");
 *   // 把 items 给 Agent，由 Agent 决定如何与代码匹配
 */

const fs = require("fs");

class PRDParser {
  constructor(options = {}) {
    this.featureKeywords = options.featureKeywords || [
      "功能需求", "Feature", "特性", "Requirement", "功能列表",
      "需求", "P0", "P1", "P2",
    ];
    this.includeHeadings = options.includeHeadings !== false;
  }

  /**
   * 解析 PRD 文件，产出结构化清单
   * @returns {Promise<PRDItem[]>}
   */
  async parse(prdPath) {
    if (!fs.existsSync(prdPath)) {
      throw new Error(`PRD file not found: ${prdPath}`);
    }

    const content = fs.readFileSync(prdPath, "utf8");
    const sections = this.splitSections(content);

    const items = [];
    for (const section of sections) {
      if (this.isFeatureSection(section)) {
        items.push(...this.extractFeatures(section));
      }
    }

    return items;
  }

  /**
   * 解析整个 PRD 的结构（含章节层级）
   * 给 Agent 提供完整上下文，便于推理哪些功能属于哪个模块
   */
  async parseStructured(prdPath) {
    const content = fs.readFileSync(prdPath, "utf8");
    const sections = this.splitSections(content);

    return {
      path: prdPath,
      title: this._extractTitle(content),
      sections: sections.map(s => ({
        level: s.level,
        title: s.title,
        items: this.extractFeatures(s),
        contentPreview: s.content.slice(0, 200),
      })),
    };
  }

  splitSections(content) {
    const sections = [];
    const lines = content.split(/\r?\n/);
    let current = null;

    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
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

  isFeatureSection(section) {
    const t = (section.title || "").toLowerCase();
    return this.featureKeywords.some(kw => {
      const k = kw.toLowerCase();
      // 精确词或包含匹配
      return t.includes(k);
    });
  }

  extractFeatures(section) {
    const features = [];
    const lines = section.content.split(/\r?\n/);

    for (const line of lines) {
      const checkbox = line.match(/^-\s+\[([ x])\]\s+(.+)/);
      const numbered = line.match(/^\d+[\.、]\s+(.+)/);
      const dashed = line.match(/^-\s+(?!\[\s?\])(.+)/);
      const subHeading = line.match(/^#{3,}\s+(.+)/);

      if (checkbox) {
        features.push(this.makeFeature(checkbox[2].trim(), "checkbox", checkbox[1] === "x"));
      } else if (subHeading && this.includeHeadings) {
        features.push(this.makeFeature(subHeading[1].trim(), "heading"));
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

  _extractTitle(content) {
    const m = content.match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : "";
  }

  generateId() {
    return "feat_" + Math.random().toString(36).substr(2, 9);
  }
}

module.exports = { PRDParser };