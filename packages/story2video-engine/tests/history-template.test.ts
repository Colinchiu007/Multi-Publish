import { describe, expect, it } from 'vitest';
import {
  DynastyDetector,
  EraDetector,
  generateImagePromptsSmart,
  generateRawImagePrompts,
} from '../src/history-prompt';
import {
  BUILT_IN_TEMPLATES,
  deleteCustomTemplate,
  getAllTemplates,
  getTemplateById,
  loadCustomTemplates,
  saveCustomTemplate,
} from '../src/template-library';
import type { VideoTemplate } from '../src/types';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

describe('history-prompt 领域增强', () => {
  it('区分现代和古代关键词，避免把现代内容强行古风化', () => {
    expect(EraDetector.detect('手机连接互联网，居民在社区服务中心领取物资').era).toBe('modern');
    expect(EraDetector.detect('唐朝长安城中，史官记录盛世').era).toBe('ancient');
  });

  it('按朝代关键词返回视觉上下文', () => {
    const result = DynastyDetector.detect('唐朝长安城的灯火映照着宫殿');
    expect(result).toMatchObject({ name: '唐朝', method: 'keyword' });
    expect(result?.visual_style).toContain('唐代');
  });

  it('生成原始提示词并支持委托 prompt-engine 的优化回调', async () => {
    const raw = generateRawImagePrompts(['清朝宫殿中的将军'], 'zoom-in');
    expect(raw[0].promptSeed).toContain('清代');
    expect(raw[0].imageEffect).toBe('zoom-in');
    const optimized = await generateImagePromptsSmart(['第一幕'], async (prompt, index) => `${prompt}|optimized-${index}`);
    expect(optimized[0].optimizedPrompt).toContain('optimized-0');
  });

  it('优化回调失败时保留本地领域提示词', async () => {
    const result = await generateImagePromptsSmart(['第二幕'], async () => { throw new Error('offline'); });
    expect(result[0].optimizedPrompt).toBe(result[0].promptSeed);
  });

  it('onEvent 回调按场景触发一次且携带 raw/optimized/index（P0 反馈管道）', async () => {
    const events: Array<{ index: number; raw: string; optimized: string }> = [];
    await generateImagePromptsSmart(
      ['第一幕', '第二幕'],
      async (prompt, index) => `${prompt}|opt-${index}`,
      undefined,
      (event) => events.push(event),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ index: 0 });
    expect(events[0].optimized).toContain('opt-0');
    expect(events[1]).toMatchObject({ index: 1 });
    expect(events[1].optimized).toContain('opt-1');
  });

  it('onEvent 回调抛错不影响生成结果（采集失败不阻断）', async () => {
    const result = await generateImagePromptsSmart(
      ['第一幕'],
      undefined,
      undefined,
      () => { throw new Error('collector-boom'); },
    );
    expect(result).toHaveLength(1);
    expect(result[0].optimizedPrompt).toBe(result[0].promptSeed);
  });

  it('onEvent 异步回调拒绝也不影响生成结果（G2 修复）', async () => {
    const result = await generateImagePromptsSmart(
      ['第一幕'],
      undefined,
      undefined,
      async () => { throw new Error('async-collector-boom'); },
    );
    expect(result).toHaveLength(1);
    expect(result[0].optimizedPrompt).toBe(result[0].promptSeed);
  });
});

describe('template-library 模板库', () => {
  it('提供七个唯一内置模板并支持分类筛选', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(7);
    expect(new Set(BUILT_IN_TEMPLATES.map((template) => template.id)).size).toBe(7);
    expect(getAllTemplates('business').every((template) => template.category === 'business')).toBe(true);
  });

  it('支持安全的自定义模板新增、覆盖、查询和删除', () => {
    const storage = memoryStorage();
    const template: VideoTemplate = {
      ...BUILT_IN_TEMPLATES[0],
      id: 'custom-1',
      name: '我的模板',
      category: 'custom',
    };
    saveCustomTemplate(template, storage);
    saveCustomTemplate({ ...template, description: '已更新' }, storage);
    expect(loadCustomTemplates(storage)).toHaveLength(1);
    expect(getTemplateById('custom-1', storage)?.description).toBe('已更新');
    deleteCustomTemplate('custom-1', storage);
    expect(getTemplateById('custom-1', storage)).toBeUndefined();
  });

  it('损坏的存储数据回退为空列表', () => {
    const storage = memoryStorage();
    storage.setItem('video_templates_custom', '{bad json');
    expect(loadCustomTemplates(storage)).toEqual([]);
  });

  it('过滤结构不完整的模板并拒绝覆盖内置模板 ID', () => {
    const storage = memoryStorage();
    storage.setItem('video_templates_custom', JSON.stringify([
      { id: 'custom-bad', name: '', imageEffect: 'unknown' },
      { ...BUILT_IN_TEMPLATES[0], id: 'custom-valid', name: '有效模板', category: 'custom' },
    ]));

    expect(loadCustomTemplates(storage).map(template => template.id)).toEqual(['custom-valid']);
    expect(() => saveCustomTemplate({ ...BUILT_IN_TEMPLATES[0], id: 'tpl-quick' }, storage)).toThrow(/自定义模板/);
  });

  it('旧存储中带 perImageDuration 字段的模板仍能加载（兼容忽略已移除字段）', () => {
    const storage = memoryStorage();
    storage.setItem('video_templates_custom', JSON.stringify([
      { ...BUILT_IN_TEMPLATES[0], id: 'custom-legacy-1', name: '旧模板', category: 'custom', perImageDuration: 4 },
    ]));
    const loaded = loadCustomTemplates(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('custom-legacy-1');
  });
});
