import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/cohere-design-system.css'), 'utf8')

function ruleBody (selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'))
  return match?.[1] || ''
}

describe('顶部导航布局合同', () => {
  it('主导航保持单行并在空间不足时横向滚动', () => {
    const body = ruleBody('.cohere-topnav .nav-primary')
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/min-width:\s*0/)
    expect(body).toMatch(/overflow-x:\s*auto/)
    expect(body).toMatch(/white-space:\s*nowrap/)
  })

  it('导航项和右侧操作区不会被压缩换行', () => {
    expect(ruleBody('.cohere-topnav .nav-item')).toMatch(/flex:\s*0\s+0\s+auto/)
    expect(ruleBody('.cohere-topnav .nav-right')).toMatch(/flex:\s*0\s+0\s+auto/)
    expect(ruleBody('.cohere-topnav .nav-right')).toMatch(/margin-left:\s*auto/)
  })
})
