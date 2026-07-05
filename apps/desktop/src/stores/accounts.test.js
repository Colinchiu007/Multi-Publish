import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/api/publisher", () => ({
  listAccounts: vi.fn(),
}));

import { useAccountStore } from "./accounts.js";
import { listAccounts } from "@/api/publisher";

describe("useAccountStore", () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); delete window.electronAPI; });

  it("initial state is empty", () => {
    const s = useAccountStore();
    expect(s.accounts).toEqual([]); expect(s.loading).toBe(false);
    expect(s.error).toBeNull(); expect(s.byPlatform).toEqual({});
  });

  it("load() sets accounts from listAccounts response.code===0", async () => {
    var mockData = [{ id: "a1", platform: "wechat_mp", name: "Acc1" }];
    listAccounts.mockResolvedValue({ code: 0, data: mockData });
    const s = useAccountStore(); await s.load();
    expect(s.accounts).toEqual(mockData); expect(s.loading).toBe(false);
  });

  it("load() handles array response directly", async () => {
    var mockData = [{ id: "a2", platform: "zhihu" }];
    listAccounts.mockResolvedValue(mockData);
    const s = useAccountStore(); await s.load();
    expect(s.accounts).toEqual(mockData);
  });

  it("load() handles error gracefully", async () => {
    listAccounts.mockRejectedValue(new Error("network"));
    const s = useAccountStore(); await s.load();
    expect(s.accounts).toEqual([]); expect(s.error).toBe("network");
  });

  it("byPlatform groups accounts by platform", () => {
    const s = useAccountStore();
    s.accounts = [{ id: "a1", platform: "wx" }, { id: "a2", platform: "zh" }, { id: "a3", platform: "wx" } ];
    expect(Object.keys(s.byPlatform)).toEqual(["wx", "zh"]);
    expect(s.byPlatform.wx.length).toBe(2);
  });

  it("getDefault returns default account", () => {
    const s = useAccountStore();
    s.accounts = [{ id: "a1", platform: "wx", is_default: false }, { id: "a2", platform: "wx", is_default: true } ];
    expect(s.getDefault("wx").id).toBe("a2");
  });

  it("getDefault returns first when no default", () => {
    const s = useAccountStore();
    s.accounts = [{ id: "a1", platform: "wx", is_default: false }];
    expect(s.getDefault("wx").id).toBe("a1");
  });

  it("getDefault returns null for no accounts", () => {
    const s = useAccountStore(); expect(s.getDefault("wx")).toBeNull();
  });
});

