// @ts-check
/**
 * 极简 logger fallback — 与 api-publish-engine/src/logger.js 同接口
 * rewrite-engine 无外部 logger 依赖，logging-coverage-audit 引入统一日志出口。
 * options.logger 注入优先；未注入时落到此 console 实现（stdout 可被宿主捕获）。
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
