/**
 * 像素级图像对比 - 使用 Resemble.js
 * 使用方式：
 *   const diff = new PixelDiffProvider();
 *   const result = await diff.compare(baselinePath, currentPath);
 *   console.log(`差异: ${result.rawMisMatchPercentage}%`);
 */

const resemble = require('resemblejs');
const fs = require('fs');
const path = require('path');

class PixelDiffProvider {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.1; // 允许10%差异
    this.outputDir = options.outputDir || 'reports/pixel-diff';
  }

  /**
   * 对比两张图片
   * @param {string} baseline - 基线图片路径
   * @param {string} current - 当前图片路径
   * @param {string} name - 测试名称
   * @returns {Promise<Object>} 对比结果
   */
  async compare(baseline, current, name = 'diff') {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.outputDir, `${name}-${Date.now()}.png`);
      
      resemble(baseline).compareTo(current)
        .onComplete(result => {
          // 保存差异图
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, result.getBuffer());
          
          resolve({
            misMatchPercentage: result.misMatchPercentage,
            rawMisMatchPercentage: result.rawMisMatchPercentage,
            diffBounds: result.diffBounds,
            analysisTime: result.analysisTime,
            diffImagePath: outputPath,
            passed: result.misMatchPercentage < (this.threshold * 100)
          });
        })
        .ignoreColors();
    });
  }

  /**
   * 更新基线图片
   */
  async updateBaseline(current, baselinePath) {
    const data = fs.readFileSync(current);
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, data);
    return baselinePath;
  }
}

module.exports = { PixelDiffProvider };
