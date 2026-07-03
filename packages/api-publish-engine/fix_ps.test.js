const fs = require("fs");
let content = fs.readFileSync("test/publish-api-server.test.js", "utf8");
content = content.replace(
  /function request\(server, method, path, body\) \{\s*return new Promise\(function\(resolve, reject\) \{\s*var addr = server\.address\(\);\s*var opts = \{ hostname: '127\.0\.0\.1', port: addr\.port, path: path, method: method, headers: \{ 'Content-Type': 'application\/json' \} \};/,
  "function request(port, method, path, body) {\n    return new Promise(function(resolve, reject) {\n      var opts = { hostname: '127.0.0.1', port: port, path: path, method: method, headers: { 'Content-Type': 'application/json' } };"
);
content = content.replace(
  /await server\.start\(0\);\s*var r = await request\(server,/g,
  "await server.start(0); var port = server._server.address().port; var r = await request(port,"
);
fs.writeFileSync("test/publish-api-server.test.js", content, "utf8");
console.log("Fixed");
