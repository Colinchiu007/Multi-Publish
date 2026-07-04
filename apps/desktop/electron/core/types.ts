/**
 * Core type definitions for Electron main process
 * Layer 1: Core — zero external dependencies
 */

/** Service registration entry in DI container */
export interface RegistryEntry {
  value?: any;
  factory?: (container: any) => any;
  singleton?: boolean;
  initialized?: boolean;
}

/** DI Container interface */
export interface Container {
  register(name: string, value: any): void;
  registerMany(map: Record<string, any>): void;
  get(name: string): any;
  has(name: string): boolean;
  assertRequired(names: string[]): void;
}

/** Standard error codes used across all IPC handlers */
export const enum ErrorCode {
  SUCCESS = 0,
  REQUEST_ERROR = -1,
  VALIDATION_ERROR = -2,
  AUTH_ERROR = -3,
  NOT_FOUND = -4,
  TIMEOUT_ERROR = -5,
  NETWORK_ERROR = -6,
  IO_ERROR = -7,
  TASK_CANCELLED = -999,
  UNKNOWN_ERROR = -99,
}
