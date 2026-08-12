/**
 * 共享字幕分割测试向量断言（规范 v1.0，双实现共用）。
 *
 * 与 smart-sentence-splitter tests/unit/test_subtitle_vectors.py 断言同一份向量
 * （tests/vectors/subtitle_segmentation_vectors.json），保证 TypeScript 与 Python
 * 两个实现的字幕块序列逐字一致。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SubtitleSegmenter } from '../src/text-segmentation';

// 共享向量（规范 v1.0）：与 smart-sentence-splitter 仓库 tests/vectors/subtitle_segmentation_vectors.json
// 保持同步（新增/修改向量时两边更新同一份内容），此处使用仓库内 fixtures 副本以便 CI 可复现。
const VECTORS_PATH = resolve(import.meta.dirname, 'fixtures/subtitle_segmentation_vectors.json');

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

  for (const v of vectors) {
    it(`向量 ${v.id} min_chars 不变量（例外须显式声明）`, () => {
      const minChars = v.config?.min_chars_per_block ?? 8;
      const exceptions = new Map(
        (v as { short_block_exceptions?: Array<{ index: number; reason?: string }> }).short_block_exceptions
          ?.map((e) => [e.index, e.reason ?? '']) ?? [],
      );
      const cfg = {
        minCharsPerBlock: minChars,
        maxCharsPerBlock: v.config?.max_chars_per_block ?? 15,
        timeCalculationMethod: 'proportional' as const,
      };
      const seg = new SubtitleSegmenter(cfg);
      const subs = seg.segment(v.input, 10, 0);
      const actual = subs.map((s) => s.text);
      for (let i = 0; i < actual.length; i++) {
        if (actual[i].length >= minChars) continue;
        expect(exceptions.has(i)).toBe(true);
        expect(exceptions.get(i) || '').not.toBe('');
      }
      for (const i of exceptions.keys()) {
        expect(i).toBeLessThan(actual.length);
        expect(actual[i].length).toBeLessThan(minChars);
      }
    });
  }

  for (const v of vectors) {
    it(`向量 ${v.id} 时间戳舍入后严格连续（proportional/equal）`, () => {
      for (const method of ['proportional', 'equal'] as const) {
        const cfg = {
          minCharsPerBlock: v.config?.min_chars_per_block ?? 8,
          maxCharsPerBlock: v.config?.max_chars_per_block ?? 15,
          timeCalculationMethod: method,
        };
        const seg = new SubtitleSegmenter(cfg);
        const subs = seg.segment(v.input, 10, 0);
        if (!subs.length) continue;
        expect(subs[0].startTime).toBe(0);
        for (let i = 1; i < subs.length; i++) {
          const expectStart = Math.round((subs[i - 1].startTime + subs[i - 1].duration) * 100) / 100;
          expect(subs[i].startTime).toBe(expectStart);
        }
        for (const s of subs) {
          expect(s.startTime).toBe(Math.round(s.startTime * 100) / 100);
          expect(s.duration).toBe(Math.round(s.duration * 100) / 100);
          expect(s.duration).toBeGreaterThan(0);
        }
      }
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
