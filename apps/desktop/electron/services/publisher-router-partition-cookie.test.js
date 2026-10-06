import { describe, it, expect, vi } from "vitest";

// 2026-10-06 E2E 实测回归：百家号发布报「平台 Cookie 缺失（账号 d39af89b 未登录或凭证不可用）」，
// 但该账号在应用里 status=active 且 session 分区里有 23 个 cookie（20KB Cookies 文件）。
//
// 根因：ApiPublisher 走 loadAuthForTask 取凭证，而它只读**加密凭证文件**
// （accountManager.loadSavedCredentials），不回退到账号 session 分区
// （persist:account-<id>）。百家号的 cookie 只存在于分区里（checkLocalCredentials 日志
// 明确写着 "session-cookie ... (fallback from missing encrypted file)"），
// 于是 API 直连轨拿到空 cookies → 抛 auth_missing。
// 同一账号走 RPA 轨却能成功，因为 RPA 轨会用 getAccountPartitionCookies 补 cookie。
//
// 参考产品（蚁小二）做法印证：其百家号发布链是**纯 HTTP**，cookie 由登录态直接注入
// 请求头（publish$a($,S,T,N,P) 的 headers {cookie:$, token:S}），全程不开浏览器 ——
// 所以只要能拿到 cookie 就能发，与浏览器无关。
//
// 修复方向：凭证为空时回退读 session 分区 cookie（account-session-restore 已有
// getAccountPartitionCookies/mergeCookies 现成实现），把「分区是唯一登录态证据来源」
// 这条既有契约补齐到 API 直连轨。

vi.mock("./media-tool-paths", () => ({
  findFfprobe: vi.fn(() => "ffprobe"),
}));

const { loadAuthForTask } = require("../services/publisher-router");

describe("loadAuthForTask：session 分区 cookie 回退（百家号 auth_missing 回归）", () => {
  it("加密凭证为空时回退读取账号 session 分区 cookie", async () => {
    const deps = {
      store: {
        getAccount: vi.fn(() => ({ id: "acc-bjh", platform: "baijiahao" })),
        getDefaultAccount: vi.fn(() => null),
      },
      accountManager: {
        loadSavedCredentials: vi.fn(() => ({ cookies: [], localStorage: {} })),
        getAccountPartitionCookies: vi.fn(async () => ([
          { name: "BAIDUID", value: "from-partition-1", domain: ".baidu.com" },
          { name: "BDUSS", value: "from-partition-2", domain: ".baidu.com" },
        ])),
        isSafePathSegment: vi.fn(() => true),
      },
    };

    const result = await loadAuthForTask(deps, "baijiahao", { accountId: "acc-bjh" }, undefined);

    expect(deps.accountManager.getAccountPartitionCookies).toHaveBeenCalled();
    const names = result.authData.cookies.map((c) => c.name);
    expect(names).toContain("BAIDUID");
    expect(names).toContain("BDUSS");
  });

  it("加密凭证已有 cookie 时不额外读分区（不引入无谓的 session 读取）", async () => {
    const deps = {
      store: {
        getAccount: vi.fn(() => null),
        getDefaultAccount: vi.fn(() => null),
      },
      accountManager: {
        loadSavedCredentials: vi.fn(() => ({
          cookies: [{ name: "BAIDUID", value: "from-encrypted", domain: ".baidu.com" }],
          localStorage: {},
        })),
        getAccountPartitionCookies: vi.fn(async () => ([])),
        isSafePathSegment: vi.fn(() => true),
      },
    };

    const result = await loadAuthForTask(deps, "baijiahao", { accountId: "acc-bjh" }, undefined);

    expect(result.authData.cookies.map((c) => c.name)).toEqual(["BAIDUID"]);
    expect(deps.accountManager.getAccountPartitionCookies).not.toHaveBeenCalled();
  });

  it("加密与分区都无 cookie 时如实返回空（不臆造凭据）", async () => {
    const deps = {
      store: {
        getAccount: vi.fn(() => null),
        getDefaultAccount: vi.fn(() => null),
      },
      accountManager: {
        loadSavedCredentials: vi.fn(() => null),
        getAccountPartitionCookies: vi.fn(async () => ([])),
        isSafePathSegment: vi.fn(() => true),
      },
    };

    const result = await loadAuthForTask(deps, "baijiahao", { accountId: "acc-bjh" }, undefined);

    expect(result.authData.cookies).toEqual([]);
  });
});
