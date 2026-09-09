// @ts-check
/**
 * file-parser.test.js — 文件解析器单测
 *
 * 使用真实临时文件，覆盖：
 * - .txt UTF-8 解析、标题、内容截断
 * - .md frontmatter 剥离、标题提取
 * - isSupportedFile 判定
 * - 不支持格式抛错
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

let tmpDir
let parser

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-parser-test-'))
  const mod = await import('./file-parser')
  parser = mod
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function write (name, content, encoding) {
  const p = path.join(tmpDir, name)
  fs.writeFileSync(p, content, encoding || 'utf8')
  return p
}

describe('FileParser', () => {
  it('parseTxt 解析 UTF-8 文本，取首行作标题', () => {
    const p = write('a.txt', '这是标题\n第一行正文\n第二行正文')
    const r = parser.parseTxt(p)
    expect(r.title).toBe('这是标题')
    expect(r.content).toContain('第一行正文')
    expect(r.content).toContain('第二行正文')
  })

  it('parseTxt 内容超过 50000 字符被截断', () => {
    const big = 'x'.repeat(60000)
    const p = write('big.txt', big)
    const r = parser.parseTxt(p)
    expect(r.content.length).toBeLessThanOrEqual(50000)
    expect(r.content.length).toBe(50000)
  })

  it('parseTxt 标题超过 100 字符被截断', () => {
    const p = write('long-title.txt', 'y'.repeat(150) + '\n正文')
    const r = parser.parseTxt(p)
    expect(r.title.length).toBeLessThanOrEqual(100)
  })

  it('parseMd 剥离 frontmatter 并取首个 # 标题', () => {
    const p = write('doc.md', '---\ntitle: 元数据\n---\n# 主标题\n正文内容')
    const r = parser.parseMd(p)
    expect(r.title).toBe('主标题')
    expect(r.content).not.toContain('title: 元数据')
    expect(r.content).toContain('正文内容')
  })

  it('parseMd 无标题时返回空标题', () => {
    const p = write('no-title.md', '纯文本没有标题')
    const r = parser.parseMd(p)
    expect(r.title).toBe('')
    expect(r.content).toContain('纯文本没有标题')
  })

  it('isSupportedFile 判定扩展名', () => {
    expect(parser.isSupportedFile('a.txt')).toBe(true)
    expect(parser.isSupportedFile('a.md')).toBe(true)
    expect(parser.isSupportedFile('a.docx')).toBe(true)
    expect(parser.isSupportedFile('a.doc')).toBe(true)
    expect(parser.isSupportedFile('a.pdf')).toBe(false)
    expect(parser.isSupportedFile('a.png')).toBe(false)
  })

  it('parseFile 按扩展名分发', async () => {
    const p = write('dispatch.md', '# 标题\n内容')
    const r = await parser.parseFile(p)
    expect(r.title).toBe('标题')
  })

  it('parseFile 不支持格式抛错', async () => {
    const p = write('bad.pdf', 'x')
    await expect(parser.parseFile(p)).rejects.toThrow(/Unsupported file format/)
  })
})
