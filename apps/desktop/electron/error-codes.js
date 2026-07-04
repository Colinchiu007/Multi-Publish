/**
 * ???????
 * 
 * ?? IPC handler ?????????????????? -1?
 *
 * ??:
 *   var EC = require('./error-codes')
 *   return { code: EC.SUCCESS, data: result }
 *   return { code: EC.VALIDATION_ERROR, message: 'Missing field' }
 */

var ERROR = {
  SUCCESS: 0,
  REQUEST_ERROR: -1,
  VALIDATION_ERROR: -2,
  AUTH_ERROR: -3,
  NOT_FOUND: -4,
  TIMEOUT_ERROR: -5,
  NETWORK_ERROR: -6,
  IO_ERROR: -7,
  TASK_CANCELLED: -999,
  UNKNOWN_ERROR: -99,
}

var MESSAGES = {}
MESSAGES[ERROR.SUCCESS] = "Success"
MESSAGES[ERROR.REQUEST_ERROR] = "Request failed"
MESSAGES[ERROR.VALIDATION_ERROR] = "Validation error"
MESSAGES[ERROR.AUTH_ERROR] = "Authentication failed"
MESSAGES[ERROR.NOT_FOUND] = "Resource not found"
MESSAGES[ERROR.TIMEOUT_ERROR] = "Request timed out"
MESSAGES[ERROR.NETWORK_ERROR] = "Network error"
MESSAGES[ERROR.IO_ERROR] = "IO error"
MESSAGES[ERROR.TASK_CANCELLED] = "Task cancelled"
MESSAGES[ERROR.UNKNOWN_ERROR] = "Unknown error"

function getMessage(code) {
  return MESSAGES[code] || "Unknown error"
}

module.exports = { ERROR: ERROR, getMessage: getMessage }
