/**
 * electron/index.js - backward-compatible entry for nativeRequire.
 * Enables resolve of relative paths like ./playwright-manager.
 */
const path = require('path');
module.exports = {};
// Provide resolve capability for modules in electron/ directory
module.exports.resolve = function(modulePath) {
  return require.resolve(path.join(__dirname, modulePath));
};
