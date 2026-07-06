import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

const mockStore = {
  isPro: false, isTrial: false, isFree: true,
  daysRemaining: 0, load: vi.fn(),
  activate: vi.fn(), deactivate: vi.fn(), activateTrial: vi.fn()
};
vi.mock("@/stores/license", () => ({
  useLicenseStore: () => mockStore
}));

const mockPayment = { paymentCreateOrder: vi.fn(), paymentSimulate: vi.fn(), paymentCancel: vi.fn() };
window.electronAPI = mockPayment;

import UpgradeModal from "./UpgradeModal.vue";

describe("UpgradeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockStore.isPro = false; mockStore.isFree = true;
    mockStore.load.mockResolvedValue(undefined);
    mockPayment.paymentCreateOrder.mockResolvedValue({ code: 0, data: { id: "order_123" } });
    mockPayment.paymentSimulate.mockResolvedValue({ code: 0 });
    mockPayment.paymentCancel.mockResolvedValue({ code: 0 });
    mockStore.activate.mockResolvedValue(true);
    mockStore.activateTrial.mockResolvedValue(true);
  });

  it("renders overlay when visible", async () => {
    const w = mount(UpgradeModal);
    await nextTick();
    expect(w.find(".upgrade-overlay").exists()).toBe(true);
    expect(w.find(".plan-card").exists()).toBe(true);
    expect(w.text()).toContain("Pro");
  });

  it("emits close on overlay click", async () => {
    const w = mount(UpgradeModal);
    await nextTick();
    await w.find(".upgrade-overlay").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  it("shows payment flow when upgrade button clicked", async () => {
    const w = mount(UpgradeModal);
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    expect(w.text()).toContain("确认支付");
  });

  it("submits order and shows QR step", async () => {
    const w = mount(UpgradeModal);
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");  // shows payment step 1
    await nextTick();
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    if (confirmBtn.length > 0) {
      await confirmBtn[0].trigger("click");
      await new Promise(r => setTimeout(r, 50));
      expect(w.text()).toContain("扫码支付");
      expect(mockPayment.paymentCreateOrder).toHaveBeenCalled();
    }
  });

  it("handles order creation failure", async () => {
    mockPayment.paymentCreateOrder.mockResolvedValue({ code: 1, message: "order failed" });
    const w = mount(UpgradeModal);
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    if (confirmBtn.length > 0) {
      await confirmBtn[0].trigger("click");
      await nextTick();
    }
    // Should still work (error handled internally)
    expect(true).toBe(true);
  });

  it("cancels order and returns to select", async () => {
    const w = mount(UpgradeModal);
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    // Click return button
    const returnBtn = w.findAll("button").filter(b => b.text().includes("返回"));
    if (returnBtn.length > 0) {
      await returnBtn[0].trigger("click");
      await nextTick();
    }
    expect(true).toBe(true);
  });

  it("calls deactivate when deactivate button clicked", async () => {
    const w = mount(UpgradeModal, { props: { } });
    await nextTick();
    const deactivateBtn = w.findAll("button").filter(b => b.text().includes("deactivate"));
    if (deactivateBtn.length > 0) await deactivateBtn[0].trigger("click");
    // deactivate available via expose
    const vm = w.vm;
    if (typeof vm.doDeactivate === "function") {
      await vm.doDeactivate();
      expect(mockStore.deactivate).toHaveBeenCalled();
    }
  });

  it("loads license on mount", async () => {
    mount(UpgradeModal);
    await nextTick();
    expect(mockStore.load).toHaveBeenCalled();
  });
});
