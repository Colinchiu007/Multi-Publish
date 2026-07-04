import * as http from "http";

let _server: http.Server | null = null;
let _port = 0;

export function start(port: number, handler: (data: Record<string, unknown>) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    _port = port;
    _server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try { handler(JSON.parse(body)); res.writeHead(200); res.end("OK"); }
        catch { res.writeHead(400); res.end("Invalid JSON"); }
      });
    });
    _server.listen(port, () => resolve());
    _server.on("error", reject);
  });
}

export function stop(): void { if (_server) { _server.close(); _server = null; } }

export function getPort(): number { return _port; }

export function isRunning(): boolean { return _server !== null && _server.listening; }