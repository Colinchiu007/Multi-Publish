/**
 * Logger - 文件日志系统
 * levels: debug, info, warn, error
 * 写入 userData/logs/app.log，自动轮转
 */
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL || 'debug';
const LOG_DIR = process.env.LOG_DIR || (typeof app !== 'undefined' ? app.getPath('userData') : process.cwd());
const LOG_FILE = path.join(LOG_DIR, 'logs', 'app.log');

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) { /* ignore */ }
}

function rotateIfNeeded(maxSize = 5 * 1024 * 1024) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > maxSize) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
  } catch (e) { /* ignore */ }
}

function writeLog(level, tag, msg) {
  if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return;
  ensureLogDir();
  rotateIfNeeded();
  var line = '[' + getTimestamp() + '] [' + level.toUpperCase() + '] [' + tag + '] ' + msg + '\n';
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* silent fail */ }
  // Console for development
  if (typeof console !== 'undefined') {
    if (level === 'error') console.error(line.trim());
    else console.log(line.trim());
  }
}

module.exports = {
  debug: function(tag, msg) { writeLog('debug', tag, msg); },
  info: function(tag, msg) { writeLog('info', tag, msg); },
  warn: function(tag, msg) { writeLog('warn', tag, msg); },
  error: function(tag, msg) { writeLog('error', tag, msg); },
  getLogPath: function() { return LOG_FILE; }
};
