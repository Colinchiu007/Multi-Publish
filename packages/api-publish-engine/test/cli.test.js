const assert = require("assert");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log('  \u2705 '+n)}catch(e){f++;console.log('  \u274C '+n+': '+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

function waitForPort(port, timeout) {
  return new Promise(function(resolve, reject) {
    var deadline = Date.now() + timeout;
    function check() {
      var req = http.get('http://127.0.0.1:' + port + '/api/v1/health', function(res) {
        var body = '';
        res.on('data', function(c) { body += c; });
        res.on('end', function() { resolve(JSON.parse(body)); });
      });
      req.on('error', function() {
        if (Date.now() < deadline) setTimeout(check, 200);
        else reject(new Error('Timed out waiting for port ' + port));
      });
      req.end();
    }
    check();
  });
}

console.log('--- CLI file ---');
t('bin/publish-api exists',()=>{eq(fs.existsSync(path.join(__dirname,'..','bin','publish-api')),true)});

console.log('\n--- CLI --help ---');
t('--help exits 0', async function() {
  var proc = spawn(process.execPath, [path.join(__dirname,'..','bin','publish-api'), '--help']);
  var out = ''; var err = '';
  proc.stdout.on('data',function(d){out+=d});
  proc.stderr.on('data',function(d){err+=d});
  var code = await new Promise(function(r){proc.on('close',r);setTimeout(function(){proc.kill();r(-1)},3000)});
  eq(code,0);
  eq(out.includes('publish-api'),true);
  eq(err,'');
});

console.log('\n--- CLI start/stop ---');
t('starts server and responds to health', async function() {
  var proc = spawn(process.execPath, [path.join(__dirname,'..','bin','publish-api'), '--port', '4568', '--dry-run']);
  var body = await waitForPort(4568, 5000);
  eq(body.status,'ok');
  proc.kill();
});

t('uses custom port', async function() {
  var proc = spawn(process.execPath, [path.join(__dirname,'..','bin','publish-api'), '--port', '4569', '--dry-run']);
  var body = await waitForPort(4569, 5000);
  eq(body.status,'ok');
  proc.kill();
});

console.log('\n========== Result: '+p+'/'+(p+f)+' ==========');
if(f)process.exit(1);