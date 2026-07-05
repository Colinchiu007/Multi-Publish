/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 render-engine.js (JS 版) 替代。
 */

import { ipcMain } from "electron";
import { default as logger } from "./logger";

interface RenderResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export class RenderEngine {
  async render(composition: string = "Explainer", props: any = {}, options: { outputFormat?: string; quality?: string } = {}): Promise<RenderResult> {
    try {
      logger.info("RenderEngine", `Rendering ${composition}...`);
      const remotion: any = await import("@remotion/renderer");
      const outputPath = options.outputFormat || `output-${Date.now()}.mp4`;
      await remotion.render({
        composition,
        inputProps: props,
        output: outputPath,
        quality: options.quality || "high",
      });
      logger.info("RenderEngine", `Render complete: ${outputPath}`);
      return { success: true, outputPath };
    } catch (e: unknown) {
      logger.error("RenderEngine", `Render failed: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  async getCompositions(): Promise<string[]> {
    return ["Explainer", "CinematicRenderer", "TalkingHead", "HyperFrames"];
  }

  registerIpcHandlers(): void {
    ipcMain.handle("render:start", async (_event: any, { composition, props, options }: { composition?: string; props?: any; options?: any }) => {
      return await this.render(composition, props, options);
    });
    ipcMain.handle("render:list-compositions", async () => {
      return await this.getCompositions();
    });
  }
}