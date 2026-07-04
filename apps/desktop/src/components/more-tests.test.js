import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

// Mock the license store module
vi.mock("@/stores/license", () => ({
  useLicenseStore: () => ({
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
  }),
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
    expect(w.text()).toContain('选择支付方式');
  });

  it('shows activate input section', async () => {
    const w = mount(UpgradeModal);
    expect(w.text()).toMatch(/激活码|立即升级/);
  });
});
