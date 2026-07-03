/**
 * Adapter interface batch test
 * Tests that all platform adapters constructed, exported, and respond to execute()
 */

const acfunAdapter = require("../src/adapters/acfun");
const aiqiyiAdapter = require("../src/adapters/aiqiyi");
const baijiahaoAdapter = require("../src/adapters/baijiahao");
const bilibiliAdapter = require("../src/adapters/bilibili");
const chejiahaoAdapter = require("../src/adapters/chejiahao");
const dayuAdapter = require("../src/adapters/dayu");
const dewuAdapter = require("../src/adapters/dewu");
const douyinAdapter = require("../src/adapters/douyin");
const duoduoAdapter = require("../src/adapters/duoduo");
const kuaishouAdapter = require("../src/adapters/kuaishou");
const meipaiAdapter = require("../src/adapters/meipai");
const meiyouAdapter = require("../src/adapters/meiyou");
const pipixiaAdapter = require("../src/adapters/pipixia");
const qiehaoAdapter = require("../src/adapters/qiehao");
const shipinhaoAdapter = require("../src/adapters/shipinhao");
const souhuAdapter = require("../src/adapters/souhu");
const souhu_shipinAdapter = require("../src/adapters/souhu_shipin");
const tengxun_shipinAdapter = require("../src/adapters/tengxun_shipin");
const toutiaoAdapter = require("../src/adapters/toutiao");
const wangyiAdapter = require("../src/adapters/wangyi");
const wechat_mpAdapter = require("../src/adapters/wechat_mp");
const weiboAdapter = require("../src/adapters/weibo");
const weishiAdapter = require("../src/adapters/weishi");
const xhs_shangjiaAdapter = require("../src/adapters/xhs_shangjia");
const xiaohongshuAdapter = require("../src/adapters/xiaohongshu");
const xiguaAdapter = require("../src/adapters/xigua");
const yichehaoAdapter = require("../src/adapters/yichehao");
const yidianhaoAdapter = require("../src/adapters/yidianhao");
const zhihuAdapter = require("../src/adapters/zhihu");

describe("Platform Adapters", function() {
  var adapters = [];

  beforeAll(function() {
    adapters.push({ name: "acfun", instance: new acfunAdapter() });
    adapters.push({ name: "aiqiyi", instance: new aiqiyiAdapter() });
    adapters.push({ name: "baijiahao", instance: new baijiahaoAdapter() });
    adapters.push({ name: "bilibili", instance: new bilibiliAdapter() });
    adapters.push({ name: "chejiahao", instance: new chejiahaoAdapter() });
    adapters.push({ name: "dayu", instance: new dayuAdapter() });
    adapters.push({ name: "dewu", instance: new dewuAdapter() });
    adapters.push({ name: "douyin", instance: new douyinAdapter() });
    adapters.push({ name: "duoduo", instance: new duoduoAdapter() });
    adapters.push({ name: "kuaishou", instance: new kuaishouAdapter() });
    adapters.push({ name: "meipai", instance: new meipaiAdapter() });
    adapters.push({ name: "meiyou", instance: new meiyouAdapter() });
    adapters.push({ name: "pipixia", instance: new pipixiaAdapter() });
    adapters.push({ name: "qiehao", instance: new qiehaoAdapter() });
    adapters.push({ name: "shipinhao", instance: new shipinhaoAdapter() });
    adapters.push({ name: "souhu", instance: new souhuAdapter() });
    adapters.push({ name: "souhu_shipin", instance: new souhu_shipinAdapter() });
    adapters.push({ name: "tengxun_shipin", instance: new tengxun_shipinAdapter() });
    adapters.push({ name: "toutiao", instance: new toutiaoAdapter() });
    adapters.push({ name: "wangyi", instance: new wangyiAdapter() });
    adapters.push({ name: "wechat_mp", instance: new wechat_mpAdapter() });
    adapters.push({ name: "weibo", instance: new weiboAdapter() });
    adapters.push({ name: "weishi", instance: new weishiAdapter() });
    adapters.push({ name: "xhs_shangjia", instance: new xhs_shangjiaAdapter() });
    adapters.push({ name: "xiaohongshu", instance: new xiaohongshuAdapter() });
    adapters.push({ name: "xigua", instance: new xiguaAdapter() });
    adapters.push({ name: "yichehao", instance: new yichehaoAdapter() });
    adapters.push({ name: "yidianhao", instance: new yidianhaoAdapter() });
    adapters.push({ name: "zhihu", instance: new zhihuAdapter() });
  });

  test("all 29 adapters construct without error", function() {
    expect(adapters.length).toBe(29);
    adapters.forEach(function(a) {
      expect(a.instance).toBeDefined();
    });
  });

  test("execute returns error object (not throw) for invalid input", async function() {
    var results = [];
    results.push(await adapters.find(function(a) { return a.name === "acfun"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "aiqiyi"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "baijiahao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "bilibili"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "chejiahao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "dayu"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "dewu"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "douyin"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "duoduo"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "kuaishou"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "meipai"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "meiyou"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "pipixia"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "qiehao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "shipinhao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "souhu"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "souhu_shipin"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "tengxun_shipin"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "toutiao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "wangyi"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "wechat_mp"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "weibo"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "weishi"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "xhs_shangjia"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "xiaohongshu"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "xigua"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "yichehao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "yidianhao"; }).instance.execute(null, null, { dryRun: true }));
    results.push(await adapters.find(function(a) { return a.name === "zhihu"; }).instance.execute(null, null, { dryRun: true }));
    results.forEach(function(r, i) {
      expect(r).not.toBeUndefined();
    });
  });

});