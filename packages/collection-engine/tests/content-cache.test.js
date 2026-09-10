import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { ContentCache, hashKey } = req('../src/content-cache')

describe('hashKey', () => {
  it('should produce stable hash for same input', () => {
    const h1 = hashKey('https://example.com/a', 'hello')
    const h2 = hashKey('https://example.com/a', 'hello')
    expect(h1).toBe(h2)
  })

  it('should differ for different URLs', () => {
    const h1 = hashKey('https://example.com/a', 'x')
    const h2 = hashKey('https://example.com/b', 'x')
    expect(h1).not.toBe(h2)
  })

  it('should differ for different content', () => {
    const h1 = hashKey('https://example.com/a', 'hello')
    const h2 = hashKey('https://example.com/a', 'world')
    expect(h1).not.toBe(h2)
  })
})

describe('ContentCache', () => {
  let cache

  beforeEach(() => {
    cache = new ContentCache({ maxSize: 100 })
  })

  it('should not have uncached content', () => {
    expect(cache.has('https://example.com/a')).toBe(false)
  })

  it('should find cached content', () => {
    cache.mark('https://example.com/a', 'hello world')
    expect(cache.has('https://example.com/a', 'hello world')).toBe(true)
  })

  it('should miss on different content preview', () => {
    cache.mark('https://example.com/a', 'hello world')
    expect(cache.has('https://example.com/a', 'different')).toBe(false)
  })

  it('should not double-mark duplicate', () => {
    expect(cache.mark('https://example.com/a', 'x')).toBe(true)
    expect(cache.mark('https://example.com/a', 'x')).toBe(false)
  })

  it('should track hit/miss stats', () => {
    cache.mark('https://example.com/a', 'x')
    cache.has('https://example.com/a', 'x')   // hit
    cache.has('https://example.com/b', 'y')    // miss
    const s = cache.stats()
    expect(s.hits).toBe(1)
    expect(s.misses).toBe(1)
    expect(s.hitRate).toBe(0.5)
  })

  it('should evict oldest on LRU overflow', () => {
    const small = new ContentCache({ maxSize: 2 })
    small.mark('a', 'a')
    small.mark('b', 'b')
    small.mark('c', 'c') // should evict 'a'
    expect(small.has('a', 'a')).toBe(false)
    expect(small.has('b', 'b')).toBe(true)
    expect(small.has('c', 'c')).toBe(true)
  })

  it('should clear all state', () => {
    cache.mark('a', 'a')
    cache.has('a', 'a')
    cache.clear()
    expect(cache.stats().hits).toBe(0)
    expect(cache.has('a', 'a')).toBe(false)
  })
})
