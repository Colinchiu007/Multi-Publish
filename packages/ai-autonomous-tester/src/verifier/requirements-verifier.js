/**
 * RequirementsVerifier - 需求验证器
 *
 * 比对 PRD 功能点与应用实现功能点，计算覆盖率
 *
 * 使用方式:
 *   const { RequirementsVerifier } = require("@multi-publish/ai-autonomous-tester");
 *   const verifier = new RequirementsVerifier();
 *   const result = await verifier.verify("./PRD.md", { srcDir: "./src" });
 */

const { PRDParser } = require("../parsers/prd-parser");
const { FeatureDetector } = require("../detectors/feature-detector");

class RequirementsVerifier {
  constructor(options = {}) {
    this.prdParser = options.prdParser || new PRDParser();
    this.featureDetector = options.featureDetector || new FeatureDetector(options);
  }

  /**
   * 验证需求覆盖
   * @param {string} prdPath
   * @param {Object} appContext - { srcDir }
   */
  async verify(prdPath, appContext = {}) {
    const prdFeatures = await this.prdParser.parse(prdPath);
    const implementedFeatures = await this.featureDetector.detect();

    const covered = [];
    const uncovered = [];

    for (const prdFeature of prdFeatures) {
      const match = implementedFeatures.find(impl =>
        this.isMatch(prdFeature.name, impl.name)
      );

      if (match) {
        covered.push({ prdFeature, implemented: match, status: "COVERED" });
      } else {
        uncovered.push({
          prdFeature,
          status: "NOT_IMPLEMENTED",
          effort: this.estimateEffort(prdFeature),
        });
      }
    }

    const coverageRate = prdFeatures.length > 0
      ? covered.length / prdFeatures.length
      : 1;

    return {
      covered,
      uncovered,
      conflicts: [],
      coverageRate,
      totalPrdFeatures: prdFeatures.length,
      totalImplementedFeatures: implementedFeatures.length,
    };
  }

  /**
   * 功能名匹配（简化）
   */
  isMatch(prdName, implName) {
    const normalize = s => (s || "").toLowerCase().replace(/[^\w\u4e00-\u9fa5]/g, "");
    const a = normalize(prdName);
    const b = normalize(implName);
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  }

  /**
   * 估算工作量
   */
  estimateEffort(feature) {
    const simpleKeywords = ["显示", "展示", "提示", "按钮", "show", "display"];
    const complexKeywords = ["导入", "导出", "批量", "自动化", "import", "export", "batch"];

    const name = (feature.name || "").toLowerCase();
    if (complexKeywords.some(k => name.includes(k.toLowerCase()))) return "HIGH";
    if (simpleKeywords.some(k => name.includes(k.toLowerCase()))) return "LOW";
    return "MEDIUM";
  }
}

module.exports = { RequirementsVerifier };
