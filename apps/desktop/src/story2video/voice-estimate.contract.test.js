// @vitest-environment node
// 合同测试：renderer 与 electron 主进程的语言感知估算表必须一致（AGENTS.md 单一来源契约）。
import {
  LANGUAGE_BASE_WORDS_PER_SECOND as rendererTable,
  DEFAULT_BASE_WORDS_PER_SECOND as rendererDefault,
  getLanguageBaseWordsPerSecond as rendererGet,
  estimateCharsPerSecond as rendererCps,
  estimateDurationSeconds as rendererDuration,
  estimateCharsPerScene as rendererChars,
  countSceneChars as rendererCount,
} from './voice-estimate'
const main = require('../../electron/services/story2video-voice-estimate')
const { normalizeStory2VideoTextParams } = require('../../electron/services/story2video-text-config')

describe('voice-estimate renderer ↔ 主进程一致性合同（Batch 5a）', () => {
  it('语言基准表与默认值完全一致', () => {
    expect(rendererTable).toEqual(main.LANGUAGE_BASE_WORDS_PER_SECOND)
    expect(rendererDefault).toBe(main.DEFAULT_BASE_WORDS_PER_SECOND)
  })

  it('getLanguageBaseWordsPerSecond 全语言一致', () => {
    for (const language of ['zh', 'en', 'auto', 'ja', 'ZH', undefined, '']) {
      expect(rendererGet(language)).toBe(main.getLanguageBaseWordsPerSecond(language))
    }
  })

  it('估算函数数值一致（语言 × 语速 × 字数抽样）', () => {
    // ja 不在 normalizer 的 LANGUAGES 枚举（auto/zh/en），等价性仅覆盖合法语言
    const languages = ['zh', 'en', 'auto']
    const speeds = [0.5, 1, 1.5, 2, 0]
    const charsList = [1, 20, 27, 50, 200, 0]
    for (const language of languages) {
      for (const speed of speeds) {
        expect(rendererCps(language, speed)).toBe(main.estimateCharsPerSecond(language, speed))
        for (const chars of charsList) {
          expect(rendererDuration(chars, language, speed)).toBe(main.estimateDurationSeconds(chars, language, speed))
          expect(rendererChars(chars, language, speed)).toBe(main.estimateCharsPerScene(chars, language, speed))
        }
      }
    }
    expect(rendererCount('长安城。 hello')).toBe(main.countSceneChars('长安城。 hello'))
  })

  it('第三腿：normalizer 与估算模块在「语言 × 语速 × 目标秒数」下等价（codex review W1）', () => {
    // ja 不在 normalizer 的 LANGUAGES 枚举（auto/zh/en），等价性仅覆盖合法语言
    const languages = ['zh', 'en', 'auto']
    const speeds = [0.5, 1, 1.5, 2]
    const secondsList = [2, 4, 6, 10]
    for (const language of languages) {
      for (const speed of speeds) {
        for (const seconds of secondsList) {
          const norm = normalizeStory2VideoTextParams({
            text: '等价性',
            voiceSpeed: speed,
            story2videoTextConfig: { split: { language, targetSeconds: seconds, minWords: 10, maxWords: 50 } },
          })
          const expectedChars = main.estimateCharsPerScene(seconds, language, speed, 10, 50)
          expect(norm.story2videoTextConfig.split.targetCharsPerScene).toBe(expectedChars)
          // normalizer 幂等反推的 targetSeconds 与估算模块整数口径一致
          expect(norm.story2videoTextConfig.split.targetSeconds)
            .toBe(main.estimateDurationSeconds(expectedChars, language, speed))
        }
      }
    }
  })

  it('自定义 [minChars,maxChars] clamp 参数在两侧一致（codex review I5）', () => {
    expect(rendererChars(6, 'zh', 1, 5, 30)).toBe(main.estimateCharsPerScene(6, 'zh', 1, 5, 30))
    expect(rendererChars(60, 'zh', 1, 5, 30)).toBe(main.estimateCharsPerScene(60, 'zh', 1, 5, 30))
    expect(rendererChars(1, 'zh', 1, 5, 30)).toBe(main.estimateCharsPerScene(1, 'zh', 1, 5, 30))
  })
})
