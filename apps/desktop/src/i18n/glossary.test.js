import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import zh from '@/locales/zh'
import en from '@/locales/en'

const GLOSSARY_FILE = path.resolve(__dirname, '../../../../01-docs/i18n-glossary.md')

function parseGlossary (content) {
  const entries = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.split('|').map(c => c.trim())
    // 表头行（含 zh / en 列名）与分隔行跳过
    if (cells[1] === 'zh' || /^-+$/.test(cells[1] || '')) continue
    const zhTerm = cells[1]
    const enTerm = cells[2]
    if (!zhTerm || !enTerm) continue
    entries.push({ zh: zhTerm, en: enTerm })
  }
  return entries
}

function allStringValues (node, out = []) {
  for (const value of Object.values(node)) {
    if (typeof value === 'string') out.push(value)
    else if (value && typeof value === 'object') allStringValues(value, out)
  }
  return out
}

describe('多语言术语词典（i18n-content-sync L3）', () => {
  const content = fs.readFileSync(GLOSSARY_FILE, 'utf8')
  const entries = parseGlossary(content)

  it('术语词典至少登记了核心产品名词', () => {
    expect(entries.length).toBeGreaterThan(0)
    const zhTerms = entries.map(e => e.zh)
    expect(zhTerms).toContain('全能创作')
    expect(zhTerms).toContain('启动流水线')
  })

  it('词典中的每个术语在 zh/en locale 中出现状态一致（防止只改中文没改英文）', () => {
    const zhValues = allStringValues(zh)
    const enValues = allStringValues(en)
    for (const entry of entries) {
      const zhUsed = zhValues.some(v => v.includes(entry.zh))
      // en 侧不区分大小写（兼容 'pipeline' / 'Pipeline' 等用法差异）
      const enUsed = enValues.some(v => v.toLowerCase().includes(entry.en.toLowerCase()))
      expect(zhUsed, `术语「${entry.zh} / ${entry.en}」在 zh locale 中${zhUsed ? '已' : '未'}出现，但 en locale ${enUsed ? '已' : '未'}出现——zh/en 出现状态不一致，请成对同步`).toBe(enUsed)
    }
  })
})
