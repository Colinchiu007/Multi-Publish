/**
 * useProviderFilters — provider 过滤/格式化纯函数
 * 从 Providers.vue 提取，不含 Vue reactivity，可直接测试。
 */

export function typeLabel(type) {
  const map = { llm: "LLM", video: "视频", image: "图片" };
  return map[type] || type || "LLM";
}

export function modelList(models) {
  if (!models) return "-";
  if (Array.isArray(models)) return models.join(", ");
  try { return JSON.parse(models).join(", "); } catch { return String(models); }
}

export function filterProviders(providers, filterType) {
  if (filterType === "all") return providers;
  return providers.filter((p) => p.provider_type === filterType);
}

export function enabledCount(providers) {
  return providers.filter((p) => p.enabled).length;
}
