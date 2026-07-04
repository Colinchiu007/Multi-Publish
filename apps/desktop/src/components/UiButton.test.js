import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

import UiButton from "./UiButton.vue";

describe("UiButton", () => {
  it("renders with default props", () => {
    const w = mount(UiButton, { slots: { default: "点击" } });
    expect(w.text()).toBe("点击");
    expect(w.classes()).toContain("ui-btn-primary");
    expect(w.classes()).toContain("ui-btn-md");
  });

  it("applies variant classes", () => {
    const variants = ["primary", "secondary", "ghost", "danger"];
    for (const v of variants) {
      const w = mount(UiButton, { props: { variant: v }, slots: { default: v } });
      expect(w.classes()).toContain("ui-btn-" + v);
    }
  });

  it("applies size classes", () => {
    const sizes = ["sm", "md", "lg"];
    for (const s of sizes) {
      const w = mount(UiButton, { props: { size: s }, slots: { default: s } });
      expect(w.classes()).toContain("ui-btn-" + s);
    }
  });

  it("disables button", () => {
    const w = mount(UiButton, { props: { disabled: true }, slots: { default: "禁用" } });
    expect(w.attributes("disabled")).toBeDefined();
  });

  it("renders custom tag", () => {
    const w = mount(UiButton, { props: { tag: "a", href: "/test" }, slots: { default: "链接" } });
    expect(w.element.tagName).toBe("A");
  });

  it("emits click event", async () => {
    const w = mount(UiButton, { slots: { default: "点击" } });
    await w.trigger("click");
    expect(w.emitted("click")).toBeTruthy();
  });

  it("does not emit click when disabled", async () => {
    const w = mount(UiButton, { props: { disabled: true }, slots: { default: "禁用" } });
    await w.trigger("click");
    expect(w.emitted("click")).toBeFalsy();
  });
});