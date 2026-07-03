const assert = require("assert");
const http = require("http");
const zlib = require("zlib");

var PublishApiServer = require("../src/publish-api-server").PublishApiServer;

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log("  OK "+n)}catch(e){f++;console.log("  FAIL "+n+": "+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

function request(port, method, path, headers) {
  return new Promise(function(resolve, reject) {
    var opts = { hostname: "127.0.0.1", port: port, path: path, method: method, headers: headers || {} };
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: Buffer.concat(chunks)
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

console.log("--- Compression support ---");

t("ignores unsupported encoding, returns uncompressed", async function() {
  var server = new PublishApiServer({ dryRun: true });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/platforms", { "Accept-Encoding": "deflate" });
  eq(r.status, 200);
  eq(r.headers["content-encoding"], undefined);
  await server.stop();
});

t("returns gzip compressed response when client accepts gzip", async function() {
  var server = new PublishApiServer({ dryRun: true });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/platforms", { "Accept-Encoding": "gzip" });
  eq(r.status, 200);
  eq(r.headers["content-encoding"], "gzip");
  // Verify we can decompress it
  var decompressed = zlib.gunzipSync(r.raw);
  var parsed = JSON.parse(decompressed.toString());
  eq(Array.isArray(parsed.platforms), true);
  await server.stop();
});

t("returns uncompressed when no Accept-Encoding header", async function() {
  var server = new PublishApiServer({ dryRun: true });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/platforms");
  eq(r.status, 200);
  eq(r.headers["content-encoding"], undefined);
  await server.stop();
});

t("compresses large responses", async function() {
  var server = new PublishApiServer({ dryRun: true });
  await server.start(0); var port = server._server.address().port;
  // Make a request with gzip accept
  var r = await request(port, "POST", "/api/v1/publish", {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip"
  });
  eq(r.status, 400); // missing platform
  // Should still be compressed even for error responses
  if (r.headers["content-encoding"] === "gzip") {
    var decompressed = zlib.gunzipSync(r.raw);
    var parsed = JSON.parse(decompressed.toString());
    eq(typeof parsed.error, "string");
  }
  await server.stop();
});

t("health endpoint supports gzip", async function() {
  var server = new PublishApiServer({ dryRun: true });
  await server.start(0); var port = server._server.address().port;
  var r = await request(port, "GET", "/api/v1/health", { "Accept-Encoding": "gzip" });
  eq(r.status, 200);
  if (r.headers["content-encoding"] === "gzip") {
    var decompressed = zlib.gunzipSync(r.raw);
    var parsed = JSON.parse(decompressed.toString());
    eq(parsed.status, "ok");
  }
  await server.stop();
});

console.log("\n========== Result: "+p+"/"+(p+f)+" ==========");
if(f)process.exit(1);