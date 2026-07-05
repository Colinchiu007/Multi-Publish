/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 first-run.js (JS 版) 替代。
 */

import * as fs from "fs";
import * as path from "path";

const FIRST_RUN_FLAG = "multi-publish-initialized";

export function checkDeps(): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  try { require("electron"); } catch { missing.push("electron"); }
  return { ready: missing.length === 0, missing };
}

export function isFirstRun(configDir: string): boolean {
  const flagPath = path.join(configDir, FIRST_RUN_FLAG);
  return !fs.existsSync(flagPath);
}

export function markComplete(configDir: string): void {
  const flagPath = path.join(configDir, FIRST_RUN_FLAG);
  fs.writeFileSync(flagPath, new Date().toISOString(), "utf-8");
}

export function getSetupProgress(configDir: string): { accounts: number; templates: boolean } {
  return { accounts: 0, templates: false };
}