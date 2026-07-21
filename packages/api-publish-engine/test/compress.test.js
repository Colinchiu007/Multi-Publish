const assert = require("assert");
const http = require("http");
const test = require("node:test");
const zlib = require("zlib");

const { PublishApiServer } = require("../src/publish-api-server");

function request(port, method, path, headers) {
  return new Promise(function(resolve, reject) {
    var opts = { hostname: "127.0.0.1", port: port, path: path, method: method, headers: headers || {} };
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function parseJson(response) {
  var raw = response.headers["content-encoding"] === "gzip"
    ? zlib.gunzipSync(response.raw)
    : response.raw;
  return JSON.parse(raw.toString("utf8"));
}

async function withServer(run) {
  var server = new PublishApiServer({ dryRun: true });
  var port = await server.start(0);
  try {
    await run(port);
  } finally {
    await server.stop();
  }
}

test("不支持的 deflate 编码保持未压缩", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/openapi.json", { "Accept-Encoding": "deflate" });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.match(response.headers.vary, /Accept-Encoding/i);
    assert.strictEqual(Number(response.headers["content-length"]), response.raw.length);
  });
});

test("客户端接受 gzip 时压缩大响应", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/openapi.json", { "Accept-Encoding": "gzip" });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["content-encoding"], "gzip");
    assert.match(response.headers.vary, /Accept-Encoding/i);
    assert.strictEqual(Number(response.headers["content-length"]), response.raw.length);
    assert.strictEqual(parseJson(response).openapi, "3.0.3");
  });
});

test("平台列表路由的小响应保持未压缩且可解析", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/platforms", { "Accept-Encoding": "gzip" });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.strictEqual(Array.isArray(parseJson(response).platforms), true);
  });
});

test("未发送 Accept-Encoding 时返回未压缩 JSON", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/openapi.json");
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.strictEqual(Number(response.headers["content-length"]), response.raw.length);
    assert.strictEqual(parseJson(response).openapi, "3.0.3");
  });
});

test("gzip;q=0 明确拒绝压缩", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/openapi.json", { "Accept-Encoding": "gzip;q=0, *;q=1" });
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.strictEqual(parseJson(response).openapi, "3.0.3");
  });
});

test("小于阈值的健康检查不压缩", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/health", { "Accept-Encoding": "gzip" });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.strictEqual(parseJson(response).status, "ok");
  });
});

test("发布参数错误保持可解析且小响应不压缩", async function() {
  await withServer(async function(port) {
    var response = await request(port, "POST", "/api/v1/publish", {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip",
    });
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.headers["content-encoding"], undefined);
    assert.strictEqual(parseJson(response).error, "platform is required");
  });
});

test("超过阈值的错误响应同样支持 gzip", async function() {
  await withServer(async function(port) {
    var response = await request(port, "GET", "/api/v1/" + "missing-".repeat(60), { "Accept-Encoding": "gzip" });
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.headers["content-encoding"], "gzip");
    assert.strictEqual(parseJson(response).error, "Not found");
  });
});
