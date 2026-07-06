import { describe, it, expect } from "vitest";

// --- flutter-bridge-config ---

describe("flutter-bridge-config", () => {
  it("DEFAULT_PORT is 18118", () => {
    const { DEFAULT_PORT } = require("../flutter-bridge-config");
    expect(DEFAULT_PORT).toBe(18118);
  });

  it("SDK_VERSION is semver", () => {
    const { SDK_VERSION } = require("../flutter-bridge-config");
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("CAPABILITIES includes key capabilities", () => {
    const { CAPABILITIES } = require("../flutter-bridge-config");
    expect(CAPABILITIES).toContain("initialize");
    expect(CAPABILITIES).toContain("tap");
    expect(CAPABILITIES).toContain("enter_text");
    expect(CAPABILITIES).toContain("screenshot");
    expect(CAPABILITIES).toContain("call_tool");
  });

  it("KEY_MAP maps Enter", () => {
    const { KEY_MAP } = require("../flutter-bridge-config");
    expect(KEY_MAP.enter).toBe("Enter");
    expect(KEY_MAP.return).toBe("Enter");
  });
});

// --- flutter-bridge-dom ---

describe("flutter-bridge-dom", () => {
  it("resolveSelector returns params.selector when present", () => {
    const { resolveSelector } = require("../flutter-bridge-dom");
    expect(resolveSelector({ selector: "#btn" })).toBe("#btn");
  });

  it("resolveSelector converts key to #id selector", () => {
    const { resolveSelector } = require("../flutter-bridge-dom");
    expect(resolveSelector({ key: "submit" })).toBe("#submit");
  });

  it("resolveSelector returns element as-is", () => {
    const { resolveSelector } = require("../flutter-bridge-dom");
    expect(resolveSelector({ element: ".cls" })).toBe(".cls");
  });

  it("resolveSelector returns null for empty params", () => {
    const { resolveSelector } = require("../flutter-bridge-dom");
    expect(resolveSelector({})).toBeNull();
  });

  it("resolveSelector prefers selector over key", () => {
    const { resolveSelector } = require("../flutter-bridge-dom");
    expect(resolveSelector({ selector: "div", key: "btn" })).toBe("div");
  });

  it("mapKey maps common key names", () => {
    const { mapKey } = require("../flutter-bridge-dom");
    expect(mapKey("enter")).toBe("Enter");
    expect(mapKey("escape")).toBe("Escape");
    expect(mapKey("tab")).toBe("Tab");
  });

  it("mapKey passes through unknown keys", () => {
    const { mapKey } = require("../flutter-bridge-dom");
    expect(mapKey("F5")).toBe("F5");
  });
});

// --- flutter-bridge-inspect ---

describe("flutter-bridge-inspect", () => {
  it("classifyElement returns button for button tag", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("button")).toBe("button");
  });

  it("classifyElement returns text_field for text input", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("input", "text")).toBe("text_field");
    expect(classifyElement("input", "email")).toBe("text_field");
  });

  it("classifyElement returns checkbox for checkbox input", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("input", "checkbox")).toBe("checkbox");
  });

  it("classifyElement returns radio for radio input", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("input", "radio")).toBe("radio");
  });

  it("classifyElement returns dropdown for select", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("select")).toBe("dropdown");
  });

  it("classifyElement returns text_field for textarea", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("textarea")).toBe("text_field");
  });

  it("classifyElement returns link for anchor", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("a")).toBe("link");
  });

  it("classifyElement returns unknown for div", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("div")).toBe("unknown");
  });

  it("classifyElement returns heading for h1-h6", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("h1")).toBe("heading");
    expect(classifyElement("h3")).toBe("heading");
  });

  it("classifyElement returns image for img", () => {
    const { classifyElement } = require("../flutter-bridge-inspect");
    expect(classifyElement("img")).toBe("image");
  });
});

// --- flutter-bridge-debug ---

describe("flutter-bridge-debug", () => {
  it("getDefaultMemoryStats returns zeros", () => {
    const { getDefaultMemoryStats } = require("../flutter-bridge-debug");
    const stats = getDefaultMemoryStats();
    expect(stats.usedJSHeapSize).toBe(0);
    expect(stats.totalJSHeapSize).toBe(0);
  });
});
