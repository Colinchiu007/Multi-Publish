import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

// Element Plus stubs
const ElDialogStub = { template: "<div v-if='modelValue'><slot /></div>", props: ["modelValue"] };
const ElFormStub = { template: "<form><slot /></form>", props: ["model"] };
const ElFormItemStub = { template: "<div><slot /></div>", props: ["label", "prop"] };
const ElInputStub = { template: "<input />", props: ["modelValue"] };

vi.mock("element-plus", () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/components/UiModal.vue", () => ({
  default: { template: "<div v-if='visible'><slot /></div>", props: ["visible", "title", "size"] }
}));

import ProvidersView from "./Providers.vue";

const stubs = {
  "el-dialog": ElDialogStub,
  "el-form": ElFormStub,
  "el-form-item": ElFormItemStub,
  "el-input": ElInputStub,
};

describe("ProvidersView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      providerList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      providerCreate: vi.fn().mockResolvedValue({ code: 0 }),
      providerUpdate: vi.fn().mockResolvedValue({ code: 0 }),
      providerDelete: vi.fn().mockResolvedValue({ code: 0 }),
      providerTest: vi.fn().mockResolvedValue({ code: 0 }),
      providerSetUserKey: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createView() {
    return mount(ProvidersView, {
      global: { plugins: [createPinia()], stubs },
    });
  }

  it("renders page title", async () => {
    const w = createView();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("Provider");
  });

  it("shows filter chips", async () => {
    const w = createView();
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("\u5168\u90e8");
  });

  it("typeLabel returns correct type name", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.typeLabel("llm")).toBe("LLM");
    expect(w.vm.typeLabel("video")).toBe("\u89c6\u9891");
    expect(w.vm.typeLabel("image")).toBe("\u56fe\u7247");
    expect(w.vm.typeLabel("unknown")).toBe("unknown");
    expect(w.vm.typeLabel(undefined)).toBe("LLM");
  });

  it("modelList formats models", async () => {
    const w = createView();
    await nextTick();
    expect(w.vm.modelList(null)).toBe("-");
    expect(w.vm.modelList(undefined)).toBe("-");
    expect(w.vm.modelList(["gpt-4", "gpt-3.5"])).toBe("gpt-4, gpt-3.5");
    expect(w.vm.modelList('[\"a\",\"b\"]')).toBe("a, b");
    expect(w.vm.modelList("raw-string")).toBe("raw-string");
  });

  it("loadProviders loads providers via electronAPI", async () => {
    window.electronAPI.providerList.mockResolvedValue({
      code: 0, data: [{ name: "openai", provider_type: "llm", enabled: true }]
    });
    const w = createView();
    await nextTick();
    await w.vm.loadProviders();
    expect(w.vm.providers.length).toBe(1);
    expect(w.vm.providers[0].name).toBe("openai");
  });

  it("loadProviders handles API error", async () => {
    window.electronAPI.providerList.mockResolvedValue({ code: 1, message: "load failed" });
    const w = createView();
    await nextTick();
    await w.vm.loadProviders();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("load failed");
  });

  it("loadProviders catches exception", async () => {
    window.electronAPI.providerList.mockRejectedValue(new Error("network error"));
    const w = createView();
    await nextTick();
    await w.vm.loadProviders();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });

  it("openCreate resets form and shows dialog", async () => {
    const w = createView();
    await nextTick();
    w.vm.openCreate();
    expect(w.vm.isEditing).toBe(false);
    expect(w.vm.form.name).toBe("");
    expect(w.vm.form.provider_type).toBe("llm");
    expect(w.vm.showFormDialog).toBe(true);
  });

  it("openEdit fills form with provider data", async () => {
    const w = createView();
    await nextTick();
    w.vm.openEdit({
      name: "openai", provider_type: "llm", display_name: "OpenAI",
      base_url: "https://api.openai.com", models: ["gpt-4", "gpt-3.5"],
      enabled: true, min_tier: 1,
      config: { timeout: 30 },
    });
    expect(w.vm.isEditing).toBe(true);
    expect(w.vm.form.name).toBe("openai");
    expect(w.vm.form.base_url).toBe("https://api.openai.com");
  });

  it("submitForm creates provider via API", async () => {
    window.electronAPI.providerCreate.mockResolvedValue({ code: 0 });
    const w = createView();
    await nextTick();
    w.vm.isEditing = false;
    w.vm.form = { name: "test", provider_type: "llm", display_name: "Test", base_url: "https://t.com", models: "gpt-4", enabled: true, min_tier: 1, api_key: "sk-123", config: "" };
    w.vm.formRef = { validate: vi.fn().mockResolvedValue(true) };
    await w.vm.submitForm();
    expect(window.electronAPI.providerCreate).toHaveBeenCalled();
    expect(w.vm.showFormDialog).toBe(false);
  });

  it("submitForm updates provider when editing", async () => {
    window.electronAPI.providerUpdate.mockResolvedValue({ code: 0 });
    const w = createView();
    await nextTick();
    w.vm.isEditing = true;
    w.vm.form = { name: "openai", provider_type: "llm", display_name: "OpenAI", base_url: "https://api.openai.com", models: "gpt-4", enabled: true, min_tier: 1, api_key: "", config: "" };
    w.vm.formRef = { validate: vi.fn().mockResolvedValue(true) };
    await w.vm.submitForm();
    expect(window.electronAPI.providerUpdate).toHaveBeenCalledWith("openai", expect.any(Object));
    expect(w.vm.showFormDialog).toBe(false);
  });

  it("submitForm shows error on API failure", async () => {
    window.electronAPI.providerCreate.mockResolvedValue({ code: 1, message: "create failed" });
    const w = createView();
    await nextTick();
    w.vm.isEditing = false;
    w.vm.form = { name: "test", provider_type: "llm", display_name: "Test", base_url: "https://t.com", models: "m1", enabled: true, min_tier: 1, api_key: "", config: "" };
    w.vm.formRef = { validate: vi.fn().mockResolvedValue(true) };
    await w.vm.submitForm();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("create failed");
  });

  it("testProvider tests connection", async () => {
    window.electronAPI.providerTest.mockResolvedValue({ code: 0, message: "ok" });
    const w = createView();
    await nextTick();
    await w.vm.testProvider("openai");
    expect(w.vm.testResults["openai"].success).toBe(true);
  });

  it("testProvider handles failure", async () => {
    window.electronAPI.providerTest.mockResolvedValue({ code: 1, message: "refused" });
    const w = createView();
    await nextTick();
    await w.vm.testProvider("openai");
    expect(w.vm.testResults["openai"].success).toBe(false);
  });

  it("testProvider catches exception", async () => {
    window.electronAPI.providerTest.mockRejectedValue(new Error("error"));
    const w = createView();
    await nextTick();
    await w.vm.testProvider("openai");
    expect(w.vm.testResults["openai"].success).toBe(false);
  });

  it("confirmDelete sets target and shows dialog", async () => {
    const w = createView();
    await nextTick();
    w.vm.confirmDelete({ name: "openai" });
    expect(w.vm.deleteTarget.name).toBe("openai");
    expect(w.vm.showDeleteDialog).toBe(true);
  });

  it("doDelete deletes via API", async () => {
    window.electronAPI.providerDelete.mockResolvedValue({ code: 0 });
    const w = createView();
    await nextTick();
    w.vm.deleteTarget = { name: "openai" };
    await w.vm.doDelete();
    expect(window.electronAPI.providerDelete).toHaveBeenCalledWith("openai");
    expect(w.vm.showDeleteDialog).toBe(false);
  });

  it("doDelete handles error", async () => {
    window.electronAPI.providerDelete.mockResolvedValue({ code: 1, message: "delete failed" });
    const w = createView();
    await nextTick();
    w.vm.deleteTarget = { name: "openai" };
    await w.vm.doDelete();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalledWith("delete failed");
  });

  it("doDelete does nothing without target", async () => {
    const w = createView();
    await nextTick();
    w.vm.deleteTarget = null;
    await w.vm.doDelete();
    expect(w.vm.submitting).toBe(false);
  });

  it("filteredProviders filters by type", async () => {
    const w = createView();
    await nextTick();
    w.vm.providers = [
      { name: "a", provider_type: "llm" },
      { name: "b", provider_type: "video" },
    ];
    expect(w.vm.filteredProviders.length).toBe(2);
    w.vm.filterType = "llm";
    expect(w.vm.filteredProviders.length).toBe(1);
    expect(w.vm.filteredProviders[0].name).toBe("a");
    w.vm.filterType = "video";
    expect(w.vm.filteredProviders.length).toBe(1);
    expect(w.vm.filteredProviders[0].name).toBe("b");
  });

  it("enabledCount counts enabled providers", async () => {
    const w = createView();
    await nextTick();
    w.vm.providers = [
      { name: "a", enabled: true },
      { name: "b", enabled: false },
      { name: "c", enabled: true },
    ];
    expect(w.vm.enabledCount).toBe(2);
  });

  it("openUserKey opens dialog", async () => {
    const w = createView();
    await nextTick();
    w.vm.openUserKey({ name: "openai" });
    expect(w.vm.userKeyTarget.name).toBe("openai");
    expect(w.vm.showUserKeyDialog).toBe(true);
  });

  it("saveUserKey saves via electronAPI", async () => {
    window.electronAPI.providerSetUserKey = vi.fn().mockResolvedValue(undefined);
    const w = createView();
    await nextTick();
    w.vm.userKeyTarget = { name: "openai" };
    w.vm.userKeyForm = { apiKey: "sk-123", baseUrl: "" };
    await w.vm.saveUserKey();
    expect(window.electronAPI.providerSetUserKey).toHaveBeenCalledWith("openai", "sk-123", "");
    expect(w.vm.showUserKeyDialog).toBe(false);
  });

  it("saveUserKey catches exception", async () => {
    window.electronAPI.providerSetUserKey = vi.fn().mockRejectedValue(new Error("fail"));
    const w = createView();
    await nextTick();
    w.vm.userKeyTarget = { name: "openai" };
    await w.vm.saveUserKey();
    const { ElMessage } = await import("element-plus");
    expect(ElMessage.error).toHaveBeenCalled();
  });
});
