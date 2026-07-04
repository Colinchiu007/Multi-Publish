import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { default as logger } from "./logger";

interface PublishPollerOpts {
  orchestratorUrl?: string;
  pollInterval?: number;
  publisherRouter?: any;
  rpaViewManager?: any;
  store?: any;
  rpaCheck?: (platform: string) => boolean;
}

export class PublishPoller {
  private orchestratorUrl: string;
  private pollInterval: number;
  private publisherRouter: any;
  private rpaViewManager: any;
  private store: any;
  private _rpaCheck: ((platform: string) => boolean) | null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _running: boolean = false;

  constructor(opts: PublishPollerOpts) {
    this.orchestratorUrl = opts.orchestratorUrl || process.env.ORCHESTRATOR_URL || "http://39.105.42.85";
    this.pollInterval = opts.pollInterval || 2000;
    this.publisherRouter = opts.publisherRouter;
    this.rpaViewManager = opts.rpaViewManager;
    this.store = opts.store;
    this._rpaCheck = typeof opts.rpaCheck === "function" ? opts.rpaCheck : null;
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => this._poll(), this.pollInterval);
    logger.info("PublishPoller", "started (interval=" + this.pollInterval + "ms)");
  }

  stop(): void {
    if (!this._running) return;
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    logger.info("PublishPoller", "stopped");
  }

  private _isRpaEnabled(platform: string): boolean {
    if (!this._rpaCheck) return true;
    return this._rpaCheck(platform);
  }

  private async _poll(): Promise<void> {
    try {
      const resp = await axios.get(this.orchestratorUrl + "/api/jobs/publish/pending");
      const items = resp.data && resp.data.items;
      if (!items || items.length === 0) return;
      logger.info("PublishPoller", "found " + items.length + " pending task(s)");
      for (const task of items) await this._processTask(task);
    } catch (err: any) {
      logger.warn("PublishPoller", "poll error: " + err.message);
    }
  }

  private async _processTask(task: any): Promise<void> {
    const input = task.input_data || {};
    const taskId = task.id;
    const platform = input.platform;
    const videoUrl = input.video_url;

    if (!taskId || !platform || !videoUrl) {
      logger.warn("PublishPoller", "invalid task: " + JSON.stringify({ id: taskId, platform }));
      return;
    }
    if (!this._isRpaEnabled(platform)) { logger.info("PublishPoller", "skip " + taskId + " (RPA disabled)"); return; }
    if (input.mode === "cloud") { logger.info("PublishPoller", "skip " + taskId + " (mode=cloud)"); return; }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish_"));
    let videoPath: string | null = null;
    let coverPath: string | null = null;

    try {
      await this._updateTaskStatus(taskId, "downloading", { phase: "download", percent: 10, message: "Downloading video..." });
      const parsedUrl = new URL(videoUrl);
      const ext = path.extname(parsedUrl.pathname) || ".mp4";
      videoPath = path.join(tmpDir, "video" + ext);

      const writer = fs.createWriteStream(videoPath);
      const downloadResp = await axios.get(videoUrl, { responseType: "stream" });
      downloadResp.data.pipe(writer);
          await new Promise((resolve, reject) => { writer.on("finish", () => resolve(undefined)); writer.on("error", reject); });

      if (input.cover_url) {
        try {
          const coverExt = path.extname(new URL(input.cover_url).pathname) || ".jpg";
          coverPath = path.join(tmpDir, "cover" + coverExt);
          const coverWriter = fs.createWriteStream(coverPath);
          const coverResp = await axios.get(input.cover_url, { responseType: "stream" });
          coverResp.data.pipe(coverWriter);
          await new Promise((resolve, reject) => { writer.on("finish", () => resolve(undefined)); writer.on("error", reject); });
        } catch { coverPath = null; }
      }

      const fileSizeMb = Math.round((fs.statSync(videoPath).size || 0) / 1024 / 1024 * 10) / 10;
      await this._updateTaskStatus(taskId, "publishing", { phase: "publish", percent: 30, message: "Publishing to " + platform + " (" + fileSizeMb + "MB)..." });

      if (!this.publisherRouter) throw new Error("publisherRouter not configured");
      const publisher = this.publisherRouter.createPublisher(platform, { rpaViewManager: this.rpaViewManager, store: this.store });

      const publishResult = await publisher.publish({
        article: { title: input.title || "", content: input.desc || "", desc: input.desc || "", tags: input.tags || [], video_path: videoPath, cover_path: coverPath, cover_url: coverPath },
      });

      await this._updateTaskStatus(taskId, "success", { platform, publish_id: publishResult.postId || "", url: publishResult.url || "", file_size_mb: fileSizeMb });
      logger.info("PublishPoller", "published " + taskId + " to " + platform);
    } catch (err: any) {
      logger.error("PublishPoller", "task " + taskId + " failed: " + err.message);
      try { await this._updateTaskStatus(taskId, "failed", null, err.message); } catch {}
    } finally {
      try { if (videoPath) fs.unlinkSync(videoPath); if (coverPath) fs.unlinkSync(coverPath); fs.rmdirSync(tmpDir); } catch {}
    }
  }

  private async _updateTaskStatus(taskId: string, status: string, output: any, error?: string): Promise<void> {
    const body: any = { status };
    if (output) body.output = output;
    if (error) body.error = error;
    await axios.put(this.orchestratorUrl + "/api/jobs/publish/" + taskId + "/status", body);
  }
}