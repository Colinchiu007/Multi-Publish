/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 content-aggregator-bridge.js (JS 版) 替代。
 */

import { default as logger } from "./logger";

interface CollectParams {
  platform: string;
  keyword: string;
  maxResults?: number;
  dateRange?: string;
}

interface ContentItem {
  [key: string]: any;
}

function getPythonBridge(): any {
  return require("./python-bridge");
}

export async function collectContent(params: CollectParams): Promise<ContentItem[]> {
  try {
    logger.info("ContentAggregatorBridge", `Collecting from ${params.platform}: ${params.keyword}`);
    const pythonBridge = getPythonBridge();
    const result = await pythonBridge.requestBackend("POST", "/api/content/collect", {
      platform: params.platform,
      keyword: params.keyword,
      max_results: params.maxResults || 20,
      date_range: params.dateRange || "7d",
    });

    if (result.code !== 0) throw new Error(result.message || "\u91C7\u96C6\u5931\u8D25");
    const items = result.data?.items || result.data?.results || [];
    logger.info("ContentAggregatorBridge", `Collected ${items.length} items from ${params.platform}`);
    return items;
  } catch (e: unknown) {
    logger.error("ContentAggregatorBridge", `Collection failed: ${(e as Error).message}`);
    throw e;
  }
}

export async function getCollectedContent(params: { platform?: string; limit?: number; offset?: number } = {}): Promise<{ items: ContentItem[]; total: number }> {
  try {
    const pythonBridge = getPythonBridge();
    const result = await pythonBridge.requestBackend("GET", "/api/content/history", {
      params: { platform: params.platform, limit: params.limit || 50, offset: params.offset || 0 },
    });
    if (result.code !== 0) return { items: [], total: 0 };
    return { items: result.data?.items || [], total: result.data?.total || 0 };
  } catch (e: unknown) {
    logger.error("ContentAggregatorBridge", `Failed to get history: ${(e as Error).message}`);
    return { items: [], total: 0 };
  }
}

export async function deleteCollectedContent(contentId: string): Promise<boolean> {
  try {
    const pythonBridge = getPythonBridge();
    const result = await pythonBridge.requestBackend("DELETE", `/api/content/${contentId}`);
    return result.code === 0;
  } catch (e: unknown) {
    logger.error("ContentAggregatorBridge", `Failed to delete: ${(e as Error).message}`);
    return false;
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    const pythonBridge = getPythonBridge();
    const result = await pythonBridge.requestBackend("GET", "/api/content/status");
    return result.code === 0;
  } catch { return false; }
}