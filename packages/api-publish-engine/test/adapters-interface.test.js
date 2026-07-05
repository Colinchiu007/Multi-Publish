/**
 * Adapter interface batch test
 * Tests that all platform adapters construct, export, and respond to execute()
 * Refactored: boilerplate platforms now use GenericPlatformAdapter via createAdapter()
 */

// Custom adapters (still individual classes)
const baijiahaoAdapter = require("../src/adapters/baijiahao");
const douyinAdapter = require("../src/adapters/douyin");
const kuaishouAdapter = require("../src/adapters/kuaishou");
const shipinhaoAdapter = require("../src/adapters/shipinhao");
const wechat_mpAdapter = require("../src/adapters/wechat_mp");
const weiboAdapter = require("../src/adapters/weibo");
const zhihuAdapter = require("../src/adapters/zhihu");

// API-mode adapters (no publish method)
const tiktokAdapter = require("../src/adapters/tiktok");
const twitterAdapter = require("../src/adapters/twitter");
const youtubeAdapter = require("../src/adapters/youtube");

// Generic adapter factory for boilerplate platforms
const { createAdapter } = require("../src/adapters/generic-adapter");
const platformConfigs = require("../src/adapters/platform-configs");

// Build ALL list: custom adapters + generic adapters for boilerplate platforms
var CUSTOM_ADAPTERS = [
  { name: "baijiahao", Ctor: baijiahaoAdapter },
  { name: "douyin", Ctor: douyinAdapter },
  { name: "kuaishou", Ctor: kuaishouAdapter },
  { name: "tencent_video", Ctor: shipinhaoAdapter }, // file: shipinhao.js
  { name: "wechat_mp", Ctor: wechat_mpAdapter },
  { name: "weibo", Ctor: weiboAdapter },
  { name: "zhihu", Ctor: zhihuAdapter },
  { name: "tiktok", Ctor: tiktokAdapter },
  { name: "twitter", Ctor: twitterAdapter },
  { name: "youtube", Ctor: youtubeAdapter },
];

var boilerplatePlatforms = Object.keys(platformConfigs);

// Build the full test list
var ALL = CUSTOM_ADAPTERS.concat(boilerplatePlatforms.map(function(p) {
  return { name: p, factory: true };
}));

describe("Platform Adapters", function() {
  test("all " + ALL.length + " adapters construct without error", function() {
    expect(ALL.length).toBeGreaterThan(20);
    ALL.forEach(function(a) {
      var instance;
      if (a.factory) {
        instance = createAdapter(a.name);
      } else {
        instance = new a.Ctor();
      }
      expect(instance).not.toBeNull();
      expect(instance.name).toBe(a.name);
    });
  });

  test("execute returns result for null input", async function() {
    for (var i = 0; i < ALL.length; i++) {
      var a = ALL[i];
      var instance = a.factory ? createAdapter(a.name) : new a.Ctor();
      var result = await instance.execute(null, null, { dryRun: true });
      expect(result).not.toBeNull();
    }
  });
});
