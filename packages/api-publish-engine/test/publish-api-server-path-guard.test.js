// 回归保护测试：publish-api-server 路径前缀守卫
// 关联 bug：用户忘记密码提交报 "Valid API key required via Authorization: Bearer <key>"
// 根因：Nginx /api/ 宽匹配把 Logto 内部 /api/users、/api/forgot-password 误路由到业务 API container，
//       业务 API 收到非 /api/v1/ 前缀的请求时，先走鉴权，无 token 返回 "Valid API key required"，
//       对用户造成误导。
// 修复：在 _handle 入口（webhook 之后、鉴权之前）加路径前缀守卫，非 /api/v1/ 前缀直接返回
//       404 + PATH_NOT_UNDER_BUSINESS_API，不进入鉴权流程。

const assert = require("assert");
const http = require("http");

var mod;
try { mod = require("../src/publish-api-server"); } catch(e) { mod = null; }
var PublishApiServer = mod ? mod.PublishApiServer : null;

let p = 0, f = 0;
function t(n, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { p++; console.log('  \u2705 ' + n); })
    .catch((e) => { f++; console.log('  \u274C ' + n + ': ' + e.message); });
}
function eq(a, b) { assert.deepStrictEqual(a, b); }

function request(port, method, path, body) {
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: '127.0.0.1', port: port, path: path, method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    var req = http.request(opts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

console.log('--- PublishApiServer path prefix guard (QM-5 regression) ---');

if (PublishApiServer) {
  t('PublishApiServer is exported', () => { eq(typeof PublishApiServer, 'function'); });

  // === 场景 1：非 /api/v1/ 前缀的 Logto 内部路径，应返回 404 + PATH_NOT_UNDER_BUSINESS_API ===
  // 模拟 Nginx 误路由：用户点击忘记密码，Logto 前端调用 /api/forgot-password
  t('Logto forgot-password path returns 404 with PATH_NOT_UNDER_BUSINESS_API', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/forgot-password', { phone: '13800138000' });
    eq(r.status, 404);
    eq(r.body.error, 'PATH_NOT_UNDER_BUSINESS_API');
    // 关键断言：错误信息不得是 "Valid API key required"，避免误导
    assert(!/Valid API key required/.test(JSON.stringify(r.body)),
      'must not return misleading "Valid API key required" error');
    await server.stop();
  });

  t('Logto /api/users path returns 404 (not 401)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/api/users');
    eq(r.status, 404);
    eq(r.body.error, 'PATH_NOT_UNDER_BUSINESS_API');
    await server.stop();
  });

  t('Logto /api/sign-in path returns 404 (not 401)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/sign-in', { identifier: 'test', password: 'x' });
    eq(r.status, 404);
    eq(r.body.error, 'PATH_NOT_UNDER_BUSINESS_API');
    await server.stop();
  });

  // === 场景 2：根路径和非 api 路径也应被守卫拦截 ===
  t('root path / returns 404 PATH_NOT_UNDER_BUSINESS_API', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/');
    eq(r.status, 404);
    eq(r.body.error, 'PATH_NOT_UNDER_BUSINESS_API');
    await server.stop();
  });

  t('non-api path /foo/bar returns 404 PATH_NOT_UNDER_BUSINESS_API', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/foo/bar');
    eq(r.status, 404);
    eq(r.body.error, 'PATH_NOT_UNDER_BUSINESS_API');
    await server.stop();
  });

  // === 场景 3：守卫不影响 /api/v1/ 前缀下的正常业务路径 ===
  t('/api/v1/health still works (passes guard)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/api/v1/health');
    eq(r.status, 200);
    eq(r.body.status, 'ok');
    await server.stop();
  });

  t('/api/v1/platforms still works (passes guard)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/api/v1/platforms');
    eq(r.status, 200);
    eq(Array.isArray(r.body.platforms), true);
    await server.stop();
  });

  // === 场景 4：守卫命中时错误信息应包含排查指引 ===
  t('error response includes Nginx troubleshooting hint', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'GET', '/api/users');
    eq(r.status, 404);
    assert(/Nginx|reverse_proxy|Logto container/.test(r.body.message || ''),
      'error message should mention Nginx/reverse_proxy/Logto container');
    assert(r.body.path === '/api/users',
      'error response should echo back the offending path');
    await server.stop();
  });

  // === 场景 5：守卫命中时不进入鉴权（不会调用 keyManager.load()） ===
  // 通过 spy keyManager.load 方法验证：守卫命中时 keys.json 不会被读取
  t('guard does not invoke keyManager.load (skips auth)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    var loadCallCount = 0;
    var originalLoad = server._keyManager.load.bind(server._keyManager);
    server._keyManager.load = function() {
      loadCallCount++;
      return originalLoad();
    };
    await server.start(0);
    var port = server._server.address().port;
    // 触发非 /api/v1/ 路径
    await request(port, 'GET', '/api/users');
    // 守卫命中，_checkApiKeyAuth 未被调用，因此 keyManager.load 不应该被调用
    eq(loadCallCount, 0);
    await server.stop();
  });

  // === 场景 6：守卫在 webhook 检查之后，webhook 路径正常工作 ===
  // webhook 路径 /api/v1/auth/logto/webhook 是 /api/v1/ 前缀，不受影响
  t('webhook path /api/v1/auth/logto/webhook passes guard', async () => {
    var server = new PublishApiServer({
      dryRun: true,
      logtoWebhookConsumer: {
        maxBodyBytes: 1024,
        consume: async () => ({ received: true }),
      },
    });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'POST', '/api/v1/auth/logto/webhook', {
      event: 'post.test', hookId: 'h1', createdAt: Date.now(), data: {},
    });
    eq(r.status, 200);
    eq(r.body.success, true);
    await server.stop();
  });

  // === 场景 7：守卫在 OPTIONS 预检之后，CORS 仍然正常 ===
  t('OPTIONS preflight still works (before guard)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var r = await request(port, 'OPTIONS', '/api/users');
    // OPTIONS 返回 204，不进入守卫
    eq(r.status, 204);
    await server.stop();
  });

  // === 场景 8：production-smoke 路由分离检查能检测误路由 ===
  // 模拟 Nginx 把 /api/users 路由到业务 API container 的场景：
  // 业务 API 应返回 404 + PATH_NOT_UNDER_BUSINESS_API，smoke 检查标记为 passed
  t('production-smoke detects path guard violation (positive case)', async () => {
    var server = new PublishApiServer({ dryRun: true });
    await server.start(0);
    var port = server._server.address().port;
    var apiEndpoint = `http://127.0.0.1:${port}`;
    var { runSmokeChecks } = require('../scripts/production-smoke');
    var result = await runSmokeChecks({
      api: apiEndpoint,
      logto: null, // 跳过 logto 检查
      timeoutMs: 2000,
    });
    // path-guard 检查应该 passed（业务 API 正确返回 404）
    var pathGuardChecks = result.checks.filter(c => c.name.startsWith('api.path-guard'));
    eq(pathGuardChecks.length, 2); // /api/users 和 /api/forgot-password
    for (var c of pathGuardChecks) {
      eq(c.status, 'passed');
    }
    await server.stop();
  });

  t('production-smoke detects violation when guard missing (negative case)', async () => {
    // 通过 mock 一个不实现守卫的 server，验证 smoke 检查能识别问题
    // 这里直接用一个 http server 返回 401（模拟旧版业务 API 行为）
    var fakeServer = http.createServer(function(req, res) {
      var url = req.url.split('?')[0];
      if (url.indexOf('/api/v1/') === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        // 旧版行为：返回 401（错误地走鉴权）
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid API key required' }));
      }
    });
    await new Promise(function(resolve) { fakeServer.listen(0, '127.0.0.1', resolve); });
    var port = fakeServer.address().port;
    var apiEndpoint = `http://127.0.0.1:${port}`;
    var { runSmokeChecks } = require('../scripts/production-smoke');
    var result = await runSmokeChecks({
      api: apiEndpoint,
      logto: null,
      timeoutMs: 2000,
    });
    // path-guard 检查应该 failed（业务 API 错误返回 401 + Valid API key required）
    var pathGuardChecks = result.checks.filter(c => c.name.startsWith('api.path-guard'));
    for (var c of pathGuardChecks) {
      eq(c.status, 'failed');
      eq(c.code, 'API_PATH_GUARD_VIOLATION');
    }
    await new Promise(function(resolve) { fakeServer.close(resolve); });
  });

  // === 场景 9：Nginx 正确路由到 Logto 时，smoke 检查 passed ===
  // 模拟 Nginx 把 /api/users 反代到 Logto container（返回 Logto 自己的错误响应）
  t('production-smoke passes when Nginx routes to Logto correctly', async () => {
    var fakeLogto = http.createServer(function(req, res) {
      var url = req.url.split('?')[0];
      if (url.indexOf('/api/v1/') === 0) {
        // 业务 API
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        // Logto 处理（返回 Logto 自己的 401 错误码，不是业务 API 的）
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'auth.authorization_header_missing', message: 'Authorization header is missing.' }));
      }
    });
    await new Promise(function(resolve) { fakeLogto.listen(0, '127.0.0.1', resolve); });
    var port = fakeLogto.address().port;
    var apiEndpoint = `http://127.0.0.1:${port}`;
    var { runSmokeChecks } = require('../scripts/production-smoke');
    var result = await runSmokeChecks({
      api: apiEndpoint,
      logto: null,
      timeoutMs: 2000,
    });
    var pathGuardChecks = result.checks.filter(c => c.name.startsWith('api.path-guard'));
    for (var c of pathGuardChecks) {
      eq(c.status, 'passed');
    }
    await new Promise(function(resolve) { fakeLogto.close(resolve); });
  });
}

console.log('\n========== Result: ' + p + '/' + (p + f) + ' ==========');
if (f) process.exit(1);
