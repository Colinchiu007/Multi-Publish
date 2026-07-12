/**
 * OCR文字识别 - 使用 Tesseract.js
 * 使用方式：
 *   const ocr = new OCRProvider();
 *   const text = await ocr.extractText(screenshotPath);
 */

const Tesseract = require('tesseract.js');
const fs = require('fs');

class OCRProvider {
  constructor(options = {}) {
    this.lang = options.lang || 'chi_sim+eng'; // 简体中文+英文
    this.worker = null;
  }

  /**
   * 从图片提取文字
   * @param {string|Buffer} image - 图片路径或Buffer
   * @returns {Promise<string>} 提取的文字
   */
  async extractText(image) {
    const imagePath = this._resolveImagePath(image);
    
    const result = await Tesseract.recognize(imagePath, this.lang, {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\rOCR进度: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    console.log(''); // 换行
    return result.data.text;
  }

  /**
   * 检查提取的文字是否包含指定内容
   */
  async contains(image, expectedText) {
    const text = await this.extractText(image);
    return text.includes(expectedText);
  }

  /**
   * 获取文字位置信息（用于验证布局）
   */
  async getTextPositions(image) {
    const imagePath = this._resolveImagePath(image);
    
    const result = await Tesseract.recognize(imagePath, this.lang);
    return result.data.words.map(w => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox
    }));
  }

  _resolveImagePath(image) {
    if (Buffer.isBuffer(image)) {
      const tempPath = path.join(require('os').tmpdir(), `ocr-${Date.now()}.png`);
      fs.writeFileSync(tempPath, image);
      return tempPath;
    }
    return image;
  }
}

module.exports = { OCRProvider };
