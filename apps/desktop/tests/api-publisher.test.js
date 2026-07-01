/**
 * API 封装层测试
 * 验证 @/api/publisher 所有导出函数定义正确
 * 使用文件解析方式（publisher.js 使用 ESM export，Jest 需 transform）
 */
const path = require('path')
const fs = require('fs')

const publisherPath = path.join(__dirname, '..', 'src', 'api', 'publisher.js')
const source = fs.readFileSync(publisherPath, 'utf-8')

describe('api/publisher', () => {
  // Extract all exported function names from source
  const exportMatches = source.matchAll(/export (?:async )?function (\w+)/g)
  const exportedFns = Array.from(exportMatches, m => m[1])

  it('exports at least 60 functions (was 17 before PR #70)', () => {
    expect(exportedFns.length).toBeGreaterThanOrEqual(60)
  })

  it('all exported function names follow camelCase', () => {
    for (const fn of exportedFns) {
      expect(fn).toMatch(/^[a-z][a-zA-Z0-9]*$/)
    }
  })

  it('no duplicate function names', () => {
    const unique = new Set(exportedFns)
    expect(unique.size).toBe(exportedFns.length)
  })

  // Verify key render/intelligence/viral functions are exported
  it('includes render API functions', () => {
    const renderFns = ['renderStart', 'renderCancel', 'renderGetStatus',
      'onRenderProgress', 'onRenderComplete', 'onRenderError']
    for (const fn of renderFns) {
      expect(exportedFns).toContain(fn)
    }
  })

  it('includes intelligence API functions', () => {
    const intelFns = ['intelligenceSearch', 'intelligenceSearchTitles',
      'intelligenceFetchTrending', 'intelligenceSuggestTags']
    for (const fn of intelFns) {
      expect(exportedFns).toContain(fn)
    }
  })

  it('includes keyword/viral API functions', () => {
    const fns = ['keywordStatus', 'keywordStart', 'viralAnalyze', 'viralGenerate']
    for (const fn of fns) {
      expect(exportedFns).toContain(fn)
    }
  })

  // Verify the all-important getApi guard is present
  it('every function checks getApi()', () => {
    // Skip event listener functions (onXxx) which return cleanup functions
    const invokeFns = exportedFns.filter(fn => !fn.startsWith('on'))
    for (const fn of invokeFns) {
      const fnIndex = source.indexOf(`export async function ${fn}`) !== -1
        ? source.indexOf(`export async function ${fn}`)
        : source.indexOf(`export function ${fn}`)
      
      // Find the function body (between { and matching })
      const bodyStart = source.indexOf('{', fnIndex) + 1
      const bodyEnd = source.indexOf('\n}', fnIndex)
      const body = source.slice(bodyStart, bodyEnd)
      
      // Verify it calls getApi() or handles missing electronAPI
      if (!fn.startsWith('on')) {
        expect(body).toMatch(/getApi|electronAPI/)
      }
    }
  })
})
