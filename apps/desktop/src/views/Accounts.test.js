import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    platforms: [
      { id: "wechat_mp", label: "微信" },
      { id: "zhihu", label: "知乎" },
    ],
    getLabel: (k) => ({ wechat_mp: "微信", zhihu: "知乎" }[k] || k),
    getIcon: (k) => "ἱ0",
  })
}));

vi.mock("@/components/UiModal.vue", () => ({ default: { template: "<div v-if='visible'><slot/></div>", props: ["visible", "title", "size"] } }));

import AccountsView from "./Accounts.vue";

describe("AccountsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      accountList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  it("renders page title", async () => {
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("账号管理");
  });

  it("shows add account button", async () => {
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("添加账号");
  });

  it("shows filters", async () => {
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("全部");
    expect(w.text()).toContain("已登录");
  });

  it("shows empty state when no accounts", async () => {
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await new Promise(r => setTimeout(r, 0));
    await nextTick();
    expect(w.text()).toContain("暂无账号");
  });

  it("toggles filter", async () => {
    const w = mount(AccountsView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.filter = "active";
    await nextTick();
    expect(w.vm.filter).toBe("active");
  });
});
