/**
 * platform-selectors-cross-platform.test.js
 * V1.1: Cross-platform selector consistency checks
 * Runs independently from platform-selectors.test.js
 */
const selectors = require("../src/platform-selectors");
const EXPECTED = [
  "wechat_mp","zhihu","weibo","douyin","xiaohongshu",
  "tencent_video","kuaishou","toutiao","youtube","tiktok",
  "bilibili","baijiahao","twitter","instagram","facebook",
];
const VIDEO = ["douyin","tencent_video","kuaishou","youtube","tiktok","facebook"];
const ARTICLE = ["wechat_mp","zhihu","weibo","xiaohongshu","toutiao","baijiahao"];
const SOCIAL = ["twitter","instagram"];

describe("V1.1 Platform Verification - Cross-platform Consistency", () => {
  // All platforms must appear in every config
  test.each(EXPECTED)("%s has all configs", (p) => {
    expect(selectors.PLATFORM_LOGIN_URLS[p]).toContain("https://");
    expect(selectors.PLATFORM_LOGIN_SUCCESS_SELECTORS[p]).toBeDefined();
    expect(selectors.PLATFORM_PUBLISH_SELECTORS[p]).toBeDefined();
    expect(selectors.PLATFORM_NAMES[p]).toBeDefined();
  });

  // Video platforms (except bilibili API) must have file_input
  for (const p of VIDEO) {
    test(p + " (video) has file_input", () => {
      expect(selectors.PLATFORM_PUBLISH_SELECTORS[p].file_input).toBeDefined();
      expect(selectors.PLATFORM_PUBLISH_SELECTORS[p].file_input.length).toBeGreaterThan(0);
    });
  }

  // All platforms must have publish_btn
  for (const p of EXPECTED) {
    test(p + " has publish_btn", () => {
      expect(selectors.PLATFORM_PUBLISH_SELECTORS[p].publish_btn).toBeDefined();
      expect(selectors.PLATFORM_PUBLISH_SELECTORS[p].publish_btn.length).toBeGreaterThan(0);
    });
  }

  // No empty selector arrays
  for (const p of EXPECTED) {
    test(p + " no empty arrays", () => {
      for (const [, v] of Object.entries(selectors.PLATFORM_PUBLISH_SELECTORS[p])) {
        expect(Array.isArray(v)).toBe(true);
        expect(v.length).toBeGreaterThan(0);
      }
    });
  }

  // All selectors are strings
  test("all selectors are non-empty strings", () => {
    for (const [, f] of Object.entries(selectors.PLATFORM_PUBLISH_SELECTORS)) {
      for (const [, sels] of Object.entries(f)) {
        for (const s of sels) {
          expect(typeof s).toBe("string");
          expect(s.length).toBeGreaterThan(0);
        }
      }
    }
  });

  // Login URLs are valid
  test.each(EXPECTED)("%s has valid login URL", (p) => {
    expect(selectors.PLATFORM_LOGIN_URLS[p]).toMatch(/^https:\/\//);
  });

  // Login success selectors - bilibili is API mode
  test("bilibili login selectors empty (API mode)", () => {
    expect(selectors.PLATFORM_LOGIN_SUCCESS_SELECTORS.bilibili).toEqual([]);
  });
  for (const p of EXPECTED.filter((x) => x !== "bilibili")) {
    test(p + " has non-empty login success selectors", () => {
      expect(selectors.PLATFORM_LOGIN_SUCCESS_SELECTORS[p].length).toBeGreaterThan(0);
    });
  }
});
