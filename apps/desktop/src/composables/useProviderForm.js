/**
 * useProviderForm — provider 表单状态/提交纯函数
 * 从 Providers.vue 提取，不含 Vue reactivity。
 */

export function createDefaultForm() {
  return {
    name: "",
    provider_type: "llm",
    display_name: "",
    base_url: "",
    api_key: "",
    models: "",
    enabled: true,
    min_tier: 1,
    config: "",
  };
}

export function createEditForm(provider) {
  const models = Array.isArray(provider.models)
    ? provider.models.join("\n")
    : typeof provider.models === "string"
      ? provider.models
      : "";
  const config = provider.config
    ? typeof provider.config === "object"
      ? JSON.stringify(provider.config, null, 2)
      : String(provider.config)
    : "";
  return {
    name: provider.name,
    provider_type: provider.provider_type || "llm",
    display_name: provider.display_name || "",
    base_url: provider.base_url || "",
    api_key: "",
    models,
    enabled: provider.enabled !== false,
    min_tier: provider.min_tier || 1,
    config,
  };
}

export function buildSubmitData(form) {
  const data = {
    name: form.name,
    provider_type: form.provider_type,
    display_name: form.display_name,
    base_url: form.base_url,
    models: form.models.split("\n").map((s) => s.trim()).filter(Boolean),
    enabled: form.enabled,
    min_tier: Number(form.min_tier) || 1,
  };
  if (form.api_key) data.api_key = form.api_key;
  if (form.config) {
    try { data.config = JSON.parse(form.config); } catch { data.config = form.config; }
  }
  return data;
}
