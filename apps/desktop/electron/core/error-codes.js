'use strict';

/**
 * Error codes — inline copy, not from dist-ts.
 * dist-ts/ is .gitignore'd so CI would fail if we re-export from there.
 */
const ERROR = {
  REQUEST_ERROR: -100,
  AUTH_ERROR: -200,
  TIMEOUT: -300,
  VALIDATION_ERROR: -400,
  NOT_FOUND: -500,
  RATE_LIMIT: -600,
  SERVER_ERROR: -700,
};

module.exports = { ERROR };
