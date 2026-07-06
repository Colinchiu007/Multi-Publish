// @ts-check
/**
 * 视频创作管线 IPC handlers
 * 通过 Python 后端 HTTP API 调用管线系统
 */

const http = require("http");

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || "8299", 10);

/**
 * 向 Python 后端发送 HTTP 请求
 */
function backendRequest(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: BACKEND_HOST, port: BACKEND_PORT, path, method, timeout: 10000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 400) {
              reject(new Error(json.detail || `HTTP ${res.statusCode}`));
            } else {
              resolve(json.data || json);
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.end();
  });
}

function registerHandlers(ipcMain) {
  ipcMain.handle("pipelines:list", async () => {
    try {
      return { success: true, data: await backendRequest("GET", "/api/pipelines") };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("pipelines:get", async (_event, name) => {
    try {
      return { success: true, data: await backendRequest("GET", `/api/pipelines/${encodeURIComponent(name)}`) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

module.exports = registerHandlers;
