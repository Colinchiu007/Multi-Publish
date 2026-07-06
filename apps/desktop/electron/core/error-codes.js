'use strict';

/**
 * Error codes — inline copy, not from dist-ts.
 * Kept in sync with error-codes.ts.
 */

const ERROR = {
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
};

const MESSAGES = {
  [ERROR.SUCCESS]: 'Success',
  [ERROR.REQUEST_ERROR]: 'Request failed',
  [ERROR.VALIDATION_ERROR]: 'Validation error',
  [ERROR.AUTH_ERROR]: 'Authentication failed',
  [ERROR.NOT_FOUND]: 'Resource not found',
  [ERROR.TIMEOUT_ERROR]: 'Request timed out',
  [ERROR.NETWORK_ERROR]: 'Network error',
  [ERROR.IO_ERROR]: 'IO error',
  [ERROR.TASK_CANCELLED]: 'Task cancelled',
  [ERROR.UNKNOWN_ERROR]: 'Unknown error',
};

function getMessage(code) {
  return MESSAGES[code] || 'Unknown error';
}

module.exports = { ERROR, getMessage };
