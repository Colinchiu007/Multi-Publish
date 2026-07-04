export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
let currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "INFO";

function log(level: LogLevel, msg: string, meta?: unknown): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]) {
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level}]`;
    if (meta) console.log(prefix, msg, meta);
    else console.log(prefix, msg);
  }
}

interface Logger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  setLevel: (l: LogLevel) => void;
}

const logger: Logger = {
  debug: (msg, meta) => log("DEBUG", msg, meta),
  info: (msg, meta) => log("INFO", msg, meta),
  warn: (msg, meta) => log("WARN", msg, meta),
  error: (msg, meta) => log("ERROR", msg, meta),
  setLevel: (l) => { currentLevel = l },
};

export default logger;