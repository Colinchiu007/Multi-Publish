/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 p1-integration.js (JS 版) 替代。
 */

export function getP1Status(): { enabled: boolean; stage: string } {
  return { enabled: true, stage: "completed" };
}

export function getP1Capabilities(): string[] {
  return ["publish", "monitor", "analyze"];
}