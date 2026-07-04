import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";

export type LicenseTier = "free" | "trial" | "pro";

interface LicenseData {
  tier: LicenseTier;
  activatedAt: string | null;
  expiresAt: string | null;
  deviceId: string;
  orderId?: string;
}

function getLicensePath(): string {
  return path.join(app.getPath("userData"), "license.json");
}

let _cache: LicenseData | null = null;

function _read(): LicenseData {
  if (_cache) return _cache;
  try {
    const p = getLicensePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      _cache = JSON.parse(raw);
      return _cache!;
    }
  } catch (e: unknown) {
    logger.warn("LicenseManager", `Read failed: ${(e as Error).message}`);
  }
  return { tier: "free", activatedAt: null, expiresAt: null, deviceId: "" };
}

function _write(data: LicenseData): void {
  _cache = data;
  try {
    const p = getLicensePath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  } catch (e: unknown) {
    logger.error("LicenseManager", `Write failed: ${(e as Error).message}`);
  }
}

export function getTier(): LicenseTier {
  const data = _read();
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    if (data.tier === "trial") return "free";
  }
  return data.tier;
}

export function isPro(): boolean {
  return getTier() === "pro";
}

export function activatePro(orderId: string): boolean {
  const data = _read();
  data.tier = "pro";
  data.activatedAt = new Date().toISOString();
  data.expiresAt = null;
  data.orderId = orderId;
  _write(data);
  logger.info("LicenseManager", `Pro activated: ${orderId}`);
  return true;
}

export function startTrial(days: number = 7): boolean {
  const data = _read();
  if (data.tier !== "free") return false;
  data.tier = "trial";
  data.activatedAt = new Date().toISOString();
  data.expiresAt = new Date(Date.now() + days * 86400000).toISOString();
  _write(data);
  logger.info("LicenseManager", `Trial started: ${days} days`);
  return true;
}

export function getStatus(): LicenseData {
  return { ..._read() };
}