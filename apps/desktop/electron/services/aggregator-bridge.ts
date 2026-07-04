export interface AggregatorResult { success: boolean; data?: unknown; error?: string }

let _bridge: { fetchContent: (url: string) => Promise<AggregatorResult>; rewriteContent: (text: string) => Promise<string> } | null = null;

export function init(bridge: typeof _bridge): void { _bridge = bridge; }

export async function fetchContent(url: string): Promise<AggregatorResult> {
  if (!_bridge) throw new Error("Aggregator bridge not initialized");
  return _bridge.fetchContent(url);
}

export async function rewriteContent(text: string): Promise<string> {
  if (!_bridge) throw new Error("Aggregator bridge not initialized");
  return _bridge.rewriteContent(text);
}