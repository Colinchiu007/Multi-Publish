/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 viral-engine.js (JS 版) 替代。
 */

import { ipcMain } from "electron";
import { default as logger } from "./logger";

const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || "http://localhost:8000";

interface ViralResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class ViralEngine {
  private _axios: any = null;

  private _getAxios(): any {
    if (!this._axios) {
      this._axios = require("axios");
    }
    return this._axios;
  }

  async analyze(content: string, platform?: string): Promise<ViralResult> {
    try {
      const axios = this._getAxios();
      const resp = await axios.post(`${ORCHESTRATOR_BASE}/api/v1/viral/analyze`, { content, platform }, { timeout: 30000 });
      return { success: true, data: resp.data };
    } catch (e: unknown) {
      logger.warn("ViralEngine", `Analyze failed: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  async generate(prompt: string, style?: string): Promise<ViralResult> {
    try {
      const axios = this._getAxios();
      const resp = await axios.post(`${ORCHESTRATOR_BASE}/api/v1/viral/generate`, { prompt, style }, { timeout: 30000 });
      return { success: true, data: resp.data };
    } catch (e: unknown) {
      logger.warn("ViralEngine", `Generate failed: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  async trending(platform?: string): Promise<ViralResult> {
    try {
      const axios = this._getAxios();
      const resp = await axios.get(`${ORCHESTRATOR_BASE}/api/v1/viral/trending`, { params: { platform }, timeout: 15000 });
      return { success: true, data: resp.data };
    } catch (e: unknown) {
      logger.warn("ViralEngine", `Trending failed: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  registerIpcHandlers(): void {
    ipcMain.handle("viral:analyze", async (_event: any, { content, platform }: { content: string; platform?: string }) => {
      return await this.analyze(content, platform);
    });
    ipcMain.handle("viral:generate", async (_event: any, { prompt, style }: { prompt: string; style?: string }) => {
      return await this.generate(prompt, style);
    });
    ipcMain.handle("viral:trending", async (_event: any, { platform }: { platform?: string }) => {
      return await this.trending(platform);
    });
  }
}