import * as path from "path";
import { default as logger } from "./logger";

interface RouteConfig {
  mode: "rpa_vm" | "backend";
  timeout: number;
  platform?: string;
}

interface PlatformConfig {
  type?: string;
  publish_url?: string;
  [key: string]: any;
}

interface Task {
  id?: string;
  article?: {
    title?: string;
    content?: string;
    video_path?: string;
    media_paths?: string[];
    cover_url?: string;
    cover_path?: string;
    tags?: string[];
    draft?: boolean;
    accountId?: string;
  };
  accountId?: string;
  [key: string]: any;
}

interface Deps {
  rpaViewManager?: any;
  store?: any;
  pythonBridge?: any;
}

const ROUTE_TABLE: Record<string, { mode: "rpa_vm" | "backend"; timeout: number }> = {
  wechat_mp: { mode: "rpa_vm", timeout: 120000 },
  zhihu: { mode: "rpa_vm", timeout: 120000 },
  weibo: { mode: "rpa_vm", timeout: 120000 },
  douyin: { mode: "rpa_vm", timeout: 300000 },
  xiaohongshu: { mode: "rpa_vm", timeout: 120000 },
  tencent_video: { mode: "rpa_vm", timeout: 300000 },
  kuaishou: { mode: "rpa_vm", timeout: 300000 },
  toutiao: { mode: "rpa_vm", timeout: 120000 },
  bilibili: { mode: "rpa_vm", timeout: 300000 },
  baijiahao: { mode: "rpa_vm", timeout: 120000 },
  youtube: { mode: "rpa_vm", timeout: 300000 },
  tiktok: { mode: "rpa_vm", timeout: 300000 },
  twitter: { mode: "rpa_vm", timeout: 120000 },
  instagram: { mode: "rpa_vm", timeout: 120000 },
  facebook: { mode: "rpa_vm", timeout: 120000 },
};

class RpaVmPublisher {
  private route: RouteConfig;
  private rpaViewManager: any;
  private store: any;

  constructor(route: RouteConfig, deps: Deps) {
    this.route = route;
    this.rpaViewManager = deps.rpaViewManager;
    this.store = deps.store;
  }

  async publish(task: Task): Promise<{ success: boolean; url: string; postId: string; platform: string }> {
    const platform = this.route.platform || "";
    const accountId = task.article?.accountId || task.accountId;
    let authData: any = { cookies: [] };

    if (accountId) {
      const account = this.store.getAccount(accountId);
      if (account?.cookies?.length > 0) authData = { cookies: account.cookies, localStorage: account.local_storage };
    } else {
      const defaultAccount = this.store.getDefaultAccount(platform);
      if (defaultAccount?.cookies) authData = { cookies: defaultAccount.cookies, localStorage: defaultAccount.local_storage };
    }

    const article = {
      title: task.article?.title || "",
      content: task.article?.content || "",
      video_path: task.article?.video_path || (task.article?.media_paths?.[0] ?? null),
      cover_path: task.article?.cover_url || task.article?.cover_path || null,
      tags: task.article?.tags || [],
      draft: task.article?.draft || false,
    };

    const result = await this.rpaViewManager.publish(platform, article, authData, this.route.timeout);
    if (result.success) return { success: true, url: result.url || "", postId: task.id || "", platform };
    throw new Error(result.error || "RPA \u53D1\u5E03\u5931\u8D25");
  }
}

class BackendPublisher {
  private route: RouteConfig;
  private pythonBridge: any;

  constructor(route: RouteConfig, deps: Deps) {
    this.route = route;
    this.pythonBridge = deps.pythonBridge;
  }

  async publish(task: Task): Promise<{ success: boolean; url: string; postId: string; platform: string }> {
    const platform = this.route.platform || "";
    const body = {
      title: task.article?.title || "",
      content: task.article?.content || "", platform,
      media_paths: task.article?.video_path ? [task.article.video_path] : (task.article?.media_paths || []),
      cover_path: task.article?.cover_url || task.article?.cover_path || null,
      tags: task.article?.tags || [],
      draft: task.article?.draft || false,
    };

    const result = await this.pythonBridge.requestBackend("POST", "/api/publish", body);
    if (result.code === 0 && result.data?.success) return { success: true, url: result.data.url || "", postId: result.data.task_id || task.id || "", platform };
    throw new Error(result.message || (result.data?.error || "\u53D1\u5E03\u5931\u8D25"));
  }
}

export class PublisherRouter {
  private _platformConfig: any;
  private _routeTable = ROUTE_TABLE;

  constructor(configPath?: string) {
    const resolvedPath = configPath || path.join(__dirname, "..", "..", "..", "..", "config", "platforms.yaml");
    const { default: PlatformConfig } = require("@multi-publish/shared-utils/src/platform-config");
    this._platformConfig = new PlatformConfig(resolvedPath);
  }

  getRoute(platform: string): RouteConfig & { type: string; publishUrl: string } {
    const cfg: PlatformConfig = this._platformConfig.getPlatform(platform);
    if (!cfg) throw new Error(`\u5E73\u53F0\u672A\u914D\u7F6E: ${platform}`);
    const route = this._routeTable[platform];
    if (!route) throw new Error(`\u5E73\u53F0 ${platform} \u65E0\u8DEF\u7531\u5B9A\u4E49`);
    return { platform, mode: route.mode, timeout: route.timeout, type: cfg.type || "article", publishUrl: cfg.publish_url || "" };
  }

  getPlatformConfig(platform: string): PlatformConfig { return this._platformConfig.getPlatform(platform); }
  listPlatforms(): any { return this._platformConfig.listPlatforms(); }

  createPublisher(platform: string, deps: Deps): RpaVmPublisher | BackendPublisher {
    const route = this.getRoute(platform);
    switch (route.mode) {
      case "rpa_vm": return new RpaVmPublisher(route, deps);
      case "backend": return new BackendPublisher(route, deps);
      default: throw new Error(`\u672A\u77E5\u53D1\u5E03\u6A21\u5F0F: ${route.mode}`);
    }
  }

  getRouteTable(): Record<string, { mode: string; timeout: number }> { return { ...this._routeTable }; }
}

export { ROUTE_TABLE };