const assert = require("assert");
const test = require("node:test");

const CosProvider = require("../upload/providers/cos-provider");
const OssProvider = require("../upload/providers/oss-provider");
const HttpProvider = require("../upload/providers/http-provider");
const orchestrator = require("../upload/orchestrator");
const { getAdapter } = require("../src/index");

test("上传 Provider 可以构造", function() {
  var cos = new CosProvider();
  var oss = new OssProvider();
  var http = new HttpProvider();
  assert.strictEqual(typeof cos.uploadVideo, "function");
  assert.strictEqual(cos.type, "cos");
  assert.strictEqual(typeof oss.uploadVideo, "function");
  assert.strictEqual(oss.type, "oss");
  assert.strictEqual(typeof http.uploadVideo, "function");
  assert.strictEqual(http.type, "http");
});

Object.entries(orchestrator.platformMap).forEach(function(entry) {
  var platform = entry[0];
  var expectedProvider = entry[1];
  test("上传路由选择正确：" + platform, function() {
    var provider = orchestrator.getUploadProvider(platform);
    assert(provider);
    assert.strictEqual(provider.type, expectedProvider.type);
  });
});

test("未知平台没有上传 Provider", async function() {
  assert.strictEqual(orchestrator.getUploadProvider("unknown"), null);
  assert.strictEqual(await orchestrator.upload({ platform: "unknown", filePath: "x.mp4" }, ""), null);
});

Object.keys(orchestrator.platformMap).forEach(function(platform) {
  test("统一入口适配器可处理空上传：" + platform, async function() {
    var adapter = getAdapter(platform);
    assert(adapter, "缺少适配器：" + platform);
    assert.strictEqual(await adapter.uploadVideo({}, ""), null);
  });
});
