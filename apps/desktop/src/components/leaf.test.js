import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiBadge from "./UiBadge.vue";
import UiCard from "./UiCard.vue";

describe("UiBadge", () => {
  it("renders", () => {
    const w = mount(UiBadge, { slots: { default: "标签" } });
    expect(w.text()).toBe("标签");
    expect(w.classes()).toContain("ui-badge-default");
  });
  it("applies variant class", () => {
    const w = mount(UiBadge, { props: { variant: "success" } });
    expect(w.classes()).toContain("ui-badge-success");
  });
  it("applies size class", () => {
    const w = mount(UiBadge, { props: { size: "sm" } });
    expect(w.classes()).toContain("ui-badge-sm");
  });
});

describe("UiCard", () => {
  it("renders content", () => {
    const w = mount(UiCard, { slots: { default: "Content" } });
    expect(w.text()).toBe("Content");
  });
  it("applies padding prop", () => {
    const w = mount(UiCard, { props: { padding: "lg" } });
    expect(w.classes()).toContain("ui-card");
  });
});