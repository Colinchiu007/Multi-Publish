// @vitest-environment node
/**
 * 分句双实现一致性（parity）测试：JS 镜像（story2video-segmentation-engine）vs TS 权威版
 * （packages/story2video-engine/src/text-segmentation.ts）。
 *
 * 同一语料同一配置下，句子/场景/字幕分块必须逐项一致，防止 JS 镜像手抄漂移。
 * 语料覆盖：普通中文 / 多标点 / 短场景 / 长句无句号 / 顿号枚举 / 引号 / 英文缩写 / 超长逗号句 / emoji / 中英混合。
 */
import { describe, it, expect } from 'vitest'
import {
  splitTextToScenes as tsSplitTextToScenes,
  splitTextToSubtitles as tsSplitTextToSubtitles,
} from '../../../../packages/story2video-engine/src/text-segmentation'
import {
  splitTextToScenes,
  splitTextToSubtitles,
} from './story2video-segmentation'

// 与故事讲述流水线 split 阶段一致的配置（stage.options → 引擎 config 同源）
const PIPELINE_OPTIONS = {
  config: {
    sentenceTokenizer: {
      language: 'zh',
      handleAbbreviations: true,
      customAbbreviations: ['Dr.', 'Mr.', 'Ms.', '等', 'etc.', 'i.e.', 'e.g.'],
      maxSentenceLength: 200,
    },
    scene: {
      targetSeconds: 6,
      baseWordsPerSecond: 4.5,
      speechRate: 1,
      minWordsPerSegment: 10,
      maxWordsPerSegment: 50,
      enforceSentenceBoundary: true,
      allowSingleSentenceOverflow: true,
    },
    subtitle: {
      minCharsPerBlock: 8,
      maxCharsPerBlock: 15,
      timeCalculationMethod: 'proportional',
    },
  },
}

const VECTORS = [
  ['普通中文', '第一句话。第二句话介绍产品，它包含苹果、香蕉和橘子。第三句话很关键！'],
  ['多标点', '你好！这是测试？当然；还有逗号，和顿号、以及省略号……最后句号。'],
  ['短场景', '短。很短。更短。'],
  ['长句无句号', '甲'.repeat(440)],
  ['顿号枚举', '我们采购了苹果、香蕉、橘子、葡萄和西瓜，然后分给了大家。'],
  ['引号', '他说：“今天必须完成”，然后转身离开。'],
  ['英文缩写', 'Dr. Smith went to the lab. He tested i.e. the sample. Great!'],
  ['超长逗号句', '一二三四五六七八九十，'.repeat(30)],
  ['emoji', '😀'.repeat(31)],
  ['中英混合', '第一段Hello world。第二段测试。'],
]

describe('分句双实现一致性（JS 镜像 vs TS 权威版）', () => {
  for (const [label, text] of VECTORS) {
    it(`场景级一致: ${label}`, () => {
      expect(splitTextToScenes(text, PIPELINE_OPTIONS)).toEqual(
        tsSplitTextToScenes(text, PIPELINE_OPTIONS),
      )
    })

    it(`字幕级一致: ${label}`, () => {
      const scenes = splitTextToScenes(text, PIPELINE_OPTIONS)
      expect(scenes.length).toBeGreaterThan(0)
      for (const scene of scenes) {
        expect(splitTextToSubtitles(scene, PIPELINE_OPTIONS)).toEqual(
          tsSplitTextToSubtitles(scene, PIPELINE_OPTIONS),
        )
      }
    })
  }

  it('snake_case stage.options 与 config 结构等价', () => {
    const text = '第一句话。第二句话。第三句话。第四句话。'
    const fromStageOptions = splitTextToScenes(text, {
      target_duration: 60,
      target_chars_per_scene: 10,
      min_words: 1,
      max_words: 50,
    })
    const fromConfig = splitTextToScenes(text, {
      config: {
        scene: { targetSeconds: 60, targetCharsPerScene: 10, minWordsPerSegment: 1, maxWordsPerSegment: 50 },
      },
    })
    expect(fromStageOptions).toEqual(fromConfig)
  })
})
