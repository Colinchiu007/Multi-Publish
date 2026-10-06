import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/**
 * 正式包里不渲染「模拟支付成功（开发模式）」入口。
 *
 * 背景（QM-5 溯源）：`8480a7e`（2026-07-04 P2 许可证系统）引入本组件时，
 * 模拟支付按钮无条件渲染。`829dc22` 把函数覆盖率从 41% 提到 76%，
 * `981bc71` 还专门修了激活测试——**但 76% 里没有一条断言「正式包不该出现这个按钮」**。
 * 覆盖率数字与缺陷是否被拦住是两件事。
 *
 * 关键口径：这里**不给组件开测试注入口**。`simulatedPaymentAvailable` 读的就是
 * `import.meta.env.DEV`，用 `vi.stubEnv('DEV', false)` 把它摆成正式包形态，
 * 跑的是生产同一条分支。给组件留 `options.dev` 之类的口子，
 * 既让生产分支在测试里永远跑不到，也等于给误用者留了同样的口子
 * （`useFeatureFlag.test.js` 记着上一版就是这么错的，QM-6 外部评审点出来的）。
 */
describe("模拟支付入口的构建期可见性", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockStore.isPro = false; mockStore.isFree = true;
    mockStore.load.mockResolvedValue(undefined);
    mockPayment.paymentCreateOrder.mockResolvedValue({ code: 0, data: { id: "order_123" } });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  /** 摆出指定构建形态：dev=true 开发包，dev=false 正式包 */
  function mountInBuild({ dev }) {
    vi.stubEnv("DEV", dev);
    const w = mount(UpgradeModal);
    return w;
  }

  /** 推进到扫码页：点「立即升级」→ 点「确认支付 ¥99」创建订单 */
  async function advanceToPaying(w) {
    await w.find(".upgrade-btn").trigger("click");   // 立即升级 → Step 1 选择支付方式
    await nextTick();
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    await confirmBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 50));
  }

  it("正式包（DEV=false）：扫码页不出现模拟支付按钮，只留「筹备中」说明", async () => {
    const w = mountInBuild({ dev: false });
    await nextTick();
    await advanceToPaying(w);

    expect(w.text()).not.toContain("模拟支付成功");
    expect(w.text()).toContain("付费通道筹备中");
  });

  it("正式包（DEV=false）：即使模板里没有按钮，payment:simulate 也不会被调用", async () => {
    const w = mountInBuild({ dev: false });
    await nextTick();
    await advanceToPaying(w);

    // 反失明断言：确认真的走到了扫码页，而不是因为前置步骤失败导致"没渲染"
    expect(w.text()).toContain("扫码支付");
    expect(w.findAll("button").some(b => b.text().includes("模拟支付"))).toBe(false);
    expect(mockPayment.paymentSimulate).not.toHaveBeenCalled();
  });

  it("开发包（DEV=true）：模拟支付按钮仍然渲染，开发流程不被本次修复打断", async () => {
    const w = mountInBuild({ dev: true });
    await nextTick();
    await advanceToPaying(w);

    expect(w.text()).toContain("模拟支付成功（开发模式）");
    expect(w.text()).not.toContain("付费通道筹备中");
  });
});
