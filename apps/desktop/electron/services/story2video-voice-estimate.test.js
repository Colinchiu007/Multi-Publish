// @vitest-environment node
const {
  LANGUAGE_BASE_WORDS_PER_SECOND,
  DEFAULT_BASE_WORDS_PER_SECOND,
  getLanguageBaseWordsPerSecond,
  normalizeSpeechSpeed,
  estimateCharsPerSecond,
  estimateDurationSeconds,
  estimateCharsPerScene,
  countSceneChars,
} = require('./story2video-voice-estimate')

describe('story2video-voice-estimate 语言感知估算（Batch 5a）', () => {
  it('语言基准表：zh 4.5 / en 2.8 / 其余（含 auto）回退 3.3', () => {
    expect(LANGUAGE_BASE_WORDS_PER_SECOND.zh).toBe(4.5)
    expect(LANGUAGE_BASE_WORDS_PER_SECOND.en).toBe(2.8)
    expect(DEFAULT_BASE_WORDS_PER_SECOND).toBe(3.3)
    expect(getLanguageBaseWordsPerSecond('zh')).toBe(4.5)
    expect(getLanguageBaseWordsPerSecond('en')).toBe(2.8)
    expect(getLanguageBaseWordsPerSecond('auto')).toBe(3.3)
    expect(getLanguageBaseWordsPerSecond('ja')).toBe(3.3)
    expect(getLanguageBaseWordsPerSecond('ZH')).toBe(4.5)
    expect(getLanguageBaseWordsPerSecond(undefined)).toBe(3.3)
  })

  it('有效语速归一化：0.5..2 通过，越界/NaN 回退 1', () => {
    expect(normalizeSpeechSpeed(1)).toBe(1)
    expect(normalizeSpeechSpeed(0.5)).toBe(0.5)
    expect(normalizeSpeechSpeed(2)).toBe(2)
    expect(normalizeSpeechSpeed(0.4)).toBe(1)
    expect(normalizeSpeechSpeed(2.1)).toBe(1)
    expect(normalizeSpeechSpeed(NaN)).toBe(1)
    expect(normalizeSpeechSpeed(undefined)).toBe(1)
    expect(normalizeSpeechSpeed('1.5')).toBe(1.5)
  })

  it('每分镜有效语速 = 语言基准 × voice.speed（speechRate 单一来源）', () => {
    expect(estimateCharsPerSecond('zh', 1)).toBe(4.5)
    expect(estimateCharsPerSecond('en', 1)).toBe(2.8)
    expect(estimateCharsPerSecond('auto', 1)).toBe(3.3)
    expect(estimateCharsPerSecond('zh', 1.5)).toBe(6.75)
    expect(estimateCharsPerSecond('zh', 0)).toBe(4.5)
  })

  it('字数 → 估算时长：整数秒 clamp 1..60，与 normalizer 幂等反推口径一致', () => {
    expect(estimateDurationSeconds(20, 'auto', 1)).toBe(6)   // 20/3.3=6.06 → 6
    expect(estimateDurationSeconds(20, 'zh', 1)).toBe(4)     // 20/4.5=4.44 → 4
    expect(estimateDurationSeconds(20, 'en', 1)).toBe(7)     // 20/2.8=7.14 → 7
    expect(estimateDurationSeconds(30, 'auto', 1)).toBe(9)   // 30/3.3=9.09 → 9
    expect(estimateDurationSeconds(1000, 'zh', 1)).toBe(60)  // clamp 上限
    expect(estimateDurationSeconds(1, 'zh', 1)).toBe(1)      // clamp 下限
    expect(estimateDurationSeconds(0, 'zh', 1)).toBe(6)      // 非法 → 默认 6
    expect(estimateDurationSeconds('abc', 'zh', 1)).toBe(6)
  })

  it('目标时长 → 主控字数：clamp [minChars,maxChars]∩[1,200]', () => {
    expect(estimateCharsPerScene(6, 'auto', 1)).toBe(20)     // 6×3.3=19.8 → 20
    expect(estimateCharsPerScene(6, 'zh', 1)).toBe(27)       // 6×4.5=27
    expect(estimateCharsPerScene(6, 'en', 1)).toBe(17)       // 6×2.8=16.8 → 17
    expect(estimateCharsPerScene(60, 'auto', 1)).toBe(50)    // clamp maxWords=50
    expect(estimateCharsPerScene(1, 'auto', 1)).toBe(10)     // clamp minWords=10
    expect(estimateCharsPerScene(6, 'zh', 0.5, 10, 50)).toBe(14) // 6×2.25=13.5 → 14
    expect(estimateCharsPerScene(0, 'zh', 1)).toBe(20)       // 非法 → 默认 20
    // 防御 min>max：损坏快照反向 clamp 时兜底为 max，不产出低于下限的结果（claude review W2）
    expect(estimateCharsPerScene(60, 'zh', 1, 50, 10)).toBe(10)
    expect(estimateCharsPerScene(1, 'zh', 1, 50, 10)).toBe(10)
  })

  it('场景文本字数统计：去除空白后的 Unicode 码点数', () => {
    expect(countSceneChars('长安城的灯火。')).toBe(7)
    expect(countSceneChars('hello world')).toBe(10)
    expect(countSceneChars('  a  b  ')).toBe(2)
    expect(countSceneChars('😀x')).toBe(2)
    expect(countSceneChars(undefined)).toBe(0)
    expect(countSceneChars(123)).toBe(0)
  })
})
