/**
 * TS（权威）↔ Electron JS 镜像 一致性测试：同一语料双实现输出必须完全一致。
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { alignSubtitleBlocks as alignTs } from '../src/subtitle-aligner';

const require = createRequire(import.meta.url);
const jsPath = resolve('../../apps/desktop/electron/services/subtitle-align-aggregator.js');
const { alignSubtitleBlocks: alignJs } = require(jsPath);

const corpus: Array<{ blocks: Array<{ displayOrder: number; text: string }>; words: Array<{ text: string; start: number; end: number }>; duration: number }> = [
  {
    blocks: [
      { displayOrder: 0, text: '要知道在农耕社会' },
      { displayOrder: 1, text: '柴火、盐巴和香料' },
      { displayOrder: 2, text: '那可都是绝对的硬通货' },
    ],
    words: [
      ['要知道', 0.0, 0.6], ['在', 0.6, 0.8], ['农耕社会', 0.8, 1.4],
      ['柴火', 1.6, 2.0], ['盐巴', 2.0, 2.4], ['和香料', 2.4, 3.1],
      ['那可', 3.2, 3.7], ['都是', 3.7, 4.1], ['绝对的', 4.1, 4.7], ['硬通货', 4.7, 5.5],
    ].map(([text, start, end]) => ({ text, start, end })),
    duration: 6,
  },
  {
    blocks: [
      { displayOrder: 0, text: '第一句话完全命中' },
      { displayOrder: 1, text: '第二句话没被识别出来' },
    ],
    words: [['第一句', 0.0, 0.7], ['话', 0.7, 0.9], ['完全', 0.9, 1.3], ['命中', 1.3, 1.6]].map(([text, start, end]) => ({ text, start, end })),
    duration: 4,
  },
  {
    blocks: [{ displayOrder: 0, text: '甲乙' }, { displayOrder: 1, text: '丙丁' }],
    words: [],
    duration: 3,
  },
];

describe('TS/JS 聚合器一致性（parity）', () => {
  it('同一语料双实现输出完全一致', () => {
    for (const c of corpus) {
      const a = alignTs(c.blocks, c.words, c.duration);
      const b = alignJs(c.blocks, c.words, c.duration);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    }
  });
});
