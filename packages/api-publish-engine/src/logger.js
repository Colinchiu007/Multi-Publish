// @ts-check
/**
 * 极简零依赖 logger — 与 shared-utils/logger 接口一致
 * 用于 api-publish-engine 内部模块（api-router 等需要 require('./logger')）
 */
function _fmt (level, tag, msg, meta) {
  const ts = new Date().toISOString()
  const base = '[' + ts + '] [' + level + '] [' + tag + '] ' + msg
  if (meta !== undefined) {
    try { return base + ' ' + JSON.stringify(meta) } catch (_) { return base }
  }
  return base
}

const logger = {
  info: function (tag, msg, meta) { console.log(_fmt('INFO', tag, msg, meta)) },
  warn: function (tag, msg, meta) { console.warn(_fmt('WARN', tag, msg, meta)) },
  error: function (tag, msg, meta) { console.error(_fmt('ERROR', tag, msg, meta)) },
  debug: function (tag, msg, meta) { if (process.env.DEBUG) console.log(_fmt('DEBUG', tag, msg, meta)) }
}

module.exports = logger
