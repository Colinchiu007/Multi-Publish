/**
 * API Router TDD ? has_api auto-routing + RPA fallback
 */
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

var CONFIG_PATH = path.resolve(__dirname, "..", "..", "..", "config", "platforms.yaml");

describe("API Router", function() {
  var router;
  var platforms;

  beforeAll(function() {
    var raw = fs.readFileSync(CONFIG_PATH, "utf8");
    platforms = yaml.load(raw).platforms;
    router = require("../src/api-router");
  });

  describe("routeDecision", function() {
    test("has_api:true returns api mode", function() {
      Object.keys(platforms).forEach(function(key) {
        if (platforms[key].has_api) {
          expect(router.shouldUseApi(key)).toBe(true);
        }
      });
    });

    test("has_api:false returns rpa mode", function() {
      Object.keys(platforms).forEach(function(key) {
        if (!platforms[key].has_api) {
          expect(router.shouldUseApi(key)).toBe(false);
        }
      });
    });

    test("supportsApi for all API platforms", function() {
      expect(router.supportsApi("youtube")).toBe(true);
      expect(router.supportsApi("tiktok")).toBe(true);
      expect(router.supportsApi("twitter")).toBe(true);
      expect(router.supportsApi("weibo")).toBe(true);
      expect(router.supportsApi("douyin")).toBe(true);
      expect(router.supportsApi("bilibili")).toBe(true);
    });

    test("unknown platform returns false", function() {
      expect(router.shouldUseApi("nonexistent")).toBe(false);
    });
  });

  describe("listApiPlatforms", function() {
    test("returns has_api platforms", function() {
      var apiPlatforms = router.listApiPlatforms();
      expect(apiPlatforms.length).toBeGreaterThanOrEqual(6);
      expect(apiPlatforms).toContain("youtube");
      expect(apiPlatforms).toContain("tiktok");
      expect(apiPlatforms).toContain("twitter");
      expect(apiPlatforms).toContain("weibo");
      expect(apiPlatforms).toContain("douyin");
      expect(apiPlatforms).toContain("bilibili");
    });
  });
});
