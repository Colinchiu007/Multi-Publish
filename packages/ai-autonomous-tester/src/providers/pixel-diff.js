/**
 * 像素级图像对比 - 使用 Resemble.js
 * 使用方式：
 *   const diff = new PixelDiffProvider();
 *   const result = await diff.compare(baselinePath, currentPath);
 *   console.log(`差异: ${result.rawMisMatchPercentage}%`);
 */

// resemblejs 依赖 node-canvas 原生模块，缺失时使用保守的二进制比较。
let resemble = null;
let _available = false;
try {
  resemble = require('resemblejs');
  _available = true;
} catch (_e) {
  _available = false;
}
const fs = require('fs');
const path = require('path');

const IMAGE_SIGNATURES = [
  buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  buffer => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  buffer => buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  buffer => buffer.subarray(0, 2).toString('ascii') === 'BM',
];

async function validateImage(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError(`${label}图片路径必须是非空字符串`);
  }

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const signature = header.subarray(0, bytesRead);
    if (!IMAGE_SIGNATURES.some(matches => matches(signature))) {
      const error = new Error(`${label}不是受支持的图片：${filePath}`);
      error.code = 'ERR_INVALID_IMAGE';
      throw error;
    }
  } finally {
    await handle.close();
  }
}

async function compareBinaryFallback(baseline, current, threshold) {
  const [baselineBuffer, currentBuffer] = await Promise.all([
    fs.promises.readFile(baseline),
    fs.promises.readFile(current),
  ]);
  const misMatchPercentage = baselineBuffer.equals(currentBuffer) ? 0 : 100;
  return {
    skipped: false,
    comparisonMode: 'binary-fallback',
    reason: 'Resemble.js 不可用，已执行保守的二进制比较',
    misMatchPercentage,
    rawMisMatchPercentage: misMatchPercentage,
    diffBounds: null,
    analysisTime: 0,
    diffImagePath: null,
    passed: misMatchPercentage <= threshold * 100,
  };
}

class PixelDiffProvider {
  constructor(options = {}) {
    this.threshold = options.threshold ?? 0.1; // 允许10%差异
    this.outputDir = options.outputDir || 'reports/pixel-diff';
    this.available = _available;
  }

  /**
   * 对比两张图片
   * @param {string} baseline - 基线图片路径
   * @param {string} current - 当前图片路径
   * @param {string} name - 测试名称
   * @returns {Promise<Object>} 对比结果
   */
  async compare(baseline, current, name = 'diff') {
    await Promise.all([
      validateImage(baseline, '基线'),
      validateImage(current, '当前'),
    ]);

    if (!this.available) {
      return compareBinaryFallback(baseline, current, this.threshold);
    }
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.outputDir, `${name}-${Date.now()}.png`);

      try {
        resemble(baseline).compareTo(current).onComplete(result => {
          try {
            const misMatchPercentage = Number(result.misMatchPercentage);
            if (!Number.isFinite(misMatchPercentage)) {
              throw new Error('像素对比返回了无效的差异比例');
            }
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            fs.writeFileSync(outputPath, result.getBuffer());

            resolve({
              misMatchPercentage,
              rawMisMatchPercentage: Number(result.rawMisMatchPercentage),
              diffBounds: result.diffBounds,
              analysisTime: result.analysisTime,
              diffImagePath: outputPath,
              passed: misMatchPercentage <= this.threshold * 100,
            });
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
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
