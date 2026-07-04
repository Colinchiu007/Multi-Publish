import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";
import { xiaohongshuProvider, douyinProvider, AnalyticResult } from "./analytics-providers";

interface ProviderConfig {
  platform: string;
  name: string;
  provider: (platform: string, credentials: any) => Promise<AnalyticResult>;
}

const PROVIDERS: ProviderConfig[] = [
  { platform: "xiaohongshu", name: "\u5C0F\u7EA2\u4E66", provider: xiaohongshuProvider },
  { platform: "douyin", name: "\u6296\u97F3", provider: douyinProvider },
];

export function getProviders(): ProviderConfig[] {
  return [...PROVIDERS];
}

export async function fetchAll(store: any): Promise<AnalyticResult[]> {
  const results: AnalyticResult[] = [];
  for (const p of PROVIDERS) {
    try {
      const accounts = store.listAccounts(p.platform);
      const credentials = accounts.length > 0 ? { cookies: accounts[0].cookies || [] } : { cookies: [] };
      const result = await p.provider(p.platform, credentials);
      results.push(result);
    } catch (e: unknown) {
      results.push({ platform: p.platform, period: "day", metrics: {}, trend: [], _error: (e as Error).message });
    }
  }
  return results;
}

export function getProvider(platform: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.platform === platform);
}