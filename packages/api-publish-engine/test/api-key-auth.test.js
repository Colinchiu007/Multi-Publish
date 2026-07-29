const assert = require("assert");
const http = require("http");
const { createHarness } = require("./async-test-harness");
const { TestPublishApiServer } = require("./test-publish-api-server");

var mod;
try { mod = require("../src/publish-api-server"); } catch(e) { mod = null; }
var PublishApiServer = mod ? mod.PublishApiServer : null;

const { test: t, run } = createHarness();
function eq(a,b){assert.deepStrictEqual(a,b)}

function request(port, method, path, body) {
  return new Promise(function(resolve, reject) {
    var opts = { hostname: '127.0.0.1', port: port, path: path, method: method, headers: { 'Content-Type': 'application/json' } };
    var req = http.request(opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function withServer(callback) {
  var server = new TestPublishApiServer({ dryRun: true });
  var port = await server.start(0);
  try {
    await callback(port);
  } finally {
    await server.stop();
  }
}

console.log('--- PublishApiServer structure ---');
t('PublishApiServer is exported',()=>{eq(typeof PublishApiServer,'function')});

if (PublishApiServer) {
  console.log('\n--- GET /api/v1/platforms ---');
  t('returns platform list', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'GET', '/api/v1/platforms');
      eq(r.status, 200);
      eq(Array.isArray(r.body.platforms), true);
      eq(r.body.count > 0, true);
      eq(r.body.platforms.includes('zhihu'), true);
    });
  });

  console.log('\n--- POST /api/v1/publish ---');
  t('publishes to zhihu with dryRun', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'POST', '/api/v1/publish', { platform: 'zhihu', title: 'test', content: 'hello', cookie: 'c' });
      eq(r.status, 200); eq(r.body.success, true); eq(r.body.platform, 'zhihu');
    });
  });
  t('fails for unknown platform', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'POST', '/api/v1/publish', { platform: 'unknown', title: 'test', content: 'hello', cookie: 'c' });
      eq(r.status, 200); eq(r.body.success, false);
    });
  });
  t('400 when platform missing', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'POST', '/api/v1/publish', { title: 'test', content: 'hello', cookie: 'c' });
      eq(r.status, 400);
    });
  });

  console.log('\n--- POST /api/v1/batch-publish ---');
  t('batch publish to multiple platforms', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'POST', '/api/v1/batch-publish', { platforms: ['zhihu','douyin'], title: 'test', content: 'hello', cookie: 'c' });
      eq(r.status, 200); eq(r.body.length, 2);
    });
  });

  console.log('\n--- GET /api/v1/health ---');
  t('health check', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'GET', '/api/v1/health');
      eq(r.status, 200); eq(r.body.status, 'ok');
    });
  });

  console.log('\n--- 404 ---');
  t('unknown route returns 404', async function() {
    await withServer(async function(port) {
      var r = await request(port, 'GET', '/api/v1/unknown');
      eq(r.status, 404);
    });
  });
}

run();
