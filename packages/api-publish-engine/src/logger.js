/**
 * Minimal console logger for api-publish-engine (zero-dependency).
 * Interface matches @multi-publish/shared-utils logger: (tag, msg).
 * Used by api-router.js for error reporting.
 */
function getTimestamp () {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

function writeLog (level, tag, msg) {
  const line = '[' + getTimestamp() + '] [' + level.toUpperCase() + '] [' + tag + '] ' + msg
  if (level === 'error') console.error(line)
  else console.log(line)
}

module.exports = {
  debug: (tag, msg) => writeLog('debug', tag, msg),
  info: (tag, msg) => writeLog('info', tag, msg),
  warn: (tag, msg) => writeLog('warn', tag, msg),
  error: (tag, msg) => writeLog('error', tag, msg)
}
