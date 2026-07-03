const fs = require('fs');
let content = fs.readFileSync('D:/Data/projects/Multi-Publish/packages/api-publish-engine/test/publish-api-server.test.js', 'utf8');
content = content.replace(
  /function req\(server, method, path, body, headers\) \{\s*return new Promise\(function\(resolve, reject\) \{\s*var addr = server\.address\(\);\s*var opts = \{ hostname: '127\.0\.0\.1', port: addr\.port, path: path, method: method, headers: \{ 'Content-Type': 'application\/json', \.\.\.\(headers\|\|\{\}\) \} \};/,
  'function req(port, method, path, body, headers) {\n  return new Promise(function(resolve, reject) {\n    var opts = { hostname: \'127.0.0.1\', port: port, path: path, method: method, headers: { \'Content-Type\': \'application/json\', ...(headers||{}) } };'
);
content = content.replace(
  /await s\.start\(0\);\s*var r = await req\(s,/g,
  'await s.start(0); var port = s._server.address().port; var r = await req(port,'
);
fs.writeFileSync('D:/Data/projects/Multi-Publish/packages/api-publish-engine/test/api-key-auth.test.js', content, 'utf8');
console.log('Fixed');