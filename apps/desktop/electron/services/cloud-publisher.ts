/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 cloud-publisher.js (JS 版) 替代。
 */

import { ipcMain } from "electron";
import { default as logger } from "./logger";

interface CloudPublisherOpts {
  orchestratorUrl?: string;
  store?: any;
}

interface SubmitParams {
  videoUrl: string;
  platform: string;
  title: string;
  desc?: string;
  tags?: string[];
  coverUrl?: string;
}

export class CloudPublisher {
  private _orchestratorUrl: string;
  private _store: any;

  constructor(opts: CloudPublisherOpts) {
    this._orchestratorUrl = opts.orchestratorUrl || "http://39.105.42.85";
    this._store = opts.store || null;
  }

  async submitTask({ videoUrl, platform, title, desc, tags, coverUrl }: SubmitParams): Promise<any> {
    const axios = require("axios");
    const resp = await axios.post(this._orchestratorUrl + "/api/jobs/publish-video", {
      video_url: videoUrl, platform, title,
      desc: desc || "", tags: tags || [],
      cover_url: coverUrl || "", mode: "cloud",
    });
    return resp.data;
  }

  async listTasks(): Promise<any> {
    const axios = require("axios");
    const resp = await axios.get(this._orchestratorUrl + "/api/jobs/publish");
    return resp.data;
  }

  async getTask(taskId: string): Promise<any> {
    const axios = require("axios");
    const resp = await axios.get(this._orchestratorUrl + "/api/jobs/publish/" + taskId);
    return resp.data;
  }

  getSupportedPlatforms(): Array<{ id: string; name: string }> {
    return [
      { id: "bilibili", name: "B\u7AD9" },
      { id: "douyin", name: "\u6296\u97F3" },
    ];
  }

  registerIpcHandlers(): void {
    ipcMain.handle("cloud-publisher:submit", async (_event: any, params: SubmitParams) => {
      try { const result = await this.submitTask(params); return { ok: true, data: result }; }
      catch (err: any) { logger.error("CloudPublisher", "submit failed: " + err.message); return { ok: false, error: err.message }; }
    });

    ipcMain.handle("cloud-publisher:list-tasks", async () => {
      try { const result = await this.listTasks(); return { ok: true, data: result }; }
      catch (err: any) { logger.error("CloudPublisher", "list-tasks failed: " + err.message); return { ok: false, error: err.message }; }
    });

    ipcMain.handle("cloud-publisher:get-task", async (_event: any, taskId: string) => {
      try { const result = await this.getTask(taskId); return { ok: true, data: result }; }
      catch (err: any) { logger.error("CloudPublisher", "get-task failed: " + err.message); return { ok: false, error: err.message }; }
    });

    ipcMain.handle("cloud-publisher:platforms", async () => {
      return { ok: true, data: this.getSupportedPlatforms() };
    });
  }
}