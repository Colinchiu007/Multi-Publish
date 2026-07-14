import type { WatermarkConfig, WatermarkPosition } from './types';

const STORAGE_KEY = 'story2video_watermark_config';

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: false,
  text: '',
  position: 'bottom-right',
  fontSize: 24,
  opacity: 0.6,
  color: '#ffffff',
};

export function getDefaultWatermarkConfig(overrides?: Partial<WatermarkConfig>): WatermarkConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export function loadWatermarkConfig(): WatermarkConfig {
  try {
    if (typeof localStorage === 'undefined') return getDefaultWatermarkConfig();
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // localStorage not available or corrupt data
  }
  return { ...DEFAULT_CONFIG };
}

export function saveWatermarkConfig(config: WatermarkConfig): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage not available
  }
}

function getWatermarkPosition(
  position: WatermarkPosition,
  width: number,
  height: number,
  textWidth: number,
  fontSize: number,
): { x: number; y: number } {
  const padding = 20;

  switch (position) {
    case 'top-left':
      return { x: padding, y: padding + fontSize };
    case 'top-right':
      return { x: width - textWidth - padding, y: padding + fontSize };
    case 'bottom-left':
      return { x: padding, y: height - padding };
    case 'bottom-right':
      return { x: width - textWidth - padding, y: height - padding };
    case 'center':
      return { x: (width - textWidth) / 2, y: height / 2 };
    default:
      return { x: width - textWidth - padding, y: height - padding };
  }
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  config: WatermarkConfig,
  width: number,
  height: number,
): void {
  if (!config.enabled || !config.text) {
    return;
  }

  ctx.save();
  ctx.font = `${config.fontSize}px sans-serif`;
  ctx.fillStyle = config.color;
  ctx.globalAlpha = config.opacity;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  const textWidth = ctx.measureText(config.text).width;
  const { x, y } = getWatermarkPosition(config.position, width, height, textWidth, config.fontSize);

  ctx.fillText(config.text, x, y);
  ctx.restore();
}
