import type { ImageEffect } from './types';

export type EraType = 'ancient' | 'modern' | 'mixed';

export interface EraResult {
  era: EraType;
  confidence: number;
  evidence: string[];
}

export interface DynastyResult {
  name: string;
  period: string;
  visual_style: string;
  confidence: number;
  method: string;
  evidence: string[];
}

export interface HistorySceneEnrichment {
  text: string;
  era: EraResult;
  dynasty: DynastyResult | null;
  visualStyle: string;
  sentiment: 'positive' | 'negative' | 'peaceful';
  promptSeed: string;
  imageEffect?: ImageEffect;
}

const MODERN_TERMS = [
  '电脑', '手机', '互联网', '微信', '抖音', '微博', '地铁', '高铁', '飞机', '汽车',
  '人工智能', '大数据', '区块链', '社区服务中心', '医保', '社保', '外卖', '快递', '电商',
];

const ANCIENT_TERMS = [
  '朝廷', '皇帝', '王朝', '宫殿', '将军', '战国', '春秋', '三国', '古代', '城墙', '史官',
  '甲午', '鸦片战争', '丝绸之路', '科举', '长安', '洛阳',
];

const DYNASTY_RULES: Array<Omit<DynastyResult, 'confidence' | 'method' | 'evidence'> & { keywords: string[] }> = [
  { keywords: ['清朝', '清代', '大清', '清军', '康熙', '乾隆', '慈禧', '甲午', '鸦片战争'], name: '清朝', period: '清朝（1644-1912）', visual_style: '清代宫殿、园林、清装、马褂、暖灰与金色电影光线' },
  { keywords: ['明朝', '明代', '大明', '朱元璋', '朱棣', '永乐', '锦衣卫'], name: '明朝', period: '明朝（1368-1644）', visual_style: '明代建筑、宫城、汉服、乌纱帽、深红与青绿色调' },
  { keywords: ['唐朝', '唐代', '大唐', '李世民', '武则天', '唐玄宗', '长安', '安史之乱'], name: '唐朝', period: '唐朝（618-907）', visual_style: '唐代宫殿、长安城、圆领袍、襦裙、金红色盛唐光线' },
  { keywords: ['宋朝', '宋代', '北宋', '南宋', '苏轼', '岳飞', '清明上河图'], name: '宋朝', period: '宋朝（960-1279）', visual_style: '宋代城楼、市井、宋装、烟雨与克制的青灰色调' },
  { keywords: ['汉朝', '汉代', '西汉', '东汉', '刘邦', '汉武帝', '霍去病'], name: '汉朝', period: '汉朝（前202-220）', visual_style: '汉代宫阙、古城、曲裾深衣、黛青与赭石色调' },
  { keywords: ['秦朝', '秦代', '秦始皇', '兵马俑', '万里长城'], name: '秦朝', period: '秦朝（前221-前207）', visual_style: '秦代城墙、兵马俑、铠甲、青铜与尘土色调' },
  { keywords: ['三国', '曹操', '刘备', '诸葛亮', '赤壁之战'], name: '三国', period: '三国（220-280）', visual_style: '汉末城寨、战场、战袍旌旗、冷暖对比光线' },
  { keywords: ['民国', '辛亥革命', '上海滩', '中山装', '旗袍'], name: '民国', period: '民国（1912-1949）', visual_style: '民国洋楼、街巷、旗袍与胶片棕黄色调' },
];

export class SentimentAnalyzer {
  analyze(text: string): 'positive' | 'negative' | 'peaceful' {
    if (['喜悦', '欢乐', '胜利', '成功', '和平', '美好'].some((word) => text.includes(word))) return 'positive';
    if (['悲伤', '失败', '死亡', '战争', '痛苦', '灾难'].some((word) => text.includes(word))) return 'negative';
    return 'peaceful';
  }
}

export class EraDetector {
  static detect(text: string): EraResult {
    const modern = MODERN_TERMS.filter((term) => text.includes(term));
    const ancient = ANCIENT_TERMS.filter((term) => text.includes(term));
    if (modern.length > ancient.length && modern.length > 0) {
      return { era: 'modern', confidence: Math.min(0.98, 0.7 + modern.length * 0.06), evidence: modern.slice(0, 5) };
    }
    if (ancient.length > modern.length && ancient.length > 0) {
      return { era: 'ancient', confidence: Math.min(0.98, 0.7 + ancient.length * 0.06), evidence: ancient.slice(0, 5) };
    }
    if (modern.length > 0 && ancient.length === 0) return { era: 'modern', confidence: 0.8, evidence: modern.slice(0, 5) };
    if (ancient.length > 0 && modern.length === 0) return { era: 'ancient', confidence: 0.8, evidence: ancient.slice(0, 5) };
    return { era: 'mixed', confidence: 0, evidence: [] };
  }
}

export class DynastyDetector {
  static detect(text: string): DynastyResult | null {
    for (const rule of DYNASTY_RULES) {
      const evidence = rule.keywords.find((keyword) => text.includes(keyword));
      if (evidence) {
        return { ...rule, confidence: 0.95, method: 'keyword', evidence: [evidence] };
      }
    }
    return null;
  }
}

function defaultVisualStyle(era: EraType): string {
  if (era === 'modern') return '现代真实场景、自然肤色、清晰构图、柔和日光';
  if (era === 'ancient') return '古朴建筑、传统服饰、电影感体积光、低饱和暖色';
  return '具有叙事感的电影画面、自然光线、层次清晰';
}

export function enrichHistoryScene(text: string, imageEffect?: ImageEffect): HistorySceneEnrichment {
  const era = EraDetector.detect(text);
  const dynasty = era.era === 'modern' ? null : DynastyDetector.detect(text);
  const sentiment = new SentimentAnalyzer().analyze(text);
  const visualStyle = dynasty?.visual_style || defaultVisualStyle(era.era);
  const promptSeed = [text.trim(), visualStyle, sentiment === 'negative' ? '阴影与冷色氛围' : '自然层次与叙事光线', '无文字、主体明确'].filter(Boolean).join('；');
  return { text, era, dynasty, visualStyle, sentiment, promptSeed, imageEffect };
}

export function generateRawImagePrompts(texts: string[], imageEffect?: ImageEffect): HistorySceneEnrichment[] {
  return (Array.isArray(texts) ? texts : []).map((text) => enrichHistoryScene(String(text || ''), imageEffect));
}

/**
 * 领域增强后再交给 prompt-engine 优化。优化回调失败时保留本地提示词，
 * 让没有远端服务时的错误边界仍然可解释。
 *
 * onEvent（可选）：每个场景处理后触发一次最小化生成事件（raw/optimized/index），
 * 供提示词引擎自进化信号采集器（P0 反馈管道）消费；不传则行为与旧版完全一致。
 * 支持同步与异步回调；回调抛错/拒绝均不阻断生成主流程（G2 修复）。
 */
export async function generateImagePromptsSmart(
  texts: string[],
  optimizeFn?: (prompt: string, index: number) => Promise<string> | string,
  imageEffect?: ImageEffect,
  onEvent?: (event: { index: number; raw: string; optimized: string }) => void | Promise<void>,
): Promise<Array<HistorySceneEnrichment & { optimizedPrompt: string }>> {
  const raw = generateRawImagePrompts(texts, imageEffect);
  const output: Array<HistorySceneEnrichment & { optimizedPrompt: string }> = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    let optimizedPrompt = item.promptSeed;
    if (optimizeFn) {
      try {
        optimizedPrompt = (await optimizeFn(item.promptSeed, index)) || item.promptSeed;
      } catch {
        // 保留本地规则结果，避免领域增强阶段吞掉整条流水线。
      }
    }
    output.push({ ...item, optimizedPrompt });
    if (typeof onEvent === 'function') {
      try {
        await onEvent({ index, raw: item.promptSeed, optimized: optimizedPrompt });
      } catch {
        // 采集回调失败不得影响提示词生成主流程。
      }
    }
  }
  return output;
}
