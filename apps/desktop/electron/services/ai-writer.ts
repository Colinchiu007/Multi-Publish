export interface AiWriterConfig { provider: string; apiKey: string; model: string }

let _config: AiWriterConfig | null = null;

export function configure(config: AiWriterConfig): void { _config = config; }

export function isConfigured(): boolean { return _config !== null && !!_config.apiKey; }

export async function generateTitles(topic: string): Promise<string[]> {
  if (!_config) throw new Error("AI Writer not configured");
  return [`${topic}——深度解析`, `${topic}的过去与未来`];
}

export async function enhanceContent(content: string, _style: string): Promise<string> {
  return content;
}

export async function generateSummary(content: string): Promise<string> {
  return content.slice(0, 100) + "...";
}