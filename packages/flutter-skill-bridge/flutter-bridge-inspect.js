// flutter-bridge-inspect.js — DOM element inspection helpers (no Electron dependency)

/**
 * Classify an HTML element by its tag and type.
 * Returns a semantic string like "button", "text_field", "checkbox", etc.
 */
function classifyElement(tag, type) {
  const t = (tag || "").toLowerCase();
  const ty = (type || "").toLowerCase();

  // Interactive elements
  if (t === "button") return "button";
  if (t === "a") return "link";
  if (t === "select") return "dropdown";
  if (t === "textarea") return "text_field";

  // Input types
  if (t === "input") {
    if (ty === "checkbox") return "checkbox";
    if (ty === "radio") return "radio";
    if (ty === "range") return "slider";
    if (["text", "email", "password", "search", "number", "tel", "url"].includes(ty)) return "text_field";
    return "text_field";
  }

  // Media / structure
  if (t === "img") return "image";
  if (t === "label") return "label";
  if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(t)) return "heading";
  if (t === "li") return "list_item";

  return "unknown";
}

module.exports = { classifyElement };
