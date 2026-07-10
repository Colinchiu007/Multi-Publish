// @ts-check
'use strict';

/**
 * Error codes — inline copy, not from dist-ts.
 * Kept in sync with error-codes.ts.
 *
 * 冲突说明：
 *   packages/api-publish-engine/src/error-codes.js（蚁小二逆向集成，第三方语义，不应修改）
 *   定义 -2=data_error, -3=unknown_error, -4=exception, -5=io_error。
 *   desktop 侧原本 -4=NOT_FOUND / -5=TIMEOUT_ERROR / -6=NETWORK_ERROR / -7=IO_ERROR
 *   与 api-publish-engine 的 -4~-5 语义冲突。
 *   调整：desktop 侧 NOT_FOUND/TIMEOUT_ERROR/NETWORK_ERROR/IO_ERROR 改为 -10~-13，
 *   避免与 api-publish-engine 的 -4(exception)/-5(io_error) 冲突。
 *   -2(VALIDATION_ERROR) 与 data_error 语义接近，可接受；-3(AUTH_ERROR) 与 unknown_error
 *   语义不同，但 desktop 侧目前未使用此码。TASK_CANCELLED(-999) 与 api-publish-engine 一致。
 */

const ERROR = {
  SUCCESS: 0,
  REQUEST_ERROR: -1,
  VALIDATION_ERROR: -2,
  AUTH_ERROR: -3,
  NOT_FOUND: -10,
  TIMEOUT_ERROR: -11,
  NETWORK_ERROR: -12,
  IO_ERROR: -13,
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
