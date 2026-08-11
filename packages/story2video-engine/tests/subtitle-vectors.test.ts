/**
 * 共享字幕分割测试向量断言（规范 v1.0，双实现共用）。
 *
 * 与 smart-sentence-splitter tests/unit/test_subtitle_vectors.py 断言同一份向量
 * （tests/vectors/subtitle_segmentation_vectors.json），保证 TypeScript 与 Python
 * 两个实现的字幕块序列逐字一致。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SubtitleSegmenter } from '../src/text-segmentation';

// 共享向量文件在并列的 smart-sentence-splitter 仓库（开发机布局 D:/Data/projects/ 下两仓库并列）
const VECTORS_PATH = 'D:/Data/projects/smart-sentence-splitter/tests/vectors/subtitle_segmentation_vectors.json';

interface Vector {
  id: string;
  input: string;
  config?: { min_chars_per_block?: number; max_chars_per_block?: number; time_calculation_method?: string };
  expected_blocks: string[];
}

function loadVectors(): Vector[] {
  const raw = JSON.parse(readFileSync(VECTORS_PATH, 'utf-8')) as { vectors: Vector[] };
  return raw.vectors;
}

describe('SubtitleSegmenter 共享向量（规范 v1.0）', () => {
  const vectors = loadVectors();

  it('向量文件可加载', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  for (const v of vectors) {
    it(`向量 ${v.id} 字幕块一致`, () => {
      const cfg = {
        minCharsPerBlock: v.config?.min_chars_per_block ?? 8,
        maxCharsPerBlock: v.config?.max_chars_per_block ?? 15,
        timeCalculationMethod: v.config?.time_calculation_method === 'equal' ? 'equal' as const : 'proportional' as const,
      };
      const seg = new SubtitleSegmenter(cfg);
      const subs = seg.segment(v.input, 10, 0);
      const actual = subs.map((s) => s.text);
      expect(actual).toEqual(v.expected_blocks);
    });
  }

  it('时间戳：proportional 首块从 0 开始且总时长一致', () => {
    const seg = new SubtitleSegmenter({ timeCalculationMethod: 'proportional' });
    const subs = seg.segment('今天天气真好，我们去公园散步。', 10, 0);
    expect(subs[0].startTime).toBeCloseTo(0, 1);
    const total = subs.reduce((sum, s) => sum + s.duration, 0);
    expect(total).toBeCloseTo(10, 0);
    expect(subs.map((s) => s.displayOrder)).toEqual(subs.map((_, i) => i));
  });
});