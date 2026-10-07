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

import i18n from "@/i18n"
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

  // 2026-10-07：购买入口测试会 `vi.stubEnv("DEV", true)`。若不逐例还原，
  // stub 会**泄漏到后续所有用例**——把正式包形态的断言悄悄变成开发包形态。
  // 组件里 `purchaseAvailable` / `simulatedPaymentAvailable` 读的是
  // `import.meta.env.DEV`，一旦被上一个用例留在 true，后面的
  // "正式包不显示购买入口" 就会失明。
  afterEach(() => { vi.unstubAllEnvs(); });

  it("renders overlay when visible", async () => {
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    expect(w.find(".upgrade-overlay").exists()).toBe(true);
    expect(w.find(".plan-card").exists()).toBe(true);
    expect(w.text()).toContain("Pro");
  });

  it("emits close on overlay click", async () => {
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    await w.find(".upgrade-overlay").trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });

  // 以下三例走的是**开发包**形态：2026-10-07 起购买入口在正式构建下整体关闭
  // （`purchaseAvailable = import.meta.env.DEV`），「立即升级」按钮正式包不存在。
  // 显式 stub 成 dev，否则这三条会因为找不到按钮而"静默跳过"——见下方注释。

  it("shows payment flow when upgrade button clicked", async () => {
    vi.stubEnv("DEV", true);
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    expect(w.text()).toContain("确认支付");
  });

  it("submits order and shows QR step", async () => {
    vi.stubEnv("DEV", true);
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");  // shows payment step 1
    await nextTick();
    // 去掉 `if (confirmBtn.length > 0)` 包裹：按钮找不到时整段跳过 = 恒真，
    // 支付链路坏掉测试照样绿。找不到就该红。
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    expect(confirmBtn.length).toBeGreaterThan(0);
    await confirmBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 50));
    expect(w.text()).toContain("扫码支付");
    expect(mockPayment.paymentCreateOrder).toHaveBeenCalled();
  });

  it("handles order creation failure", async () => {
    mockPayment.paymentCreateOrder.mockResolvedValue({ code: 1, message: "order failed" });
    vi.stubEnv("DEV", true);
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    expect(confirmBtn.length).toBeGreaterThan(0);
    await confirmBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 50));
    // 下单失败必须显示错误态，而不是静默成功
    // （原断言是 `expect(true).toBe(true)`，恒真，什么都没验）
    expect(w.text()).toContain("支付失败");
    expect(mockPayment.paymentCreateOrder).toHaveBeenCalled();
  });

  it("cancels order and returns to select", async () => {
    vi.stubEnv("DEV", true);
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    await nextTick();
    await w.find(".upgrade-btn").trigger("click");
    await nextTick();
    // Click return button
    const returnBtn = w.findAll("button").filter(b => b.text().includes("返回"));
    // 2026-10-07：原为 `if (…>0) {…} expect(true).toBe(true)` —— 既条件跳过又恒真，
    // 什么都没验。改为显式断言「返回」确实把界面退回选择支付方式那一步。
    expect(returnBtn.length).toBeGreaterThan(0);
    await returnBtn[0].trigger("click");
    await nextTick();
    expect(w.text()).toContain("选择支付方式");
  });

  it("calls deactivate when deactivate button clicked", async () => {
    const w = mount(UpgradeModal, { props: { }, global: { plugins: [i18n] } });
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
    mount(UpgradeModal, { global: { plugins: [i18n] } });
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
    const w = mount(UpgradeModal, { global: { plugins: [i18n] } });
    return w;
  }

  /** 推进到扫码页：点「立即升级」→ 点「确认支付」创建订单。仅 dev 构建可达。 */
  async function advanceToPaying(w) {
    await w.find(".upgrade-btn").trigger("click");   // 立即升级 → Step 1 选择支付方式
    await nextTick();
    const confirmBtn = w.findAll("button").filter(b => b.text().includes("确认支付"));
    await confirmBtn[0].trigger("click");
    await new Promise(r => setTimeout(r, 50));
  }

  it("正式包（DEV=false）：购买入口整体不渲染——无价格、无「立即升级」", async () => {
    // 2026-10-07：此前这条链的正式包形态是「能建单、能看扫码页，只是不能模拟支付」
    // （#3006 的口径）。那本身是缺陷——用户能创建一个永远付不成的真实订单。
    // 现在购买入口整体关闭，正式包**到不了扫码页**，这条断言随之改写。
    const w = mountInBuild({ dev: false });
    await nextTick();

    expect(w.text()).not.toContain("立即升级");
    expect(w.text()).not.toContain("确认支付");
    // 价格不再对外宣称那个不存在的套餐
    expect(w.text()).not.toContain("¥99");
    expect(w.text()).not.toContain("永久");
    // 如实说明现状
    expect(w.text()).toContain("付费通道筹备中");
    // 激活码通道必须仍在——买断授权的既有通道，不属于购买入口
    expect(w.text()).toContain("激活码");
  });

  it("正式包（DEV=false）：从用户可达路径上无法创建订单", async () => {
    const w = mountInBuild({ dev: false });
    await nextTick();

    // 前置条件断言：确认是真没有入口，而不是因为前置步骤失败导致"没渲染"
    const upgradeBtns = w.findAll("button").filter(b => b.text().includes("立即升级"));
    expect(upgradeBtns.length).toBe(0);
    expect(w.text()).not.toContain("扫码支付");

    // 把当前所有按钮都点一遍：正式包下**没有任何一个**能走到下单。
    // （不使用 `vm.startPayment()`——它未 expose；若用 `if (typeof … === "function")`
    //   包起来就是恒绿通道，条件永远不成立，整段断言被静默跳过。）
    for (const b of w.findAll("button")) {
      try { await b.trigger("click"); } catch { /* 无 handler 的按钮 */ }
    }
    await nextTick();
    await new Promise(r => setTimeout(r, 50));

    expect(mockPayment.paymentCreateOrder).not.toHaveBeenCalled();
    expect(mockPayment.paymentSimulate).not.toHaveBeenCalled();
    expect(w.text()).not.toContain("扫码支付");
    expect(w.text()).not.toContain("确认支付");
  });

  it("开发包（DEV=true）：模拟支付按钮仍然渲染，开发流程不被本次修复打断", async () => {
    const w = mountInBuild({ dev: true });
    await nextTick();
    await advanceToPaying(w);

    expect(w.text()).toContain("模拟支付成功（开发模式）");
    expect(w.text()).not.toContain("付费通道筹备中");
  });

  it("开发包（DEV=true）：购买入口与 ¥99 文案均保留（支付通道上线后按 plan-matrix 重做）", async () => {
    const w = mountInBuild({ dev: true });
    await nextTick();

    expect(w.text()).toContain("立即升级");
    expect(w.text()).toContain("¥99");
  });
});
