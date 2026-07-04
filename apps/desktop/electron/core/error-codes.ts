/**
 * 统一错误码定义
 *
 * 所有 IPC handler 返回统一格式 { code, data?, message? }
 * code 为 0 表示成功，负数表示错误类型
 */

export interface ErrorCodeMap {
  SUCCESS: 0;
  REQUEST_ERROR: -1;
  VALIDATION_ERROR: -2;
  AUTH_ERROR: -3;
  NOT_FOUND: -4;
  TIMEOUT_ERROR: -5;
  NETWORK_ERROR: -6;
  IO_ERROR: -7;
  TASK_CANCELLED: -999;
  UNKNOWN_ERROR: -99;
}

export const ERROR: ErrorCodeMap = {
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
} as const;

const MESSAGES: Record<number, string> = {
  [ERROR.SUCCESS]: "Success",
  [ERROR.REQUEST_ERROR]: "Request failed",
  [ERROR.VALIDATION_ERROR]: "Validation error",
  [ERROR.AUTH_ERROR]: "Authentication failed",
  [ERROR.NOT_FOUND]: "Resource not found",
  [ERROR.TIMEOUT_ERROR]: "Request timed out",
  [ERROR.NETWORK_ERROR]: "Network error",
  [ERROR.IO_ERROR]: "IO error",
  [ERROR.TASK_CANCELLED]: "Task cancelled",
  [ERROR.UNKNOWN_ERROR]: "Unknown error",
};

export function getMessage(code: number): string {
  return MESSAGES[code] || "Unknown error";
}