/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 api-platform-adapter.js (JS 版) 替代。
 */

import * as path from "path";
import { default as logger } from "./logger";

interface PublishParams {
  cookies?: string;
  title?: string;
  content?: string;
  images?: string[];
  video?: string | null;
  tags?: string[];
}

interface PublishResult {
  success: boolean;
  postId?: string;
  message: string;
  raw?: any;
  needRelogin?: boolean;
}

let engine: any = null;
try {
  engine = require("../../../packages/api-publish-engine/src/index");
} catch (_e: unknown) {
  try { engine = require("@multi-publish/api-publish-engine"); }
  catch (e2: unknown) {
    logger.error("APIPlatformAdapter", "Cannot load api-publish-engine: " + (e2 as Error).message);
    engine = null;
  }
}

export async function publishViaApi(platform: string, params: PublishParams): Promise<PublishResult> {
  if (!engine) return { success: false, message: "API publish engine not loaded" };
  try {
    const adapter = engine.getAdapter(platform);
    if (!adapter) return { success: false, message: "Unsupported API platform: " + platform };

    const taskData = {
      title: params.title || "",
      content: params.content || "",
      tags: params.tags || [],
      images: params.images || [],
      video: params.video || null,
    };

    const result = await adapter.execute(taskData, params.cookies || "");
    if (result && result.success) {
      logger.info("APIPlatformAdapter", platform + " publish success, id=" + (result.publishId || result.url || ""));
      return { success: true, postId: result.publishId || result.url, message: result.message || "Publish success" };
    }
    return { success: false, message: result.error || "Publish failed", raw: result };
  } catch (e: any) {
    logger.error("APIPlatformAdapter", platform + " publish failed: " + e.message);
    if (e.response && (e.response.status === 401 || e.response.status === 403)) {
      return { success: false, message: "Login expired, please re-login", needRelogin: true };
    }
    return { success: false, message: "Publish failed: " + e.message };
  }
}

export async function uploadChunked(_platform: string, _filePath: string, _params: any): Promise<PublishResult> {
  return { success: false, message: "Chunked upload requires desktop adapter config" };
}

export function isApiPlatform(platform: string): boolean {
  return engine ? engine.supportsApi(platform) : false;
}

export function getApiPlatforms(): string[] {
  return engine ? Object.keys(engine.REGISTRY || {}) : [];
}