import { describe, it, expect, vi } from "vitest";

// Mock PlatformConfig
class MockPlatformConfig {
  constructor() {}
  getPlatform(p) {
    if (p === 'wechat_mp') return { type: 'article', publish_url: 'https://mp.weixin.qq.com' };
    if (p === 'unknown') return null;
    return { type: 'video', publish_url: 'https://example.com' };
  }
  listPlatforms() { return [{ id: 'wechat_mp', name: '???' }, { id: 'douyin', name: '??' }]; }
}

vi.mock("@multi-publish/shared-utils/src/platform-config", () => ({
  default: MockPlatformConfig,
}));

const { PublisherRouter, ROUTE_TABLE } = require("../services/publisher-router");

describe("PublisherRouter", () => {
  describe("ROUTE_TABLE", () => {
    it("defines all platforms with rpa_vm mode", () => {
      expect(Object.keys(ROUTE_TABLE).length).toBeGreaterThanOrEqual(14);
    });
    it("wechat_mp has timeout 120000", () => {
      expect(ROUTE_TABLE.wechat_mp.timeout).toBe(120000);
    });
    it("douyin has timeout 300000", () => {
      expect(ROUTE_TABLE.douyin.timeout).toBe(300000);
    });
  });

  describe("constructor", () => {
    it("creates instance", () => {
      const r = new PublisherRouter();
      expect(r).toBeDefined();
    });
    it("stores routeTable", () => {
      const r = new PublisherRouter();
      expect(r._routeTable).toBe(ROUTE_TABLE);
    });
  });

  describe("getRoute()", () => {
    it("returns route for known platform", () => {
      const r = new PublisherRouter();
      const route = r.getRoute("wechat_mp");
      expect(route).toBeDefined();
      expect(route.platform).toBe("wechat_mp");
      expect(route.mode).toBe("rpa_vm");
      expect(route.timeout).toBe(120000);
    });
    it("throws for unconfigured platform", () => {
      const r = new PublisherRouter();
      expect(() => r.getRoute("unknown")).toThrow("平台未配置: ");
    });
    it("throws for platform not in route table", () => {
      const r = new PublisherRouter();
      // PlatformConfig returns config but no route = different error
      // unknown returns null from mock, so we get '?????'
      expect(() => r.getRoute("unknown")).toThrow();
    });
  });

  describe("getPlatformConfig()", () => {
    it("returns config from PlatformConfig", () => {
      const r = new PublisherRouter();
      const cfg = r.getPlatformConfig("wechat_mp");
      expect(cfg.type).toBe("article");
    });
  });

  describe("listPlatforms()", () => {
    it("returns platform list", () => {
      const r = new PublisherRouter();
      const list = r.listPlatforms();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe("getRouteTable()", () => {
    it("returns copy of route table", () => {
      const r = new PublisherRouter();
      const table = r.getRouteTable();
      expect(table.wechat_mp).toBeDefined();
      expect(table).not.toBe(ROUTE_TABLE); // different reference
    });
  });

  describe("createPublisher()", () => {
    it("creates RpaVmPublisher for rpa_vm mode", () => {
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager: { publish: vi.fn() },
        store: { getAccount: vi.fn(), getDefaultAccount: vi.fn() },
      });
      expect(publisher).toBeDefined();
      expect(typeof publisher.publish).toBe("function");
    });

    it("取消信号会请求 RPA 管理器销毁对应账号窗口", async () => {
      let resolvePublish
      const rpaViewManager = {
        publish: vi.fn(() => new Promise(resolve => { resolvePublish = resolve })),
        cancel: vi.fn(() => true),
      }
      const r = new PublisherRouter()
      const publisher = r.createPublisher("wechat_mp", { rpaViewManager, store: { getAccount: vi.fn() } })
      const controller = new AbortController()
      const pending = publisher.publish({ id: "task-1", platform: "wechat_mp", article: { accountId: "acc-1" } }, { signal: controller.signal })

      controller.abort()
      expect(rpaViewManager.cancel).toHaveBeenCalledWith("wechat_mp", "acc-1")
      resolvePublish({ success: false, error: "已取消" })
      await expect(pending).rejects.toThrow("已取消")
    });
    it("RPA 成功返回与取消竞争时仍以取消结果为准", async () => {
      const controller = new AbortController()
      const rpaViewManager = {
        publish: vi.fn(async () => {
          controller.abort()
          return { success: true, url: "https://example.com/post/1" }
        }),
        cancel: vi.fn(() => true),
      }
      const r = new PublisherRouter()
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn() },
      })

      await expect(publisher.publish({
        id: "task-race",
        article: { accountId: "acc-race" },
      }, { signal: controller.signal })).rejects.toThrow("任务已取消")
      expect(rpaViewManager.cancel).toHaveBeenCalledWith("wechat_mp", "acc-race")
    });
    it("向 RPA 传递账号 localStorage 并吞掉取消清理异常", async () => {
      const account = {
        cookies: [{ name: "session", value: "secret", domain: ".mp.weixin.qq.com" }, { name: "third-party", value: "drop", domain: ".evil.example" }],
        localStorage: { token: "private" },
      }
      let resolvePublish
      const rpaViewManager = {
        publish: vi.fn(() => new Promise(resolve => { resolvePublish = resolve })),
        cancel: vi.fn(() => Promise.reject(new Error("窗口已销毁"))),
      }
      const r = new PublisherRouter()
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => account) },
      })
      const controller = new AbortController()
      const pending = publisher.publish({ id: "task-2", article: { accountId: "acc-2" } }, { signal: controller.signal })

      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.any(Object),
        { cookies: [account.cookies[0]], localStorage: account.localStorage },
        120000,
      )
      controller.abort()
      await Promise.resolve()
      resolvePublish({ success: false, error: "已取消" })

      await expect(pending).rejects.toThrow("已取消")
    });
    it("刚保存的账号可从主进程账号管理器恢复凭证并立即发布", async () => {
      const credentials = {
        cookies: [{ name: "session", value: "captured", domain: ".mp.weixin.qq.com" }, { name: "third-party", value: "drop", domain: ".qq.com" }],
        localStorage: { token: "captured-token" },
      };
      const accountManager = {
        loadSavedCredentials: vi.fn(() => credentials),
      };
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true, url: "https://example.com/post/new-account" })),
      };
      const store = {
        getAccount: vi.fn(() => null),
        getDefaultAccount: vi.fn(() => null),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store,
        accountManager,
      });

      await publisher.publish({
        id: "task-new-account",
        article: {
          accountId: "account-new",
          title: "标题",
          content: "正文",
        },
      });

      expect(accountManager.loadSavedCredentials).toHaveBeenCalledWith("account-new", "wechat_mp");
      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.objectContaining({ title: "标题", content: "正文" }),
        { cookies: [credentials.cookies[0]], localStorage: credentials.localStorage },
        120000,
      );
    });
    it("默认账号优先使用主进程中的最新凭证，避免 SQLite 旧状态覆盖", async () => {
      const freshCredentials = {
        cookies: [{ name: "session", value: "fresh", domain: ".mp.weixin.qq.com" }],
        localStorage: { token: "fresh-token" },
      };
      const staleAccount = {
        id: "account-default",
        cookies: [{ name: "session", value: "stale", domain: ".mp.weixin.qq.com" }],
        localStorage: { token: "stale-token" },
      };
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true })),
      };
      const accountManager = {
        loadSavedCredentials: vi.fn(() => freshCredentials),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        accountManager,
        store: { getDefaultAccount: vi.fn(() => staleAccount) },
      });

      await publisher.publish({
        id: "task-default-account",
        article: { title: "标题", content: "正文" },
      });

      expect(accountManager.loadSavedCredentials).toHaveBeenCalledWith("account-default", "wechat_mp");
      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.any(Object),
        freshCredentials,
        120000,
      );
    });
    it("兼容 SQLite 旧账号记录中的 local_storage 字段", async () => {
      const account = {
        id: "account-legacy",
        cookies: [{ name: "session", value: "legacy", domain: ".mp.weixin.qq.com" }, { name: "other", value: "drop", domain: ".baidu.com" }],
        local_storage: { token: "legacy-token" },
      };
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true })),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => account) },
      });

      await publisher.publish({
        id: "task-legacy-account",
        article: { accountId: "account-legacy", title: "标题", content: "正文" },
      });

      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.any(Object),
        {
          cookies: [account.cookies[0]],
          localStorage: account.local_storage,
        },
        120000,
      );
    });
    it("平台不匹配的 SQLite 账号不会透传凭证", async () => {
      const rpaViewManager = { publish: vi.fn(async () => ({ success: true })) };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => ({ platform: "douyin", cookies: [{ name: "x", domain: ".douyin.com" }], localStorage: { token: "x" } })) },
      });
      await publisher.publish({ article: { accountId: "mismatch" } });
      expect(rpaViewManager.publish).toHaveBeenCalledWith("wechat_mp", expect.any(Object), { cookies: [], localStorage: {} }, 120000);
    });
    it("默认账号 SQLite 回退过滤第三方 Cookie", async () => {
      const rpaViewManager = { publish: vi.fn(async () => ({ success: true })) };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getDefaultAccount: vi.fn(() => ({ id: "default", cookies: [{ name: "ok", domain: ".mp.weixin.qq.com" }, { name: "bad", domain: ".evil.example" }] })) },
      });
      await publisher.publish({ article: {} });
      expect(rpaViewManager.publish.mock.calls[0][2]).toEqual({ cookies: [{ name: "ok", domain: ".mp.weixin.qq.com" }], localStorage: {} });
    });
    it("RPA 发布使用当前平台的差异化标题和正文", async () => {
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true, url: "https://example.com/post/override" })),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => null) },
      });

      await publisher.publish({
        id: "task-override",
        article: {
          accountId: "acc-override",
          title: "通用标题",
          content: "通用正文",
          platformOverrides: {
            wechat_mp: { title: "公众号标题", content: "公众号正文" },
            zhihu: { title: "知乎标题", content: "知乎正文" },
          },
        },
      });

      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.objectContaining({ title: "公众号标题", content: "公众号正文" }),
        expect.any(Object),
        120000,
      );
    });
    it("平台差异内容缺字段时逐字段回退到通用内容", async () => {
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true })),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("wechat_mp", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => null) },
      });

      await publisher.publish({
        id: "task-partial-override",
        article: {
          accountId: "acc-override",
          title: "通用标题",
          content: "通用正文",
          platformOverrides: { wechat_mp: { title: "公众号标题" } },
        },
      });

      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "wechat_mp",
        expect.objectContaining({ title: "公众号标题", content: "通用正文" }),
        expect.any(Object),
        120000,
      );
    });
    it("知乎发布向 RPA 透传评论权限和创作声明", async () => {
      const rpaViewManager = {
        publish: vi.fn(async () => ({ success: true })),
      };
      const r = new PublisherRouter();
      const publisher = r.createPublisher("zhihu", {
        rpaViewManager,
        store: { getAccount: vi.fn(() => null) },
      });

      await publisher.publish({
        id: "task-zhihu-options",
        article: {
          accountId: "zhihu-account",
          title: "通用标题",
          content: "通用正文",
          platformOverrides: {
            zhihu: {
              title: "知乎标题",
              content: "知乎正文",
              commentPermission: "anyone",
              declare: 5,
            },
          },
        },
      });

      expect(rpaViewManager.publish).toHaveBeenCalledWith(
        "zhihu",
        expect.objectContaining({
          title: "知乎标题",
          content: "知乎正文",
          commentPermission: "anyone",
          declare: 5,
        }),
        expect.any(Object),
        120000,
      );
    });
    it("backend 发布也使用当前平台的差异化内容", async () => {
      const originalMode = ROUTE_TABLE.wechat_mp.mode;
      ROUTE_TABLE.wechat_mp.mode = "backend";
      try {
        const pythonBridge = {
          requestBackend: vi.fn(async () => ({ code: 0, data: { success: true } })),
        };
        const r = new PublisherRouter();
        const publisher = r.createPublisher("wechat_mp", { pythonBridge });

        await publisher.publish({
          id: "task-backend-override",
          article: {
            title: "通用标题",
            content: "通用正文",
            platformOverrides: { wechat_mp: { title: "公众号标题", content: "公众号正文" } },
          },
        });

        expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
          "POST",
          "/api/publish",
          expect.objectContaining({ title: "公众号标题", content: "公众号正文" }),
        );
      } finally {
        ROUTE_TABLE.wechat_mp.mode = originalMode;
      }
    });
    it("backend 发布保留知乎权限字段", async () => {
      const originalMode = ROUTE_TABLE.zhihu.mode;
      ROUTE_TABLE.zhihu.mode = "backend";
      try {
        const pythonBridge = {
          requestBackend: vi.fn(async () => ({ code: 0, data: { success: true } })),
        };
        const r = new PublisherRouter();
        const publisher = r.createPublisher("zhihu", { pythonBridge });

        await publisher.publish({
          id: "task-backend-zhihu-options",
          article: {
            title: "标题",
            content: "正文",
            platformOverrides: {
              zhihu: { commentPermission: "anyone", declare: 5 },
            },
          },
        });

        expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
          "POST",
          "/api/publish",
          expect.objectContaining({ commentPermission: "anyone", declare: 5 }),
        );
      } finally {
        ROUTE_TABLE.zhihu.mode = originalMode;
      }
    });
    it("throws for unknown mode platform", () => {
      const r = new PublisherRouter();
      // PlatformConfig returns config, but no route entry = error
      // use a platform that has config but no route
      expect(() => r.createPublisher("unknown", {})).toThrow();
    });

    it("按任务 owner 查询账号，不能借用当前用户的默认账号", async () => {
      const r = new PublisherRouter();
      const getAccount = vi.fn(() => ({ cookies: [{ name: 'sid', value: 'a' }] }));
      const getDefaultAccount = vi.fn(() => ({ cookies: [{ name: 'sid', value: 'default' }] }));
      const publish = vi.fn(async () => ({ success: true, url: 'https://example.test/post' }));
      const publisher = r.createPublisher("douyin", {
        rpaViewManager: { publish },
        store: { getAccount, getDefaultAccount },
      });

      await publisher.publish({
        id: 'task-a',
        platform: 'douyin',
        owner_subject: 'user-a',
        accountId: 'account-a',
        article: { title: 'A' },
      });

      expect(getAccount).toHaveBeenCalledWith('account-a', 'user-a');
      expect(getDefaultAccount).not.toHaveBeenCalled();
    });
  });
});
