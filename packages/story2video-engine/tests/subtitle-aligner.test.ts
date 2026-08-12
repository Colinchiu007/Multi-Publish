/**
 * subtitle-aligner（ASR 词级时间 → 分句块）单元测试。
 */
import { describe, it, expect } from 'vitest';
import {
  alignSubtitleBlocks,
  normalizeForAlign,
  round2HalfUp,
  levenshtein,
} from '../src/subtitle-aligner';

const words = (pairs: Array<[string, number, number]>): Array<{ text: string; start: number; end: number }> =>
  pairs.map(([text, start, end]) => ({ text, start, end }));

describe('normalizeForAlign', () => {
  it('去除中英文标点/空白并转小写', () => {
    expect(normalizeForAlign('要知道在农耕社会，柴火、盐巴和香料。')).toBe('要知道在农耕社会柴火盐巴和香料');
    expect(normalizeForAlign('Hello, World!')).toBe('helloworld');
  });
});

describe('round2HalfUp', () => {
  it('half-up 保留 2 位小数（0.625 → 0.63，与分句引擎一致）', () => {
    expect(round2HalfUp(0.625)).toBe(0.63);
    expect(round2HalfUp(9.375)).toBe(9.38);
  });
});

describe('levenshtein', () => {
  it('基础编辑距离', () => {
    expect(levenshtein('柴火盐巴和香料', '柴火盐巴和香料')).toBe(0);
    expect(levenshtein('abc', 'abd')).toBe(1);
  });
});

describe('alignSubtitleBlocks', () => {
  it('完美匹配：词流与块一一对应，时间取真实词时间', () => {
    const blocks = [
      { displayOrder: 0, text: '要知道在农耕社会' },
      { displayOrder: 1, text: '柴火、盐巴和香料' },
      { displayOrder: 2, text: '那可都是绝对的硬通货' },
    ];
    const w = words([
      ['要知道', 0.0, 0.6], ['在', 0.6, 0.8], ['农耕社会', 0.8, 1.4],
      ['柴火', 1.6, 2.0], ['盐巴', 2.0, 2.4], ['和香料', 2.4, 3.1],
      ['那可', 3.2, 3.7], ['都是', 3.7, 4.1], ['绝对的', 4.1, 4.7], ['硬通货', 4.7, 5.5],
    ]);
    const r = alignSubtitleBlocks(blocks, w, 6);
    expect(r.method).toBe('asr');
    expect(r.warnings).toHaveLength(0);
    expect(r.aligned.map((b) => [b.text, b.startTime, b.endTime])).toEqual([
      ['要知道在农耕社会', 0, 1.4],
      ['柴火、盐巴和香料', 1.6, 3.1],
      ['那可都是绝对的硬通货', 3.2, 5.5],
    ]);
  });

  it('词流含标点/大小写差异时仍可匹配', () => {
    const blocks = [{ displayOrder: 0, text: 'Hello world. How are you?' }];
    const w = words([['Hello', 0.0, 0.4], ['world', 0.4, 0.9], ['How', 1.0, 1.2], ['are', 1.2, 1.4], ['you', 1.4, 1.8]]);
    const r = alignSubtitleBlocks(blocks, w, 2);
    expect(r.method).toBe('asr');
    expect(r.aligned[0].startTime).toBe(0);
    expect(r.aligned[0].endTime).toBe(1.8);
  });

  it('部分未命中：回退估算 + warning，覆盖率高时 method=asr', () => {
    const blocks = [
      { displayOrder: 0, text: '第一句话完全命中' },
      { displayOrder: 1, text: '第二句话没被识别出来' },
    ];
    const w = words([
      ['第一句', 0.0, 0.7], ['话', 0.7, 0.9], ['完全', 0.9, 1.3], ['命中', 1.3, 1.6],
    ]);
    const r = alignSubtitleBlocks(blocks, w, 4);
    expect(r.aligned[0].source).toBe('asr');
    expect(r.aligned[1].source).toBe('estimate');
    expect(r.aligned[1].startTime).toBeGreaterThanOrEqual(r.aligned[0].endTime);
    expect(r.method).toBe('asr');
    expect(r.warnings.length).toBe(1);
  });

  it('完全未命中：method=estimate，全部估算且连续', () => {
    const blocks = [
      { displayOrder: 0, text: '甲' },
      { displayOrder: 1, text: '乙' },
    ];
    const r = alignSubtitleBlocks(blocks, [], 4);
    expect(r.method).toBe('estimate');
    expect(r.coverage).toBe(0);
    expect(r.aligned[0].source).toBe('estimate');
    expect(r.aligned[1].startTime).toBe(r.aligned[0].endTime);
    expect(r.totalDuration).toBeGreaterThan(0);
  });

  it('区间强制连续：重叠的 ASR 时间被钳制', () => {
    const blocks = [
      { displayOrder: 0, text: '块一' },
      { displayOrder: 1, text: '块二' },
    ];
    // 词时间重叠：块一词 end 0.9，块二词 start 0.5
    const w = words([['块一', 0.0, 0.9], ['块二', 0.5, 1.4]]);
    const r = alignSubtitleBlocks(blocks, w, 2);
    expect(r.aligned[1].startTime).toBeGreaterThanOrEqual(r.aligned[0].endTime);
  });
});
