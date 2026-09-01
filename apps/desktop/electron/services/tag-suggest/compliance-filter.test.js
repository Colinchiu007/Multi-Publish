// @ts-check
/**
 * compliance-filter — 单元测试
 */
const {
  loadBlocklist,
  toHalfWidth,
  validateLength,
  hasSpaces,
  isBlocked,
  dedupe,
  sanitize,
  filterTags,
} = require('./compliance-filter')

describe('compliance-filter', () => {
  describe('loadBlocklist', () => {
    it('loads global blocklist from data dir', () => {
      const bl = loadBlocklist()
      expect(bl.version).toBe(1)
      expect(Array.isArray(bl.global)).toBe(true)
      expect(bl.global.length).toBeGreaterThan(0)
      expect(bl.platforms.xiaohongshu).toBeDefined()
    })

    it('falls back to empty on missing data', () => {
      const bl = loadBlocklist('C:/nonexistent-dir')
      expect(bl.global).toEqual([])
    })
  })

  describe('toHalfWidth', () => {
    it('converts full-width to half-width', () => {
      expect(toHalfWidth('ＡＢＣ')).toBe('ABC')
      expect(toHalfWidth('１２３')).toBe('123')
    })
  })

  describe('validateLength', () => {
   it('accepts Chinese tags up to 8 chars', () => {
     expect(validateLength('人工智能')).toBe(true)
      expect(validateLength('人工智能深度学习')).toBe(true)
      expect(validateLength('人工智能深度学习大模型')).toBe(false)
   })

    it('accepts English tags up to 30 chars', () => {
      expect(validateLength('machinelearning')).toBe(true)
      expect(validateLength('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true)
      expect(validateLength('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
    })

    it('returns false for empty', () => {
      expect(validateLength('')).toBe(false)
    })
  })

  describe('hasSpaces', () => {
    it('detects whitespace', () => {
      expect(hasSpaces('人工智能 深度学习')).toBe(true)
      expect(hasSpaces('人工智能')).toBe(false)
    })
  })

  describe('isBlocked', () => {
    it('blocks global blocklist words', () => {
      const bl = loadBlocklist()
      expect(isBlocked('赌博', bl)).toBe(true)
      expect(isBlocked('正常标签', bl)).toBe(false)
    })

    it('blocks platform-specific words', () => {
      const bl = loadBlocklist()
      expect(isBlocked('代购', bl, 'xiaohongshu')).toBe(true)
      expect(isBlocked('代购', bl, 'zhihu')).toBe(false)
    })

    it('is case-insensitive and full-width aware', () => {
      const bl = { global: ['test'], platforms: {} }
      expect(isBlocked('TEST', bl)).toBe(true)
      expect(isBlocked('ＴＥＳＴ', bl)).toBe(true)
    })
  })

  describe('dedupe', () => {
    it('dedupes ignoring hash prefix', () => {
      expect(dedupe(['人工智能', '#人工智能#', 'AI', '#AI'])).toEqual(['人工智能', 'AI'])
    })
  })

  describe('sanitize', () => {
    it('removes zero-width and control chars', () => {
      expect(sanitize('人工智能' + String.fromCharCode(0x200B) + '深度学习')).toBe('人工智能深度学习')
      expect(sanitize(String.fromCharCode(0) + 'AI' + String.fromCharCode(7))).toBe('AI')
    })
  })

  describe('filterTags', () => {
    it('filters length, spaces, blocklist, dedupe', () => {
      const tags = ['人工智能', '#人工智能#', '深度学习 大模型', '赌博', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '正常标签']
      const out = filterTags(tags, 'zhihu')
      expect(out).toContain('人工智能')
      expect(out).toContain('正常标签')
      expect(out).not.toContain('赌博')
      expect(out).not.toContain('深度学习 大模型')
      expect(out).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      // dedupe: 人工智能 appears once
      expect(out.filter(t => t === '人工智能').length).toBe(1)
    })

    it('adds hash prefix for hash platforms', () => {
      const out = filterTags(['人工智能'], 'weibo')
      expect(out).toEqual(['#人工智能'])
    })
  })
})
