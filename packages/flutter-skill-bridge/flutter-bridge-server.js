// flutter-bridge-server.js — HTTP/WebSocket server lifecycle

const http = require("http");
const { WebSocketServer } = require("ws");
const { DEFAULT_PORT, SDK_VERSION } = require("./flutter-bridge-config");

function createHealthHandler(appName, capabilities) {
  return (req, res) => {
    if (req.url === "/.flutter-skill") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        framework: "electron",
        app_name: appName,
        platform: "electron",
        sdk_version: SDK_VERSION,
        capabilities: capabilities || [],
      }));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  };
}

function createBridgeServer(appName, capabilities, onConnection) {
  const httpServer = http.createServer(createHealthHandler(appName, capabilities));
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    const pingInterval = setInterval(() => {
      if (!ws.isAlive) {
        clearInterval(pingInterval);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) {
        clearInterval(pingInterval);
        ws.terminate();
      }
    }, 15000);

    const cleanup = () => {
      clearInterval(pingInterval);
    };

    if (onConnection) {
      onConnection(ws, cleanup);
    }
  });

  return { httpServer, wss };
}

function startServer(httpServer, port) {
  return new Promise((resolve, reject) => {
    httpServer.listen(port, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
}

function stopServer(httpServer, wss) {
  if (wss) wss.close();
  if (httpServer) httpServer.close();
}

module.exports = { createBridgeServer, startServer, stopServer, createHealthHandler };
