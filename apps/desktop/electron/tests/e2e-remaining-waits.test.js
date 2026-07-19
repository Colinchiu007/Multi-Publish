// @ts-check
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const desktopRoot = path.resolve(__dirname, '../..')
const targetFiles = [
  'tests/e2e/helpers/functional-runner.js',
  'tests/e2e/routes-scan.js',
  'tests/e2e/specs/b1-core-publish.js',
]

function findMatches(source, pattern) {
  return Array.from(source.matchAll(pattern), (match) => ({
    line: source.slice(0, match.index).split(/\r?\n/).length,
    code: source.slice(match.index, source.indexOf('\n', match.index)).trim(),
  }))
}

describe('剩余 E2E 条件等待门禁', () => {
  it.each(targetFiles)('%s 不得使用猜测性 waitForTimeout', (relativePath) => {
    const source = fs.readFileSync(path.join(desktopRoot, relativePath), 'utf8')

    expect(findMatches(source, /\bwaitForTimeout\s*\(/g)).toEqual([])
  })

  it('FunctionalRunner 不得保留固定等待包装方法', () => {
    const source = fs.readFileSync(
      path.join(desktopRoot, 'tests/e2e/helpers/functional-runner.js'),
      'utf8',
    )

    expect(findMatches(source, /async\s+waitForTimeout\s*\(/g)).toEqual([])
  })
})
