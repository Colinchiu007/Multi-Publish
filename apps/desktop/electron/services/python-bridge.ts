import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as http from "http";
import { app } from "electron";
import { default as logger } from "./logger";

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || "8299", 10);
const BACKEND_HOST = "127.0.0.1";
const HEALTH_CHECK_INTERVAL = 500;
const HEALTH_CHECK_TIMEOUT = 10000;
const WATCHDOG_INTERVAL = 30000;
const MAX_RESTARTS = 3;
const PORT_FALLBACK_COUNT = 5;

let pythonProcess: any = null;
let isRunning = false;
let currentPort = BACKEND_PORT;
let restartCount = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

function getBackendDir(): string {
  if (process.resourcesPath && app.isPackaged) {
    return path.join(process.resourcesPath, "python-backend");
  }
  return path.join(__dirname, "..", "..", "..", "..", "packages", "python-backend", "src");
}

function launchProcess(port: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir();
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    logger.info("PythonBridge", `Starting Python backend: ${pythonCmd} server.py on port ${port}`);

    const proc = spawn(pythonCmd, ["server.py"], {
      cwd: backendDir,
      env: { ...process.env, BACKEND_PORT: String(port), PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    proc.stdout.on("data", (data: Buffer) => { logger.info("PythonBackend", data.toString().trim()); });
    proc.stderr.on("data", (data: Buffer) => { logger.warn("PythonBackend", data.toString().trim()); });

    proc.on("error", (err: Error) => {
      logger.error("PythonBridge", `Failed to start: ${err.message}`);
      if (err.message.includes("EADDRINUSE") || err.message.includes("port")) reject(new Error("PORT_IN_USE"));
      else reject(err);
    });

    proc.on("exit", (code: number | null, signal: string | null) => {
      logger.info("PythonBridge", `Process exited (code=${code}, signal=${signal})`);
      isRunning = false;
      pythonProcess = null;
      if (code !== 0 && code !== null && restartCount < MAX_RESTARTS) scheduleRestart();
    });

    resolve(proc);
  });
}

export async function startPythonBackend(): Promise<void> {
  if (isRunning) return;
  let lastErr: Error | null = null;
  for (let i = 0; i < PORT_FALLBACK_COUNT; i++) {
    const port = BACKEND_PORT + i;
    try {
      pythonProcess = await launchProcess(port);
      currentPort = port;
      await waitForHealthy();
      isRunning = true;
      restartCount = 0;
      startWatchdog();
      logger.info("PythonBridge", `Backend ready on port ${port}`);
      return;
    } catch (e: any) {
      if (e.message === "PORT_IN_USE") { lastErr = e; continue; }
      lastErr = e; break;
    }
  }
  throw lastErr || new Error("Failed to start Python backend");
}

function waitForHealthy(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      const healthy = await _healthCheck();
      if (healthy) { clearInterval(interval); resolve(); }
      else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) { clearInterval(interval); reject(new Error("Python backend health check timed out")); }
    }, HEALTH_CHECK_INTERVAL);
  });
}

function startWatchdog(): void {
  stopWatchdog();
  watchdogTimer = setInterval(async () => {
    if (!isRunning) return;
    const healthy = await _healthCheck();
    if (!healthy) {
      logger.warn("PythonBridge", "Backend unhealthy, restarting...");
      if (restartCount < MAX_RESTARTS) {
        await stopPythonBackend();
        try { await startPythonBackend(); } catch (e: any) { logger.error("PythonBridge", `Restart failed: ${e.message}`); }
      } else {
        logger.error("PythonBridge", `Max restarts (${MAX_RESTARTS}) reached, giving up`);
        isRunning = false; stopWatchdog();
      }
    }
  }, WATCHDOG_INTERVAL);
}

function stopWatchdog(): void {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

function scheduleRestart(): void {
  if (restartCount >= MAX_RESTARTS) { logger.error("PythonBridge", `Max restarts (${MAX_RESTARTS}) reached`); return; }
  restartCount++;
  const delay = Math.min(restartCount * 2000, 10000);
  logger.info("PythonBridge", `Scheduling restart #${restartCount} in ${delay}ms`);
  setTimeout(async () => { try { await startPythonBackend(); } catch (e: any) { logger.error("PythonBridge", `Restart #${restartCount} failed: ${e.message}`); } }, delay);
}

function _healthCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${BACKEND_HOST}:${currentPort}/api/health`, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data).status === "ok"); } catch { resolve(false); }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

export async function stopPythonBackend(): Promise<void> {
  stopWatchdog();
  if (!pythonProcess) return;
  logger.info("PythonBridge", "Stopping Python backend...");
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pythonProcess.pid), "/F", "/T"]);
  } else {
    pythonProcess.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 3000));
    if (pythonProcess) pythonProcess.kill("SIGKILL");
  }
  pythonProcess = null;
  isRunning = false;
}

export function requestBackend(method: string, path: string, body: any = null, timeout: number = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isRunning) { reject(new Error("Python backend is not running")); return; }
    const options = {
      hostname: BACKEND_HOST, port: currentPort, path, method,
      headers: { "Content-Type": "application/json" }, timeout,
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ code: -1, message: data }); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export { isRunning as backendRunning, currentPort as backendPort };