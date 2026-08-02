import type { VideoTemplate, TemplateCategory } from './types';

/** 旧 Story2Video 的七个内置模板，作为流水线的可选默认值。 */
export const BUILT_IN_TEMPLATES: VideoTemplate[] = [
  {
    id: 'tpl-quick', name: '快速成片', description: '标准模式，适合大多数场景', category: 'popular',
    imageEffect: 'zoom-in', transitionEffect: 'fade', perImageDuration: 4, size: '1920x1080',
  },
  {
    id: 'tpl-slideshow', name: '幻灯片演示', description: '平稳切换，适合产品展示', category: 'business',
    imageEffect: 'none', transitionEffect: 'slide-left', perImageDuration: 5, size: '1920x1080',
    subtitleStyle: { enabled: true, font: 'sans-serif', size: 'lg', style: 'style1' },
  },
  {
    id: 'tpl-dynamic', name: '动感快剪', description: '快速切换，适合精彩集锦', category: 'creative',
    imageEffect: 'zoom-out', transitionEffect: 'slide-right', perImageDuration: 3, size: '1920x1080',
    bgm: { url: '', name: '节奏明快', volume: 5 },
  },
  {
    id: 'tpl-vlog', name: 'Vlog 日常', description: '自然温馨风格，适合生活记录', category: 'vlog',
    imageEffect: 'pan-left', transitionEffect: 'fade', perImageDuration: 4, size: '1080x1920',
    subtitleStyle: { enabled: true, font: 'sans-serif', size: 'md', style: 'style2' },
  },
  {
    id: 'tpl-education', name: '知识讲解', description: '清晰展示，适合教程内容', category: 'education',
    imageEffect: 'none', transitionEffect: 'fade', perImageDuration: 6, size: '1920x1080',
    subtitleStyle: { enabled: true, font: 'serif', size: 'lg', style: 'style3' },
  },
  {
    id: 'tpl-promo', name: '营销推广', description: '强视觉冲击，适合广告宣传', category: 'business',
    imageEffect: 'zoom-in', transitionEffect: 'slide-up', perImageDuration: 3, size: '1920x1080',
    bgm: { url: '', name: '活力电子', volume: 7 },
  },
  {
    id: 'tpl-cinematic', name: '电影质感', description: '沉稳大气，适合品牌宣传', category: 'creative',
    imageEffect: 'pan-right', transitionEffect: 'fade', perImageDuration: 5, size: '1920x1080',
    subtitleStyle: { enabled: true, font: 'serif', size: 'lg', style: 'style1' },
  },
];

const STORAGE_KEY = 'video_templates_custom';
const TEMPLATE_CATEGORIES = new Set<TemplateCategory>([
  'popular', 'business', 'creative', 'vlog', 'education', 'custom',
]);
const IMAGE_EFFECTS = new Set([
  'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
  'zoom-pan', 'rotate', 'blur-in', 'none',
]);
const TRANSITION_EFFECTS = new Set([
  'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'none',
]);

function getStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function isVideoTemplate(value: unknown): value is VideoTemplate {
  if (!value || typeof value !== 'object') return false;
  const template = value as Partial<VideoTemplate>;
  return typeof template.id === 'string' && /^custom-[a-zA-Z0-9_-]{1,80}$/.test(template.id)
    && typeof template.name === 'string' && template.name.trim().length > 0 && template.name.length <= 80
    && typeof template.description === 'string' && template.description.length <= 240
    && TEMPLATE_CATEGORIES.has(template.category as TemplateCategory)
    && IMAGE_EFFECTS.has(template.imageEffect as VideoTemplate['imageEffect'])
    && TRANSITION_EFFECTS.has(template.transitionEffect as VideoTemplate['transitionEffect'])
    && Number.isFinite(template.perImageDuration) && Number(template.perImageDuration) > 0
    && typeof template.size === 'string' && /^\d{3,5}x\d{3,5}$/.test(template.size);
}

/** 获取内置模板和自定义模板。 */
export function getAllTemplates(category?: TemplateCategory | 'all', storage?: Storage | null): VideoTemplate[] {
  const all = [...BUILT_IN_TEMPLATES, ...loadCustomTemplates(storage)];
  if (category && category !== 'all') return all.filter((template) => template.category === category);
  return all;
}

export function getTemplateById(id: string, storage?: Storage | null): VideoTemplate | undefined {
  return getAllTemplates('all', storage).find((template) => template.id === id);
}

export function loadCustomTemplates(storage?: Storage | null): VideoTemplate[] {
  const target = getStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isVideoTemplate) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: VideoTemplate, storage?: Storage | null): void {
  const target = getStorage(storage);
  if (!target) return;
  const normalized = { ...template, category: 'custom' as const };
  if (!isVideoTemplate(normalized) || BUILT_IN_TEMPLATES.some((item) => item.id === normalized.id)) {
    throw new Error('自定义模板参数无效');
  }
  const custom = loadCustomTemplates(target).filter((item) => item.id !== template.id);
  custom.push(normalized);
  target.setItem(STORAGE_KEY, JSON.stringify(custom));
}

export function deleteCustomTemplate(id: string, storage?: Storage | null): void {
  const target = getStorage(storage);
  if (!target) return;
  target.setItem(STORAGE_KEY, JSON.stringify(loadCustomTemplates(target).filter((item) => item.id !== id)));
}
