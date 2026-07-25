import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'

const {
  compareTarget,
  DEFAULT_MANIFEST,
  runAudit,
  renderMarkdown,
} = require('../../tests/visual-testing/scripts/compare-yixiaoer')

function writePng(filePath, color = [255, 255, 255, 255], width = 2, height = 2) {
  const image = new PNG({ width, height })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color[0]
    image.data[offset + 1] = color[1]
    image.data[offset + 2] = color[2]
    image.data[offset + 3] = color[3]
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, PNG.sync.write(image))
}

describe('蚁小二真实基线像素审计', () => {
  it('默认 manifest 位于仓库根目录而不是 apps 目录', () => {
    expect(DEFAULT_MANIFEST).toBe(path.resolve(
      process.cwd(),
      '../../01-docs/yixiaoer-reverse/visual-baseline-manifest.json',
    ))
  })

  it('缺少真实登录态截图时，默认 manifest 明确保持外部待办状态', () => {
    const manifest = JSON.parse(fs.readFileSync(DEFAULT_MANIFEST, 'utf8'))

    expect(manifest).toMatchObject({
      capturedAt: null,
      status: 'PENDING_EXTERNAL',
    })
    expect(manifest.targets).toHaveLength(3)
    expect(manifest.targets.every(target => target.status === 'PENDING_EXTERNAL')).toBe(true)
  })

  it('相同尺寸且像素一致时通过', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yxe-pixel-pass-'))
    try {
      writePng(path.join(root, 'reference.png'))
      writePng(path.join(root, 'current.png'))

      const result = await compareTarget({
        name: 'accounts',
        reference: 'reference.png',
        current: 'current.png',
      }, { root, diffDir: path.join(root, 'diff') })

      expect(result).toMatchObject({ status: 'PASS', passed: true, dimensions: { reference: [2, 2], current: [2, 2] } })
      expect(result.mismatchPercentage).toBe(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('缺少真实参考图时标记 REFERENCE_UNVERIFIED，不能伪造通过', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yxe-pixel-reference-'))
    try {
      writePng(path.join(root, 'current.png'))

      const result = await compareTarget({
        name: 'publish',
        reference: 'captured/publish.png',
        current: 'current.png',
      }, { root })

      expect(result).toMatchObject({ status: 'REFERENCE_UNVERIFIED', passed: false, blocked: true })
      expect(result.reason).toMatch(/参考图不存在/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('参考图和当前图尺寸不一致时阻断比较', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yxe-pixel-size-'))
    try {
      writePng(path.join(root, 'reference.png'), [255, 255, 255, 255], 2, 2)
      writePng(path.join(root, 'current.png'), [255, 255, 255, 255], 3, 2)

      const result = await compareTarget({
        name: 'batch-publish',
        reference: 'reference.png',
        current: 'current.png',
      }, { root })

      expect(result).toMatchObject({ status: 'DIMENSION_MISMATCH', passed: false, blocked: true })
      expect(result.dimensions).toEqual({ reference: [2, 2], current: [3, 2] })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('批量审计汇总阻断项并生成可读报告', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yxe-pixel-report-'))
    try {
      writePng(path.join(root, 'reference.png'))
      writePng(path.join(root, 'current.png'))

      const report = await runAudit({
        root,
        targets: [
          { name: 'accounts', reference: 'reference.png', current: 'current.png' },
          { name: 'publish', reference: 'missing.png', current: 'current.png' },
        ],
      })

      expect(report.summary).toMatchObject({ total: 2, passed: 1, blocked: 1, referenceUnverified: 1 })
      expect(report.results[0].diffPath).toBe(path.join(root, 'diff', 'accounts.png'))
      expect(fs.existsSync(report.results[0].diffPath)).toBe(true)
      expect(renderMarkdown(report)).toMatch(/REFERENCE_UNVERIFIED/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
