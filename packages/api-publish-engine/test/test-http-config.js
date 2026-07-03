// TDD: HTTP Platform Config tests
const assert = require("assert");
const { getPlatformConfig, PLATFORM_CONFIG } = require("../upload/providers/http-config");
const HttpProvider = require("../upload/providers/http-provider");

let pass = 0;
const total = Object.keys(PLATFORM_CONFIG).length;

// Test 1: All 24 platforms have configs
try {
  const count = Object.keys(PLATFORM_CONFIG).length;
  assert(count === 24, "Expected 24 HTTP platforms, got " + count);
  console.log("  [PASS] All 24 HTTP platforms configured");
  pass++;
} catch(e) { console.log("  [FAIL] " + e.message); }

// Test 2: Each config has required fields
for (const [platform, cfg] of Object.entries(PLATFORM_CONFIG)) {
  try {
    assert(cfg.apiDomain, platform + " missing apiDomain");
    assert(cfg.uploadPath, platform + " missing uploadPath");
    assert(cfg.referer, platform + " missing referer");
    assert(cfg.uploadType, platform + " missing uploadType");
    pass++;
    if (pass % 4 === 0) console.log("  [PASS] " + platform + " config valid");
  } catch(e) { console.log("  [FAIL] " + platform + ": " + e.message); }
}

// Test 3: getPlatformConfig returns null for unknown
try {
  assert(getPlatformConfig("unknown") === null);
  console.log("  [PASS] getPlatformConfig returns null for unknown");
  pass++;
} catch(e) { console.log("  [FAIL] getPlatformConfig unknown: " + e.message); }

// Test 4: HTTP provider _getUploadUrl returns correct URL
try {
  const prov = new HttpProvider();
  const url = prov._getUploadUrl("douyin");
  assert(url === "https://creator.douyin.com/web/api/media/aweme/upload/", "douyin URL mismatch: " + url);
  console.log("  [PASS] HTTP provider resolves upload URL");
  pass++;
} catch(e) { console.log("  [FAIL] " + e.message); }

// Test 5: HTTP provider graceful handling without file
(async () => {
  try {
    const prov = new HttpProvider();
    const r = await prov.uploadVideo({ platform: "douyin" }, "");
    assert(r === null, "should return null without file");
    console.log("  [PASS] HTTP provider graceful without file");
    pass++;
  } catch(e) { console.log("  [FAIL] " + e.message); }
})();

setTimeout(() => {
  console.log("\n" + (pass === total + 4 ? "All" : pass + "/" + (total + 4)) + " HTTP config tests " + (pass === total + 4 ? "PASSED" : "FAILED"));
}, 200);
