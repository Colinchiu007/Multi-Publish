// @vitest-environment node
'use strict'

const { inspectAsar } = require('../../check-asar')

describe('check-asar', () => {
  it('将 Windows 归档路径归一化后识别必需入口', () => {
    const archive = {
      listPackage: vi.fn(() => [
        '\\electron\\main.js',
        '\\dist\\index.html',
        '\\node_modules\\example\\index.js',
      ]),
      statFile: vi.fn(() => ({ size: 42 })),
    }

    const result = inspectAsar('fixture.asar', archive)

    expect(result.hasMain).toBe(true)
    expect(result.hasDist).toBe(true)
    expect(result.mainSize).toBe(42)
  })
})
