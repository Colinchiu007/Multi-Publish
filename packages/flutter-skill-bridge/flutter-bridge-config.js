// flutter-bridge-config.js — Bridge configuration constants
const DEFAULT_PORT = 18118;
const SDK_VERSION = "1.0.0";

const CAPABILITIES = [
  "initialize", "inspect", "inspect_interactive", "tap", "enter_text", "get_text",
  "find_element", "wait_for_element", "scroll", "swipe",
  "screenshot", "screenshot_region", "screenshot_element", "go_back", "get_logs", "clear_logs", "press_key",
  "get_registered_tools", "call_tool",
];

const KEY_MAP = {
  "return": "Enter", "enter": "Enter", "tab": "Tab", "escape": "Escape",
  "backspace": "Backspace", "delete": "Delete", "space": " ",
  "up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight",
  "home": "Home", "end": "End", "pageup": "PageUp", "pagedown": "PageDown",
};

module.exports = { DEFAULT_PORT, SDK_VERSION, CAPABILITIES, KEY_MAP };
