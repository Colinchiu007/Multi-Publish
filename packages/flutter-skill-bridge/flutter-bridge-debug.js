// flutter-bridge-debug.js — Debug and monitoring helpers (no Electron dependency)

function getDefaultMemoryStats() {
  return { usedJSHeapSize: 0, totalJSHeapSize: 0 };
}

module.exports = { getDefaultMemoryStats };
