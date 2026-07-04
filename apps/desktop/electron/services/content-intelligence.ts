import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";

interface SearchResult {
  total: number;
  results: Array<{
    title: string;
    source: string;
    engagement: number;
    url?: string;
    [key: string]: any;
  }>;
}

interface IntelligenceResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class ContentIntelligence {
  async search(keyword: string, opts: { limit?: number; noCache?: boolean } = {}): Promise<SearchResult> {
    try {
      const axios = require("axios");
      const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || "http://localhost:8000";
      const resp = await axios.get(`${ORCHESTRATOR_BASE}/api/v1/content/search`, {
        params: { q: keyword, limit: opts.limit || 10, no_cache: opts.noCache || false },
        timeout: 15000,
      });
      return resp.data;
    } catch (e: unknown) {
      logger.warn("ContentIntelligence", `Search failed: ${(e as Error).message}`);
      return { total: 0, results: [] };
    }
  }

  async recommend(content: string): Promise<IntelligenceResult> {
    try {
      const axios = require("axios");
      const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || "http://localhost:8000";
      const resp = await axios.post(`${ORCHESTRATOR_BASE}/api/v1/content/recommend`, { content }, { timeout: 30000 });
      return { success: true, data: resp.data };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  }

  async analyze(url: string): Promise<IntelligenceResult> {
    try {
      const axios = require("axios");
      const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || "http://localhost:8000";
      const resp = await axios.post(`${ORCHESTRATOR_BASE}/api/v1/content/analyze`, { url }, { timeout: 30000 });
      return { success: true, data: resp.data };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  }
}