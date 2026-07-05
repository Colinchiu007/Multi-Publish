/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 video-uploader.js (JS 版) 替代。
 */

import * as fs from "fs";
import * as path from "path";
import { default as logger } from "./logger";

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export async function uploadVideo(
  filePath: string,
  _platform: string,
  _account: any,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `\u6587\u4EF6\u4E0D\u5B58\u5728: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const totalChunks = Math.ceil(totalSize / chunkSize);
  const chunks: Buffer[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalSize);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(end - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    chunks.push(buf);

    if (onProgress) {
      onProgress({ loaded: end, total: totalSize, percent: Math.round((end / totalSize) * 100) });
    }
  }

  logger.info("VideoUploader", `\u6587\u4EF6 ${path.basename(filePath)} \u5206\u4E3A ${totalChunks} \u4E2A\u5206\u7247`);

  return { success: true, url: filePath };
}

export function deleteLocalFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch (e: unknown) {
    logger.warn("VideoUploader", `\u5220\u9664\u5931\u8D25: ${(e as Error).message}`);
    return false;
  }
}