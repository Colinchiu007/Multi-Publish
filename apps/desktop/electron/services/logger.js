/**
 * Logger service
 * Layer 2: Services — 基础日志工具
 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
let currentLevel = process.env.LOG_LEVEL || "INFO"

function log(level, msg, meta) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]) {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level}]`
    if (meta) console.log(prefix, msg, meta)
    else console.log(prefix, msg)
  }
}

const logger = {
  debug: (msg, meta) => log("DEBUG", msg, meta),
  info: (msg, meta) => log("INFO", msg, meta),
  warn: (msg, meta) => log("WARN", msg, meta),
  error: (msg, meta) => log("ERROR", msg, meta),
  setLevel: (l) => { currentLevel = l },
}

module.exports = logger
