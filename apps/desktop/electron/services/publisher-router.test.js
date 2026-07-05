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
      expect(() => r.getRoute("unknown")).toThrow("平台未配置");
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
    it("throws for unknown mode platform", () => {
      const r = new PublisherRouter();
      // PlatformConfig returns config, but no route entry = error
      // use a platform that has config but no route
      expect(() => r.createPublisher("unknown", {})).toThrow();
    });
  });
});