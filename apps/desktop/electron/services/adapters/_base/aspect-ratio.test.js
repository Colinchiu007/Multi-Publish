// @ts-check
/**
 * aspect-ratio.test.js — 画幅契约单一真源的行为锁
 *
 * 反证纪律：把 resolveAspectPixelSize 的竖屏分支改反（返回 width/height 不交换），
 * 或把 pickClosestSize 的方向判定删掉，本文件立即变红。
 */

const {
  ASPECT_RATIO_CONTRACT_KEYS,
  readAspectRatio,
  parseAspectRatio,
  resolveAspectPixelSize,
  pickClosestSize,
} = require('./aspect-ratio')

describe('readAspectRatio — 统一画幅契约键优先级', () => {
  it('契约键顺序固定为 aspect_ratio > aspectRatio > ratio', () => {
    expect(ASPECT_RATIO_CONTRACT_KEYS).toEqual(['aspect_ratio', 'aspectRatio', 'ratio'])
  })

  it('三者同时存在时取 aspect_ratio（流水线主键优先）', () => {
    expect(readAspectRatio({ aspect_ratio: '9:16', aspectRatio: '1:1', ratio: '16:9' })).toBe('9:16')
  })

  it('缺 aspect_ratio 时取 aspectRatio（渲染层 normalizer 契约键）', () => {
    expect(readAspectRatio({ aspectRatio: '3:4', ratio: '16:9' })).toBe('3:4')
  })

  it('只剩历史别名 ratio 时仍可读（向后兼容 Agnes 直调方）', () => {
    expect(readAspectRatio({ ratio: '16:9' })).toBe('16:9')
  })

  it('值两侧空白被裁剪，空串/非字符串视为未提供', () => {
    expect(readAspectRatio({ aspect_ratio: '  9:16  ' })).toBe('9:16')
    expect(readAspectRatio({ aspect_ratio: '   ' })).toBeNull()
    expect(readAspectRatio({ aspect_ratio: 916 })).toBeNull()
  })

  it('入参缺失/非对象不抛错，返回 null（fail-open）', () => {
    expect(readAspectRatio(undefined)).toBeNull()
    expect(readAspectRatio(null)).toBeNull()
    expect(readAspectRatio('9:16')).toBeNull()
    expect(readAspectRatio({})).toBeNull()
  })
})

describe('parseAspectRatio — 画幅归一化', () => {
  it('解析标准画幅并给出方向标记', () => {
    expect(parseAspectRatio('9:16')).toMatchObject({ width: 9, height: 16, isPortrait: true, isSquare: false })
    expect(parseAspectRatio('16:9')).toMatchObject({ width: 16, height: 9, isPortrait: false, isSquare: false })
    expect(parseAspectRatio('1:1')).toMatchObject({ isSquare: true, isPortrait: false })
  })

  it('容忍分隔符变体与空白（x / 大写 X / 空格）', () => {
    expect(parseAspectRatio('1080x1920')).toMatchObject({ width: 1080, height: 1920 })
    expect(parseAspectRatio(' 3 / 4 ')).toMatchObject({ width: 3, height: 4 })
    expect(parseAspectRatio('3X4')).toMatchObject({ width: 3, height: 4 })
  })

  it('非法值返回 null 而不是抛错（画幅是增强信息，不得打断出图）', () => {
    for (const bad of ['', '  ', 'nine', '9:', ':16', '9:0', '0:16', '-9:16', '9.5:16', null, undefined, 916, {}]) {
      expect(parseAspectRatio(/** @type {any} */ (bad))).toBeNull()
    }
  })
})

describe('resolveAspectPixelSize — 画幅 → 像素尺寸', () => {
  it('竖屏 9:16 出竖图（本次 bug 的核心反证：不得再出横图）', () => {
    expect(resolveAspectPixelSize('9:16')).toEqual({ width: 576, height: 1024 })
  })

  it('横屏 16:9 出横图', () => {
    expect(resolveAspectPixelSize('16:9')).toEqual({ width: 1024, height: 576 })
  })

  it('3:4 / 4:3 / 1:1 方向正确', () => {
    expect(resolveAspectPixelSize('3:4')).toEqual({ width: 768, height: 1024 })
    expect(resolveAspectPixelSize('4:3')).toEqual({ width: 1024, height: 768 })
    expect(resolveAspectPixelSize('1:1')).toEqual({ width: 1024, height: 1024 })
  })

  it('任意画幅都保持「长边=长边、短边=短边」的方向不变式', () => {
    for (const ratio of ['9:16', '16:9', '3:4', '4:3', '1:1', '2:3', '21:9', '1080x1920']) {
      const size = resolveAspectPixelSize(ratio)
      expect(size).toBeTruthy()
      const parsed = parseAspectRatio(ratio)
      const wantsPortrait = parsed.height > parsed.width
      expect(wantsPortrait ? size.height > size.width : size.width >= size.height).toBe(true)
    }
  })

  it('长边可配置，短边按同一比例缩放', () => {
    expect(resolveAspectPixelSize('9:16', { longEdge: 1280 })).toEqual({ width: 720, height: 1280 })
    expect(resolveAspectPixelSize('16:9', { longEdge: 1280 })).toEqual({ width: 1280, height: 720 })
  })

  it('极端画幅被钳到最小短边（不产出退化尺寸）', () => {
    const size = resolveAspectPixelSize('1:100')
    expect(size.height).toBe(1024)
    expect(size.width).toBeGreaterThanOrEqual(256)
  })

  it('非法画幅返回 null，调用方自行走既有兜底', () => {
    expect(resolveAspectPixelSize('free-form')).toBeNull()
    expect(resolveAspectPixelSize(null)).toBeNull()
    expect(resolveAspectPixelSize(undefined)).toBeNull()
  })
})

describe('pickClosestSize — 固定尺寸枚举取最接近档位', () => {
  const DALL_E = ['1024x1024', '1792x1024', '1024x1792']

  it('像素完全命中优先返回', () => {
    expect(pickClosestSize(DALL_E, '1024x1024')).toBe('1024x1024')
  })

  it('竖屏画幅命中竖屏档位（OpenAI 官方只有三档，9:16 必须落到竖图）', () => {
    expect(pickClosestSize(DALL_E, '9:16')).toBe('1024x1792')
    expect(pickClosestSize(DALL_E, '3:4')).toBe('1024x1792')
  })

  it('横屏画幅命中横屏档位', () => {
    expect(pickClosestSize(DALL_E, '16:9')).toBe('1792x1024')
    expect(pickClosestSize(DALL_E, '4:3')).toBe('1792x1024')
  })

  it('方屏命中方档', () => {
    expect(pickClosestSize(DALL_E, '1:1')).toBe('1024x1024')
  })

  it('画幅非法或枚举为空时返回调用方兜底值', () => {
    expect(pickClosestSize(DALL_E, 'bogus', '1024x1024')).toBe('1024x1024')
    expect(pickClosestSize([], '9:16', '1024x1024')).toBe('1024x1024')
    expect(pickClosestSize(null, '9:16', undefined)).toBeUndefined()
  })

  it('供应商枚举不完整时仍不会返回非法尺寸', () => {
    expect(pickClosestSize(['1024x1024'], '9:16')).toBe('1024x1024')
  })
})
