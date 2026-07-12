/** @visual-test-runner/core - 像素对比+OCR+A11y+API测试 */
const{VisualTestRunner}=require("./src/test-runner");
const{PixelDiffProvider}=require("./src/providers/pixel-diff");
const{OCRProvider}=require("./src/providers/ocr");
const{A11yProvider}=require("./src/providers/a11y");
module.exports={VisualTestRunner,PixelDiffProvider,OCRProvider,A11yProvider}