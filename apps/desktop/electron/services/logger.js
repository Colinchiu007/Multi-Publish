// @ts-check
/**
 * Logger service
 * Layer 2: Services — 基础日志工具
 * @typedef {'DEBUG'|'INFO'|'WARN'|'ERROR'} LogLevel
 * @type {{ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }}
 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
/** @type {string} */
let currentLevel = process.env.LOG_LEVEL || "INFO"

/**
 * @param {LogLevel} level
 * @param {string} msg
 * @param {any} [meta]
 */
function log(level, msg, meta) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[/** @type {LogLevel} */ (currentLevel)]) {
    const ts = new Date().toISOString()
    const prefix = `[${ts}] [${level}]`
    if (meta) console.log(prefix, msg, meta)
    else console.log(prefix, msg)
  }
}

const logger = {
  /** @param {string} msg @param {any} [meta] */
  debug: (msg, meta) => log("DEBUG", msg, meta),
  /** @param {string} msg @param {any} [meta] */
  info: (msg, meta) => log("INFO", msg, meta),
  /** @param {string} msg @param {any} [meta] */
  warn: (msg, meta) => log("WARN", msg, meta),
  /** @param {string} msg @param {any} [meta] */
  error: (msg, meta) => log("ERROR", msg, meta),
  /** @param {string} l */
  setLevel: (l) => { currentLevel = l },
}

module.exports = logger
