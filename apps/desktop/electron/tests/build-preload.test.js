// @vitest-environment node
import { describe, expect, it } from 'vitest'

const fs = require('fs')
const path = require('path')

describe('preload 单文件构建', () => {
  it('声明直接构建依赖，避免依赖包提升变化导致打包失败', () => {
    const packageJson = require('../../package.json')

    expect(packageJson.devDependencies).toHaveProperty('esbuild')
    expect(packageJson.scripts['build:preload']).toBe('node scripts/build-preload.js')
    expect(packageJson.scripts['test:preload:sandbox'])
      .toBe('npm run build:preload && node scripts/verify-preload-sandbox.js')
    expect(packageJson.build.beforePack).toBe('scripts/before-pack.js')
  })

  it('输出不包含 sandbox 禁止的本地 require', async () => {
    const { buildPreload } = require('../../scripts/build-preload')
    const result = await buildPreload({ write: false })
    const code = result.outputFiles[0].text

    expect(code).toMatch(/require\(["']electron["']\)/)
    expect(code).not.toMatch(/require\(["']\.{1,2}[\\/]/)
  })

  it('提交的 bundle 与当前 preload 源码保持一致', async () => {
    const { buildPreload, OUTPUT_FILE } = require('../../scripts/build-preload')
    const result = await buildPreload({ write: false })
    const committedBundle = fs.readFileSync(OUTPUT_FILE, 'utf8')

    expect(path.basename(OUTPUT_FILE)).toBe('index.bundle.js')
    expect(result.outputFiles[0].text).toBe(committedBundle)
  })
})
