// @ts-check
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const desktopRoot = path.resolve(__dirname, '../..')
const helperFiles = [
  'tests/e2e/helpers/integration-flows.js',
  'tests/e2e/helpers/route-functional-suite.js',
]

describe('E2E 条件等待门禁', () => {
  it.each(helperFiles)('%s 不得使用猜测性 waitForTimeout', (relativePath) => {
    const source = fs.readFileSync(path.join(desktopRoot, relativePath), 'utf8')
    const violations = Array.from(source.matchAll(/\bwaitForTimeout\s*\(/g), (match) => ({
      line: source.slice(0, match.index).split(/\r?\n/).length,
      code: source.slice(match.index, source.indexOf('\n', match.index)).trim(),
    }))

    expect(violations).toEqual([])
  })
})
