import { describe, it, expect } from "vitest";
import { typeLabel, modelList, filterProviders, enabledCount } from "../composables/useProviderFilters";
import { createDefaultForm, createEditForm, buildSubmitData } from "../composables/useProviderForm";

// ---- useProviderFilters ----

describe("useProviderFilters", () => {
  it("typeLabel returns Chinese labels", () => {
    expect(typeLabel("llm")).toBe("LLM");
    expect(typeLabel("video")).toBe("视频");
    expect(typeLabel("image")).toBe("图片");
    expect(typeLabel("unknown")).toBe("unknown");
    expect(typeLabel()).toBe("LLM");
  });

  it("modelList formats array", () => {
    expect(modelList(["gpt-4", "gpt-3.5"])).toBe("gpt-4, gpt-3.5");
  });

  it("modelList returns dash for null", () => {
    expect(modelList(null)).toBe("-");
  });

  it("modelList parses JSON string", () => {
    expect(modelList('["a","b"]')).toBe("a, b");
  });

  it("modelList falls back to string for invalid input", () => {
    expect(modelList("raw-text")).toBe("raw-text");
  });

  it("filterProviders filters by type", () => {
    const all = [
      { name: "openai", provider_type: "llm" },
      { name: "runway", provider_type: "video" },
    ];
    expect(filterProviders(all, "video")).toHaveLength(1);
    expect(filterProviders(all, "video")[0].name).toBe("runway");
  });

  it("filterProviders returns all when type is all", () => {
    const all = [
      { name: "openai", provider_type: "llm" },
      { name: "runway", provider_type: "video" },
    ];
    expect(filterProviders(all, "all")).toHaveLength(2);
  });

  it("enabledCount returns count of enabled providers", () => {
    const all = [
      { name: "openai", enabled: true },
      { name: "runway", enabled: false },
      { name: "gemini", enabled: true },
    ];
    expect(enabledCount(all)).toBe(2);
  });

  it("enabledCount returns 0 for empty list", () => {
    expect(enabledCount([])).toBe(0);
  });
});

// ---- useProviderForm ----

describe("useProviderForm", () => {
  it("createDefaultForm returns initial form state", () => {
    const form = createDefaultForm();
    expect(form.name).toBe("");
    expect(form.provider_type).toBe("llm");
    expect(form.enabled).toBe(true);
  });

  it("createEditForm populates from provider data", () => {
    const provider = {
      name: "my-ai",
      provider_type: "llm",
      display_name: "My AI",
      base_url: "https://ai.com",
      models: ["gpt-4", "gpt-3.5"],
      enabled: true,
      min_tier: 2,
    };
    const form = createEditForm(provider);
    expect(form.name).toBe("my-ai");
    expect(form.models).toContain("gpt-4");
    expect(form.min_tier).toBe(2);
  });

  it("buildSubmitData transforms form to API payload", () => {
    const form = {
      name: "my-provider", provider_type: "llm",
      display_name: "My Provider", base_url: "https://api.example.com",
      models: "gpt-4\ngpt-3.5", enabled: true, min_tier: 1,
      api_key: "sk-test", config: "",
    };
    const data = buildSubmitData(form);
    expect(data.name).toBe("my-provider");
    expect(data.models).toEqual(["gpt-4", "gpt-3.5"]);
    expect(data.api_key).toBe("sk-test");
    expect(data.config).toBeUndefined();
  });

  it("buildSubmitData handles JSON config string", () => {
    const data = buildSubmitData({
      name: "test", provider_type: "llm", display_name: "Test",
      base_url: "https://test.com", models: "m1",
      enabled: true, min_tier: 1,
      config: '{"key":"value"}',
    });
    expect(data.config).toEqual({ key: "value" });
  });

  it("buildSubmitData skips empty api_key", () => {
    const data = buildSubmitData({
      name: "test", provider_type: "llm", display_name: "T",
      base_url: "https://t.com", models: "m1",
      enabled: true, min_tier: 1,
    });
    expect(data.api_key).toBeUndefined();
  });
});
