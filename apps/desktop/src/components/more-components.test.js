import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import UiInput from "./UiInput.vue";
import PlatformIcon from "./PlatformIcon.vue";

describe("UiInput", () => {
  it("renders input by default", () => {
    const w = mount(UiInput);
    expect(w.find("input").exists()).toBe(true);
  });
  it("renders label when provided", () => {
    const w = mount(UiInput, { props: { label: "Title" } });
    expect(w.find("label").text()).toBe("Title");
  });
  it("shows placeholder", () => {
    const w = mount(UiInput, { props: { placeholder: "Enter..." } });
    expect(w.find("input").attributes("placeholder")).toBe("Enter...");
  });
  it("emits update:modelValue on input", async () => {
    const w = mount(UiInput, { props: { modelValue: "" } });
    await w.find("input").setValue("hello");
    expect(w.emitted("update:modelValue")).toBeTruthy();
  });
  it("renders textarea when type=textarea", () => {
    const w = mount(UiInput, { props: { type: "textarea" } });
    expect(w.find("textarea").exists()).toBe(true);
  });
  it("disables input", () => {
    const w = mount(UiInput, { props: { disabled: true } });
    expect(w.find("input").attributes("disabled")).toBeDefined();
  });
  it("shows hint text", () => {
    const w = mount(UiInput, { props: { hint: "optional" } });
    expect(w.find(".ui-input-hint").text()).toBe("optional");
  });
  it("emits focus and blur", async () => {
    const w = mount(UiInput);
    await w.find("input").trigger("focus");
    expect(w.emitted("focus")).toHaveLength(1);
    await w.find("input").trigger("blur");
    expect(w.emitted("blur")).toHaveLength(1);
  });
});

describe("PlatformIcon extended", () => {
  it("renders major platform shortcuts", () => {
    const w1 = mount(PlatformIcon, { props: { platform: "douyin" } });
    expect(w1.text()).toBe("\u6296");
    const w2 = mount(PlatformIcon, { props: { platform: "bilibili" } });
    expect(w2.text()).toBe("B");
  });
  it("falls back to uppercase first letter", () => {
    const w = mount(PlatformIcon, { props: { platform: "custom123" } });
    expect(w.text()).toBe("C");
  });
});

