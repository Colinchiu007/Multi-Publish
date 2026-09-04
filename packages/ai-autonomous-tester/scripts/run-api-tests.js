/** API functional tests. Usage: node scripts/run-api-tests.js [--list] */
const http = require('http');
const https = require('https');

function httpReq(url, opts) {
  opts = opts || {};
  return new Promise(function(resolve, reject) {
    var uo;
    try { uo = new URL(url); } catch(e) { reject(new Error('Invalid URL: ' + url)); return; }
    var lib = uo.protocol === 'https:' ? https : http;
    var ro = {
      hostname: uo.hostname,
      port: uo.port || (uo.protocol === 'https:' ? 443 : 80),
      path: uo.pathname + uo.search,
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    };
    var req = lib.request(ro, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        var json;
        try { json = JSON.parse(data); } catch(e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Request timeout')); });
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

class ApiTestRunner {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
    this.results = [];
  }
  async get(path, expectedStatus) {
    var self = this;
    try {
      var res = await httpReq(this.baseUrl + path);
      var passed = expectedStatus ? res.status === expectedStatus : res.status < 500;
      self.results.push({ test: 'GET ' + path, status: passed ? 'PASSED' : 'FAILED', actualStatus: res.status, expectedStatus: expectedStatus });
      return { passed: passed, res: res };
    } catch(e) {
      self.results.push({ test: 'GET ' + path, status: 'FAILED', error: e.message });
      return { passed: false, error: e.message };
    }
  }
  async post(path, body, expectedStatus) {
    var self = this;
    try {
      var res = await httpReq(this.baseUrl + path, { method: 'POST', body: body });
      var passed = expectedStatus ? res.status === expectedStatus : res.status < 500;
      self.results.push({ test: 'POST ' + path, status: passed ? 'PASSED' : 'FAILED', actualStatus: res.status, expectedStatus: expectedStatus });
      return { passed: passed, res: res };
    } catch(e) {
      self.results.push({ test: 'POST ' + path, status: 'FAILED', error: e.message });
      return { passed: false, error: e.message };
    }
  }
  printReport() {
    var passed = 0, failed = 0;
    this.results.forEach(function(r) {
      var icon = r.status === 'PASSED' ? ' OK ' : ' FAIL';
      var info = r.error || (r.actualStatus ? r.actualStatus + (r.expectedStatus ? ' (expected ' + r.expectedStatus + ')' : '') : '');
      console.log(icon + ' ' + r.test + (info ? ' - ' + info : ''));
      if (r.status === 'PASSED') passed++; else failed++;
    });
    console.log('\nSummary: ' + passed + ' passed / ' + failed + ' failed / ' + this.results.length + ' total\n');
    return failed === 0;
  }
}

var tests = [
  { name: 'health-check', fn: function(r) { return r.get('/health', 200); } },
  { name: 'platforms-list', fn: function(r) { return r.get('/api/platforms', 200).then(function(v) { return v.passed && Array.isArray(v.res.body); }); } },
  { name: 'accounts-list', fn: function(r) { return r.get('/api/accounts', 200); } },
];

var args = process.argv.slice(2);
if (args.indexOf('--list') > -1) { console.log('API tests:'); tests.forEach(function(t) { console.log(' - ' + t.name); }); process.exit(0); }
if (args.indexOf('--help') > -1) { console.log('Usage: node scripts/run-api-tests.js [--list] [--help]'); process.exit(0); }

var runner = new ApiTestRunner();
console.log('\n[ API tests ]\nBase: ' + runner.baseUrl + '\n');
var pending = tests.length;
tests.forEach(function(t) {
  process.stdout.write(' ' + t.name + '... ');
  t.fn(runner).then(function(ok) {
    process.stdout.write((ok ? 'OK' : 'FAIL') + '\n');
    if (--pending === 0) { process.exit(runner.printReport() ? 0 : 1); }
  }).catch(function(e) {
    process.stdout.write('FAIL: ' + e.message + '\n');
    if (--pending === 0) { process.exit(1); }
  });
});
