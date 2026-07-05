/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 redemption-codes.js (JS 版) 替代。
 */

import * as crypto from "crypto";

const HMAC_KEY = "mp-redemption-secret-change-in-production";
const PREFIX = "MP";

export interface RedemptionResult {
  valid: boolean;
  plan?: "pro-monthly" | "pro-yearly" | "pro-lifetime";
  expiresAt?: string;
  error?: string;
}

export function generate(plan: "pro-monthly" | "pro-yearly" | "pro-lifetime", daysValid: number = 365): string {
  const random = crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 12);
  const payload = `${PREFIX}:${plan}:${random}`;
  const sig = crypto.createHmac("sha256", HMAC_KEY).update(payload).digest("hex").slice(0, 8).toUpperCase();
  const code = `${PREFIX}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}-${sig}`;
  return code;
}

export function validate(code: string): RedemptionResult {
  const parts = code.split("-");
  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return { valid: false, error: "\u683C\u5F0F\u9519\u8BEF" };
  }

  const random = parts[1] + parts[2] + parts[3];
  const sig = parts[4];

  const payload = `${PREFIX}:pro-monthly:${random}`;
  const expectedSig = crypto.createHmac("sha256", HMAC_KEY).update(payload).digest("hex").slice(0, 8).toUpperCase();

  if (sig !== expectedSig) {
    return { valid: false, error: "\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25" };
  }

  return { valid: true, plan: "pro-monthly", expiresAt: new Date(Date.now() + 365 * 86400000).toISOString() };
}