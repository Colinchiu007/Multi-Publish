// @vitest-environment node
/**
 * Story2Video JS 镜像共享向量回归（规范 v1.2）。
 *
 * 断言 story2video-segmentation-engine（JS 镜像）对共享 subtitle_segmentation_vectors.json
 * 的输出与 Python/TS 双实现逐字一致，防止 JS 镜像手抄漂移。
 * 与 packages/story2video-engine/tests/subtitle-vectors.test.ts、smart-sentence-splitter
 * tests/unit/test_subtitle_vectors.py 断言同一份向量（26 条，含 6 条用户坏例）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitTextToSubtitles } from './story2video-segmentation-engine'

const VECTORS_PATH = resolve(
  import.meta.dirname,
  '../../../../packages/story2video-engine/tests/fixtures/subtitle_segmentation_vectors.json',
)

function loadVectors () {
  const raw = JSON.parse(readFileSync(VECTORS_PATH, 'utf-8'))
  return raw.vectors
}

describe('Story2Video JS 镜像共享向量（规范 v1.2）', () => {
  const vectors = loadVectors()

  it('向量文件可加载', () => {
    expect(vectors.length).toBeGreaterThan(0)
  })

  for (const v of vectors) {
    it(`向量 ${v.id} 字幕块一致`, () => {
      const blocks = splitTextToSubtitles(v.input, {
        subtitleMinChars: v.config?.min_chars_per_block ?? 8,
        subtitleMaxChars: v.config?.max_chars_per_block ?? 15,
        timeCalculationMethod: v.config?.time_calculation_method === 'equal' ? 'equal' : 'proportional',
      })
      expect(blocks).toEqual(v.expected_blocks)
    })
  }

  for (const v of vectors) {
    it(`向量 ${v.id} min_chars 不变量（例外须显式声明）`, () => {
      const minChars = v.config?.min_chars_per_block ?? 8
      const exceptions = new Map((v.short_block_exceptions || []).map((e) => [e.index, e.reason || '']))
      const blocks = splitTextToSubtitles(v.input, {
        subtitleMinChars: minChars,
        subtitleMaxChars: v.config?.max_chars_per_block ?? 15,
      })
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].length >= minChars) continue
        expect(exceptions.has(i)).toBe(true)
        expect(exceptions.get(i) || '').not.toBe('')
      }
      for (const i of exceptions.keys()) {
        expect(i).toBeLessThan(blocks.length)
        expect(blocks[i].length).toBeLessThan(minChars)
      }
    })
  }
})
