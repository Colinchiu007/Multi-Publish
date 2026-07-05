const { vi } = require('vitest');
module.exports = {
  app: { getPath: () => '/tmp/ph-test-data' },
  BrowserWindow: { getAllWindows: () => [] },
};
