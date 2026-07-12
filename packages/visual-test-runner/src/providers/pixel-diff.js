const resemble = require("resemblejs");
const fs = require("fs");
const path = require("path");

class PixelDiffProvider {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.1;
    this.outputDir = options.outputDir || "reports/pixel-diff";
  }
  async compare(baseline, current, name = "diff") {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.outputDir, name + "-" + Date.now() + ".png");
      resemble(baseline).compareTo(current).onComplete(result => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, result.getBuffer());
        resolve({ misMatchPercentage: result.misMatchPercentage, rawMisMatchPercentage: result.rawMisMatchPercentage, diffBounds: result.diffBounds, analysisTime: result.analysisTime, diffImagePath: outputPath, passed: result.misMatchPercentage < (this.threshold * 100) });
      }).ignoreColors();
    });
  }
}
module.exports = { PixelDiffProvider };