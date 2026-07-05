/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 aggregator-bridge.js (JS 版) 替代。
 */

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