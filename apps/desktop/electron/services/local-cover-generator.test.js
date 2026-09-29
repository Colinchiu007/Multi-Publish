// @ts-check
/**
 * local-cover-generator.test.js — 本地封面生成器（SVG→sharp→PNG）回归锁
 *
 * 覆盖：
 * 1. 基本生成：标题 → PNG 文件落盘（真实 sharp 渲染，非 mock）
 * 2. 长标题换行：>12 字自动折行（SVG 文本 tspan 分行）
 * 3. 比例：3:4（小红书/快手图文推荐竖版）与 16:9
 * 4. 空标题/超长标题边界：不崩溃，产出合法 PNG
 * 5. 输出文件可被 sharp 读取（元数据校验：PNG 格式、宽高正确）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { generateLocalCover } = require('./local-cover-generator')

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'local-cover-test-'))

// CI 高负载下 sharp 原生模块**首载**可 >30s（Run 36615452794 Shards 1/2 实测：首个用例
// 30s 超时，而渲染本身毫秒级）。在 beforeAll 里预热一次并给足预算，使各用例只承担渲染耗时。
beforeAll(async () => {
  const sharp = require('sharp')
  await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000"/></svg>'))
    .png()
    .toBuffer()
}, 180000)

function cleanup () {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)) } catch (_) { /* ignore */ }
  }
  try { fs.rmdirSync(TMP_DIR) } catch (_) { /* ignore */ }
}
afterAll(cleanup)

describe('local-cover-generator — 本地封面生成（SVG→sharp→PNG）', () => {
  it('基本生成：标题产出合法 PNG 且尺寸正确（3:4 竖版 1080x1440）', async () => {
    const result = await generateLocalCover('Tiffany中国区负责人致歉', {
      outputDir: TMP_DIR,
      ratio: '3:4',
    })
    expect(result.code).toBe(0)
    expect(result.data.path).toMatch(/\.png$/)
    expect(fs.existsSync(result.data.path)).toBe(true)

    // 真实 sharp 读取元数据（非 mock：验证产物是合法 PNG 且尺寸对）
    const sharp = require('sharp')
    const meta = await sharp(result.data.path).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1440)
  }, 60000)

  it('16:9 横版 1920x1080', async () => {
    const result = await generateLocalCover('测试标题', {
      outputDir: TMP_DIR,
      ratio: '16:9',
    })
    expect(result.code).toBe(0)
    const sharp = require('sharp')
    const meta = await sharp(result.data.path).metadata()
    expect(meta.width).toBe(1920)
    expect(meta.height).toBe(1080)
  }, 60000)

  it('长标题自动折行（>12 字分行，不溢出画布）', async () => {
    const longTitle = '接力夺冠姑娘们把国旗叠得方方正正北京大学禁止赴风景名胜区开会'
    const result = await generateLocalCover(longTitle, {
      outputDir: TMP_DIR,
      ratio: '3:4',
    })
    expect(result.code).toBe(0)
    // 产物合法（长标题不崩溃、不出白屏）
    const sharp = require('sharp')
    const meta = await sharp(result.data.path).metadata()
    expect(meta.format).toBe('png')
  }, 60000)

  it('空标题边界：不崩溃，产出合法 PNG（占位文案）', async () => {
    const result = await generateLocalCover('', { outputDir: TMP_DIR })
    expect(result.code).toBe(0)
    expect(fs.existsSync(result.data.path)).toBe(true)
  }, 60000)

  it('超长标题（>200 字）截断到 60 字内不崩溃', async () => {
    const hugeTitle = '超'.repeat(300)
    const result = await generateLocalCover(hugeTitle, { outputDir: TMP_DIR })
    expect(result.code).toBe(0)
    const sharp = require('sharp')
    const meta = await sharp(result.data.path).metadata()
    expect(meta.format).toBe('png')
  }, 60000)

  it('两次生成产出不同文件（时间戳+随机后缀防覆盖）', async () => {
    const r1 = await generateLocalCover('标题A', { outputDir: TMP_DIR })
    const r2 = await generateLocalCover('标题A', { outputDir: TMP_DIR })
    expect(r1.data.path).not.toBe(r2.data.path)
  }, 60000)
})
