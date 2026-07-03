const assert = require("assert");
const http = require("http");

var mod;
try { mod = require("../src/publish-api-server"); } catch(e) { mod = null; }
var PublishApiServer = mod ? mod.PublishApiServer : null;

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

console.log('--- PublishApiServer structure ---');
t('PublishApiServer is exported',()=>{eq(typeof PublishApiServer,'function')});

if (PublishApiServer) {
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

  console.log('\n--- GET /api/v1/platforms ---');
  t('returns platform list', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port; var r = await request(port, 'GET', '/api/v1/platforms');
    eq(r.status, 200);
    eq(Array.isArray(r.body.platforms), true);
    eq(r.body.count > 0, true);
    eq(r.body.platforms.includes('zhihu'), true);
    await server.stop();
  });

  console.log('\n--- POST /api/v1/publish ---');
  t('publishes to zhihu with dryRun', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'POST', '/api/v1/publish', { platform: 'zhihu', title: 'test', content: 'hello', cookie: 'c' });
    eq(r.status, 200); eq(r.body.success, true); eq(r.body.platform, 'zhihu'); await server.stop();
  });
  t('fails for unknown platform', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'POST', '/api/v1/publish', { platform: 'unknown', title: 'test', content: 'hello', cookie: 'c' });
    eq(r.status, 200); eq(r.body.success, false); await server.stop();
  });
  t('400 when platform missing', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'POST', '/api/v1/publish', { title: 'test', content: 'hello', cookie: 'c' });
    eq(r.status, 400); await server.stop();
  });

  console.log('\n--- POST /api/v1/batch-publish ---');
  t('batch publish to multiple platforms', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'POST', '/api/v1/batch-publish', { platforms: ['zhihu','douyin'], title: 'test', content: 'hello', cookie: 'c' });
    eq(r.status, 200); eq(r.body.length, 2); await server.stop();
  });

  console.log('\n--- GET /api/v1/health ---');
  t('health check', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'GET', '/api/v1/health');
    eq(r.status, 200); eq(r.body.status, 'ok'); await server.stop();
  });

  console.log('\n--- 404 ---');
  t('unknown route returns 404', async function() {
    var server = new PublishApiServer({ dryRun: true }); await server.start(0); var port = server._server.address().port; var r = await request(port, 'GET', '/api/v1/unknown');
    eq(r.status, 404); await server.stop();
  });
}










  console.log('\n--- Publishing Plan routes ---');
  t('POST /api/v1/plan creates plan', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, "POST", "/api/v1/plan", { name: "Test Plan", items: [{ platform: "zhihu", title: "Post", content: "C" }] });
    eq(r.status, 200); eq(r.body.success, true); eq(r.body.plan.status, "draft");
    await server.stop();
  });
  t('GET /api/v1/plan lists plans', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    await request(port, "POST", "/api/v1/plan", { name: "P1", items: [{ platform: "zhihu", title: "T", content: "C" }] });
    await request(port, "POST", "/api/v1/plan", { name: "P2", items: [{ platform: "douyin", title: "T", content: "C" }] });
    var r = await request(port, "GET", "/api/v1/plan");
    eq(r.status, 200); eq(r.body.plans.length, 2);
    await server.stop();
  });
  t('POST /api/v1/plan/execute runs plan items', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var c = await request(port, "POST", "/api/v1/plan", { name: "Exec", items: [{ platform: "zhihu", title: "T", content: "C" }] });
    var r = await request(port, "POST", "/api/v1/plan/execute", { id: c.body.plan.id });
    eq(r.status, 200); eq(r.body.success, true);
    await server.stop();
  });

  console.log('\n--- Audit Log routes ---');
  t('GET /api/v1/logs returns logs and stats', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, "GET", "/api/v1/logs");
    eq(r.status, 200); eq(Array.isArray(r.body.logs), true); eq(typeof r.body.stats, "object");
    await server.stop();
  });
  t('publish creates audit log entry', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    await request(port, "POST", "/api/v1/publish", { platform: "zhihu", title: "AuditTest", content: "test" });
    var r = await request(port, "GET", "/api/v1/logs");
    eq(r.body.logs.length >= 1, true);
    await server.stop();
  });
  t('POST /api/v1/logs/clear removes all logs', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    await request(port, "POST", "/api/v1/publish", { platform: "zhihu", title: "T", content: "c" });
    var before = await request(port, "GET", "/api/v1/logs");
    eq(before.body.logs.length >= 1, true);
    var clr = await request(port, "POST", "/api/v1/logs/clear");
    eq(clr.status, 200); eq(clr.body.success, true);
    var after = await request(port, "GET", "/api/v1/logs");
    eq(after.body.logs.length, 0);
    await server.stop();
  });

  console.log('\n--- API Docs ---');
  t('GET /api/v1/docs returns HTML', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var http = require("http");
    var r = await new Promise(function(resolve, reject) {
      http.get("http://127.0.0.1:" + port + "/api/v1/docs", function(res) {
        var data = "";
        res.on("data", function(c) { data += c; });
        res.on("end", function() { resolve({ status: res.statusCode, headers: res.headers, body: data }); });
      }).on("error", reject);
    });
    eq(r.status, 200);
    eq(r.headers["content-type"].indexOf("text/html") >= 0, true);
    eq(r.body.indexOf("PublishApiServer") >= 0, true);
    eq(r.body.indexOf("/api/v1/platforms") >= 0, true);
    await server.stop();
  });
  t('GET /api/v1/openapi.json returns valid spec', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, "GET", "/api/v1/openapi.json");
    eq(r.status, 200);
    eq(typeof r.body.openapi, "string");
    eq(typeof r.body.info, "object");
    eq(typeof r.body.paths, "object");
    eq(r.body.paths["/api/v1/platforms"] !== undefined, true);
    await server.stop();
  });

  console.log('\n--- Webhook routes ---');
  t('POST /api/v1/webhook registers webhook', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/v1/webhook', { url: 'http://example.com/hook', events: ['schedule.completed'] });
    eq(r.status, 200); eq(r.body.success, true); eq(typeof r.body.webhook.id, 'string');
    await server.stop();
  });
  t('GET /api/v1/webhook lists webhooks', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    await request(port, 'POST', '/api/v1/webhook', { url: 'http://a.com/h1' });
    await request(port, 'POST', '/api/v1/webhook', { url: 'http://b.com/h2' });
    var r = await request(port, 'GET', '/api/v1/webhook');
    eq(r.status, 200); eq(Array.isArray(r.body.webhooks), true); eq(r.body.webhooks.length, 2);
    await server.stop();
  });
  t('POST /api/v1/webhook rejects invalid URL', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/v1/webhook', { url: 'not-a-url' });
    eq(r.status, 400);
    await server.stop();
  });
  t('POST /api/v1/webhook/remove deletes webhook', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var c = await request(port, 'POST', '/api/v1/webhook', { url: 'http://example.com/hook' });
    var r = await request(port, 'POST', '/api/v1/webhook/remove', { id: c.body.webhook.id });
    eq(r.status, 200); eq(r.body.success, true);
    var list = await request(port, 'GET', '/api/v1/webhook');
    eq(list.body.webhooks.length, 0);
    await server.stop();
  });

  console.log('\n--- Schedule routes ---');
  t('POST /api/v1/schedule creates entry', async function() {
    var server = new PublishApiServer({ dryRun: true, enableSchedule: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/v1/schedule', { platforms: ['zhihu'], title: 'Sched', content: 'Test', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    eq(r.status, 200); eq(r.body.success, true); eq(r.body.entry.status, 'pending');
    await server.stop();
  });
  t('GET /api/v1/schedule lists entries', async function() {
    var server = new PublishApiServer({ dryRun: true, enableSchedule: true });
    await server.start(0); var port = server._server.address().port;
    await request(port, 'POST', '/api/v1/schedule', { platforms: ['douyin'], title: 'T', content: 'C', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    var r = await request(port, 'GET', '/api/v1/schedule');
    eq(r.status, 200); eq(Array.isArray(r.body.entries), true); eq(r.body.entries.length, 1);
    await server.stop();
  });
  t('POST /api/v1/schedule/cancel cancels entry', async function() {
    var server = new PublishApiServer({ dryRun: true, enableSchedule: true });
    await server.start(0); var port = server._server.address().port;
    var c = await request(port, 'POST', '/api/v1/schedule', { platforms: ['zhihu'], title: 'X', content: 'x', scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    var r = await request(port, 'POST', '/api/v1/schedule/cancel', { id: c.body.entry.id });
    eq(r.status, 200); eq(r.body.success, true);
    await server.stop();
  });
  t('schedule disabled by default', async function() {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0); var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/v1/schedule', { platforms: ['zhihu'], title: 'X', content: 'x', scheduledAt: new Date().toISOString() });
    eq(r.status, 400);
    await server.stop();
  });
console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);