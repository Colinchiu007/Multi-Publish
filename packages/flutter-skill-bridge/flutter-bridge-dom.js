// flutter-bridge-dom.js — DOM interaction helpers (no Electron dependency)

const { KEY_MAP } = require("./flutter-bridge-config");

/**
 * Resolve a CSS selector string from params.
 * Priority: params.selector > params.key > params.element
 */
function resolveSelector(params) {
  if (params.selector) return params.selector;
  if (params.key) return `#${params.key}`;
  if (params.element) return params.element;
  return null;
}

/**
 * Map a key name to a KeyboardEvent key value.
 */
function mapKey(keyName) {
  return KEY_MAP[(keyName || "").toLowerCase()] || keyName;
}

module.exports = { resolveSelector, mapKey };
