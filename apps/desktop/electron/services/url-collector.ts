import { ipcMain } from "electron";

export interface CollectResult {
  success: boolean;
  title?: string;
  description?: string;
  content?: string;
  coverImage?: string;
  publishTime?: string;
  source?: string;
  url?: string;
  error?: string;
}

export class UrlCollector {
  private _axios: any = null;

  private _getAxios(): any {
    if (!this._axios) {
      this._axios = require("axios");
    }
    return this._axios;
  }

  async collect(url: string): Promise<CollectResult> {
    if (!url || typeof url !== "string") {
      return { success: false, error: "\u65E0\u6548\u7684 URL" };
    }

    try {
      new URL(url);
    } catch {
      return { success: false, error: "URL \u683C\u5F0F\u4E0D\u6B63\u786E" };
    }

    try {
      return await this._collectViaHttp(url);
    } catch (e: unknown) {
      return { success: false, error: `\u91C7\u96C6\u5931\u8D25: ${(e as Error).message}` };
    }
  }

  private async _collectViaHttp(url: string): Promise<CollectResult> {
    const axios = this._getAxios();
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      responseType: "text",
      maxRedirects: 5,
    });
    const html: string = response.data;
    return this._parseHtml(html, url);
  }

  private _parseHtml(html: string, url: string): CollectResult {
    const cheerio = require("cheerio");
    const $ = cheerio.load(html);

    const getMeta = (name: string): string => {
      const el = $(`meta[property="${name}"], meta[name="${name}"]`).first();
      return el.attr("content") || "";
    };

    const title = getMeta("og:title") || $("title").first().text() || "";
    const description = getMeta("og:description") || getMeta("description") || "";
    const coverImage = getMeta("og:image") || getMeta("twitter:image") || "";
    const publishTime = getMeta("article:published_time") || getMeta("pubdate") || $("time[datetime]").first().attr("datetime") || "";
    const source = getMeta("og:site_name") || new URL(url).hostname;

    const article = $("article").first();
    const main = $("main").first();
    const contentEl = article.length ? article : (main.length ? main : $("body"));
    const textContent = contentEl.text().trim().replace(/\s+/g, " ").slice(0, 50000);

    return {
      success: true,
      title,
      description,
      content: textContent,
      coverImage,
      publishTime,
      source,
      url,
    };
  }

  registerIpcHandlers(): void {
    ipcMain.handle("url-collect:fetch", async (_event: any, { url }: { url: string }) => {
      try {
        const result = await this.collect(url);
        return { code: result.success ? 0 : -1, data: result };
      } catch (e: unknown) {
        return { code: -1, message: (e as Error).message };
      }
    });
  }
}