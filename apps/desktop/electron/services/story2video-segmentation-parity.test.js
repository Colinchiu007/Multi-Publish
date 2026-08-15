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
  ['v1.2.3-文帝', '要理解文帝进京这件事，得先搞清楚一个前提：功臣集团为什么选他？'],
  ['v1.2.3-小数点', '今年夏天，台风肆虐导致广西暴雨如注，降雨量狂飙到一天713.3毫米。'],
  ['v1.2.3-挥刀自宫', '这套政策根本经不起扒，说白了就是逼着全体华人为了挤进西方圈子，挥刀自宫搞文化阉割。'],
  ['v1.2.3-高高在上', '他们觉得自己是高高在上的现代国家，把文化和国家认同搅在一起，是落后操作。'],
  ['v1.2.3-无人机AI基建', '这套AI基建能够实时监控全域低空空域，为每一架无人机动态规划专属航线，自动避开高楼、人群、禁飞区。'],
  ['v1.2.3-扶余国', '因此，在韩国的历史教科书里，能看到大量关于扶余国和扶余人的记载。'],
  ['v1.2.3-电视剧', '2005年，韩国收视率最高的电视剧《朱蒙》播出，里面讲述的正是这位扶余王子的故事。'],
  ['v1.2.3-枪声', '枪声、爆炸声、呐喊声混成一锅滚烫的粥。'],
  ['v1.2.3-长句博弈', '这不是一个聪明人碾压蠢人的故事，而是一群各怀心思的人，在一个特定的制度框架和信息条件下，各自做出了他们最优的选择，然后这些选择叠加在一起，产生了一个谁都没完全预料到的结果。'],
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
