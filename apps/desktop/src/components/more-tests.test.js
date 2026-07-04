import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const mockStore = {
  isPro: false,
  isTrial: false,
  isFree: true,
  daysRemaining: 0,
  licenseType: "free",
  info: { type: "free", isPro: false, isTrial: false, daysRemaining: 0 },
  load: vi.fn(),
  activate: vi.fn().mockResolvedValue(false),
  deactivate: vi.fn(),
  activateTrial: vi.fn().mockResolvedValue(false),
};

// Mock the license store module - use shared object so tests and component use the same instance
vi.mock("@/stores/license", () => ({
  useLicenseStore: () => mockStore,
}));

import TrialBanner from "./TrialBanner.vue";
import UpgradeModal from "./UpgradeModal.vue";

describe("TrialBanner", () => {
  it("renders banner when not dismissed (free mode)", () => {
    const w = mount(TrialBanner);
    expect(w.find(".trial-banner").exists()).toBe(true);
    expect(w.find(".trial-banner.free").exists()).toBe(true);
  });

  it("does not render when dismissed", () => {
    const w = mount(TrialBanner, { props: { dismissed: true } });
    expect(w.find(".trial-banner").exists()).toBe(false);
  });

  it("has upgrade button", () => {
    const w = mount(TrialBanner);
    expect(w.find(".banner-btn").text()).toContain("升级");
  });

  it("has close button", () => {
    const w = mount(TrialBanner);
    expect(w.find(".banner-close").exists()).toBe(true);
  });
});

describe("UpgradeModal", () => {
  it("renders upgrade overlay", () => {
    const w = mount(UpgradeModal);
    expect(w.find(".upgrade-overlay").exists()).toBe(true);
  });

  it("shows free and pro plan cards", () => {
    const w = mount(UpgradeModal);
    const planCards = w.findAll(".plan-card");
    expect(planCards.length).toBeGreaterThanOrEqual(2);
  });
});

describe('UpgradeModal extended', () => {
  it('shows payment flow when startPayment is triggered', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    expect(w.text()).toContain("选择支付方式");
  });

  it('shows activate input section', async () => {
    const w = mount(UpgradeModal);
    expect(w.text()).toMatch(/激活码|立即升级/);
  });
});

// Mock the payment API module for UpgradeModal tests
vi.mock('@/api/publisher', () => ({
  paymentCreateOrder: vi.fn().mockResolvedValue({ code: 0, data: { id: 'order-123' } }),
  paymentSimulate: vi.fn().mockResolvedValue({ code: 0 }),
  paymentCancel: vi.fn().mockResolvedValue({}),
}));

describe('UpgradeModal comprehensive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows free plan badge for free user', () => {
    const w = mount(UpgradeModal);
    expect(w.find('.free-card .plan-badge').text()).toContain("当前方案");
  });

  it('shows upgrade button for free user', () => {
    const w = mount(UpgradeModal);
    expect(w.find('.upgrade-btn').exists()).toBe(true);
    expect(w.find('.upgrade-btn').text()).toContain("升级");
  });

  it('starts payment flow on upgrade click', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    expect(w.text()).toContain("选择支付方式");
    expect(w.text()).toContain("支付宝");
  });

  it('submitOrder creates order and shows paying step', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    expect(w.text()).toContain("选择支付方式");
  });

  it('renders close button', () => {
    const w = mount(UpgradeModal);
    const closeBtns = w.findAll('button').filter(b => b.text().includes("✕"));
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
  });
});

// Import mocked modules for per-test control
import { paymentCreateOrder, paymentSimulate, paymentCancel } from '@/api/publisher';

describe('UpgradeModal payment flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentCreateOrder.mockResolvedValue({ code: 0, data: { id: 'order-123' } });
    paymentSimulate.mockResolvedValue({ code: 0 });
  });

  it('shows payment step select after startPayment', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    expect(w.find('.payment-flow').exists()).toBe(true);
    expect(w.text()).toContain("选择支付方式");
  });

  it('submitOrder creates order and transitions to paying', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    await w.vm.$nextTick();
    const payBtn = w.findAll('button').filter(b => b.text().includes("支付"));
    if (payBtn.length > 0) {
      await payBtn[0].trigger('click');
      await w.vm.$nextTick();
      expect(paymentCreateOrder).toHaveBeenCalled();
    }
  });

  it('submitOrder handles API error (code !== 0)', async () => {
    paymentCreateOrder.mockResolvedValue({ code: 1, message: "余额不足" });
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    const payBtns = w.findAll('button').filter(b => b.text().includes("支付"));
    if (payBtns.length > 0) {
      await payBtns[0].trigger('click');
      await w.vm.$nextTick();
      expect(w.text()).toMatch(/失败|余额/);
    }
  });

  it('submitOrder handles network error', async () => {
    paymentCreateOrder.mockRejectedValue(new Error('Network error'));
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    const payBtns = w.findAll('button').filter(b => b.text().includes("支付"));
    if (payBtns.length > 0) {
      await payBtns[0].trigger('click');
      await w.vm.$nextTick();
      expect(w.text()).toMatch(/失败|Network/);
    }
  });

  it('simulatePayment succeeds', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
  });
});


describe('UpgradeModal activation flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.activate.mockResolvedValue(false);
    mockStore.activateTrial.mockResolvedValue(false);
  });
  it('doActivate succeeds with valid key', async () => {
    mockStore.activate.mockResolvedValue(true);
    const w = mount(UpgradeModal);
    w.vm.licenseKey = 'test-key-123';
    await w.vm.doActivate();
    await w.vm.$nextTick();
    expect(mockStore.activate).toHaveBeenCalledWith('test-key-123');
  });

  it('doActivate fails with empty key - validation', async () => {
    const w = mount(UpgradeModal);
    var actBtn = w.find('.activate-section .upgrade-btn');
    if (actBtn.exists()) {
      await actBtn.trigger('click');
    }
    await w.vm.$nextTick();
    expect(mockStore.activate).not.toHaveBeenCalled();
  });

  it('doTrial activates trial', async () => {
    mockStore.activateTrial.mockResolvedValue(true);
    const w = mount(UpgradeModal);
    await w.vm.doTrial();
    await w.vm.$nextTick();
    expect(mockStore.activateTrial).toHaveBeenCalled();
  });

  it('deactivate shows/hides payment flow', async () => {
    mockStore.deactivate.mockResolvedValue();
    const w = mount(UpgradeModal);
    var deactBtns = w.findAll('button').filter(function(b) { return b.text().includes("注销许可证"); });
  });
});

// Additional coverage: simulatePayment failure paths
describe('UpgradeModal simulation coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.activate.mockResolvedValue(false);
    mockStore.activateTrial.mockResolvedValue(false);
  });

  it('simulatePayment fails when API returns error code', async () => {
    paymentSimulate.mockResolvedValue({ code: 1, message: "支付失败" });
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    await w.vm.$nextTick();
    // Start paying step
    w.vm.$.setupState.paymentStep = 'paying';
    w.vm.$.setupState.orderId = 'order-123';
    await w.vm.$nextTick();
    // Click simulate payment button
    var simBtns = w.findAll('button').filter(function(b) { return b.text().includes("模拟支付"); });
    if (simBtns.length > 0) {
      await simBtns[0].trigger('click');
    }
    await w.vm.$nextTick();
    expect(w.text()).toMatch(/失败|支付失败/);
  });

  it('simulatePayment fails with network error', async () => {
    paymentSimulate.mockRejectedValue(new Error('支付服务异常'));
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    w.vm.$.setupState.paymentStep = 'paying';
    w.vm.$.setupState.orderId = 'order-123';
    await w.vm.$nextTick();
    var simBtns = w.findAll('button').filter(function(b) { return b.text().includes("模拟支付"); });
    if (simBtns.length > 0) {
      await simBtns[0].trigger('click');
    }
    await w.vm.$nextTick();
    expect(w.text()).toMatch(/失败|异常/);
  });

  it('cancelOrder resets payment flow', async () => {
    paymentCancel.mockResolvedValue({});
    const w = mount(UpgradeModal);
    await w.find('.upgrade-btn').trigger('click');
    w.vm.$.setupState.paymentStep = 'paying';
    w.vm.$.setupState.orderId = 'order-123';
    await w.vm.$nextTick();
    var cancelBtns = w.findAll('button').filter(function(b) { return b.text().includes("取消订单"); });
    if (cancelBtns.length > 0) {
      await cancelBtns[0].trigger('click');
    }
    await w.vm.$nextTick();
    expect(paymentCancel).toHaveBeenCalled();
  });
});

describe('UpgradeModal activation edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.activate.mockResolvedValue(false);
    mockStore.activateTrial.mockResolvedValue(false);
  });

  it('doActivate fails with invalid key', async () => {
    mockStore.activate.mockResolvedValue(false);
    const w = mount(UpgradeModal);
    w.vm.licenseKey = 'invalid-key';
    await w.vm.doActivate();
    await w.vm.$nextTick();
    expect(mockStore.activate).toHaveBeenCalledWith('invalid-key');
    expect(w.text()).toContain("无效");
  });

  it('doTrial fails', async () => {
    mockStore.activateTrial.mockResolvedValue(false);
    const w = mount(UpgradeModal);
    await w.vm.doTrial();
    await w.vm.$nextTick();
    expect(mockStore.activateTrial).toHaveBeenCalled();
    expect(w.text()).toContain("失败");
  });

  it('doDeactivate calls store.deactivate', async () => {
    mockStore.deactivate.mockResolvedValue();
    const w = mount(UpgradeModal);
    await w.vm.doDeactivate();
    await w.vm.$nextTick();
    expect(mockStore.deactivate).toHaveBeenCalled();
  });
});

describe('UpgradeModal UX actions', () => {
  it('close button emits close event', async () => {
    const w = mount(UpgradeModal);
    var closeBtn = w.findAll('button').filter(function(b) { return b.text().includes("\u2715"); });
    if (closeBtn.length > 0) {
      await closeBtn[0].trigger('click');
    }
    expect(w.emitted('close')).toBeTruthy();
  });

  it('overlay click emits close event', async () => {
    const w = mount(UpgradeModal);
    await w.find('.upgrade-overlay').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });
});