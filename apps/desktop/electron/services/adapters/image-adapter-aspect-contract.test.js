// @ts-check
/**
 * image-adapter-aspect-contract.test.js — 图片适配器宽高比参数契约结构锁
 *
 * 防再犯（2026-10-02 fix-s2v-portrait-image-aspect，Bug 反思循环 ⑤ 预防措施）：
 *
 * 根因复盘：agnes-image.js 历史实现把 Agnes API 请求体字段名 `ratio` 误用作
 * 输入参数契约名（`params.ratio`），而流水线统一契约键是 `aspect_ratio`（snake_case，
 * asset-generator / story2video-stages）与 `aspectRatio`（camelCase，normalizer /
 * agnes-multimodal generateVideo）。参数名不匹配导致 Story2Video 竖屏（9:16）的
 * 生成请求被静默丢弃，永远回退 16:9 横屏：成片 720x1280 竖屏、两侧黑边
 * （实测项目 mur2tzc8_ru1r 的 segment_0000_image.png 为 2624x1472）。
 *
 * 逃逸链：单元测试只断言了 `params.ratio` 的回显（没有断言契约键）；适配器边界
 * 无统一契约测试；code review 未检查参数键与调用方的一致性。
 *
 * 本锁的定位：**结构锁**（扫描源码参数解析表达式），不 mock 网络、不发起请求。
 * 配套行为锁在各自 *.test.js 的「2026-10-02 回归」用例（真实执行 generateImage
 * 并断言请求体）。反证纪律：把任一适配器的解析表达式改回单键（删掉 aspectRatio
 * 或 aspect_ratio 分支），本文件对应断言立即变红。
 */

const fs = require('fs')
const path = require('path')

const ADAPTERS_DIR = path.join(__dirname)

function readSource(fileName) {
  return fs.readFileSync(path.join(ADAPTERS_DIR, fileName), 'utf8')
}

describe('图片适配器宽高比参数契约结构锁（2026-10-02 回归）', () => {
  it('agnes-image.js 必须同时接受 aspect_ratio 与 aspectRatio 键（+保留 ratio 兼容）', () => {
    const source = readSource('agnes-image.js')
    expect(source).toMatch(/params\.aspect_ratio\s*\|\|\s*params\.aspectRatio\s*\|\|\s*params\.ratio/)
  })

  it('agnes-multimodal.js 的 generateVideo 显式画幅解析必须含 aspect_ratio 分支（既有契约）', () => {
    const source = readSource('agnes-multimodal.js')
    expect(source).toMatch(/params\.aspect_ratio\s*\|\|\s*params\.aspectRatio\s*\|\|\s*pickAspectRatio/)
  })

  it('minimax-image.js 必须消费 aspect_ratio（既有契约）', () => {
    const source = readSource('minimax-image.js')
    expect(source).toMatch(/params\.aspect_ratio\s*\|\|\s*parseAspectRatio/)
  })

  it('imagen.js 的 resolveAspectRatio 必须含 aspectRatio 与 aspect_ratio 两个分支（既有契约）', () => {
    const source = readSource('imagen.js')
    expect(source).toMatch(/params\?\.aspectRatio/)
    expect(source).toMatch(/params\?\.aspect_ratio/)
  })

  it('asset-generator.js 必须把 aspect_ratio 与 aspectRatio 双键传给 aiGenerator（既有契约）', () => {
    const source = readSource('../asset-generator.js')
    expect(source).toMatch(/aspect_ratio:\s*opts\.aspect_ratio/)
    expect(source).toMatch(/aspectRatio:\s*opts\.aspect_ratio/)
  })

  it('story2video-stages.js 的 generate_assets 阶段必须把 aspect_ratio 传给 assetGenerator 与 legacy 路径（既有契约）', () => {
    const source = readSource('../story2video-stages.js')
    // generateOneImage（assetGenerator 路径）
    expect(source).toMatch(/aspect_ratio:\s*aspectRatio/)
    // legacy Python 路径（callPythonSkill('generate_image', ...)）
    expect(source).toMatch(/aspect_ratio:\s*aspectRatio,\s*\n\s*runId/)
  })
})
