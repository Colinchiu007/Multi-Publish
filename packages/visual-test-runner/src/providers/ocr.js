const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");

class OCRProvider {
  constructor(options = {}) { this.lang = options.lang || "chi_sim+eng"; }
  async extractText(image) {
    const imagePath = this._resolveImagePath(image);
    const result = await Tesseract.recognize(imagePath, this.lang, {
      logger: m => { if (m.status === "recognizing text") process.stdout.write("\rOCR: " + Math.round(m.progress * 100) + "%"); }
    });
    console.log("");
    return result.data.text;
  }
  async contains(image, expectedText) { return (await this.extractText(image)).includes(expectedText); }
  _resolveImagePath(image) {
    if (Buffer.isBuffer(image)) {
      const tempPath = path.join(require("os").tmpdir(), "ocr-" + Date.now() + ".png");
      fs.writeFileSync(tempPath, image); return tempPath;
    }
    return image;
  }
}
module.exports = { OCRProvider };