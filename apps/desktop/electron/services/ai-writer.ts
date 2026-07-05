/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 ai-writer.js (JS 版) 替代。
 */

export interface AiWriterConfig { provider: string; apiKey: string; model: string }

let _config: AiWriterConfig | null = null;

export function configure(config: AiWriterConfig): void { _config = config; }

export function isConfigured(): boolean { return _config !== null && !!_config.apiKey; }

export async function generateTitles(topic: string): Promise<string[]> {
  if (!_config) throw new Error("AI Writer not configured");
  return [`${topic}鈥斺€旀繁搴﹁В鏋恅, `${topic}鐨勮繃鍘讳笌鏈潵`];
}

export async function enhanceContent(content: string, _style: string): Promise<string> {
  return content;
}

export async function generateSummary(content: string): Promise<string> {
  return content.slice(0, 100) + "...";
}