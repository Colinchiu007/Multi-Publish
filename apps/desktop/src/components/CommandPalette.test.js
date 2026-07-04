import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    currentRoute: { value: { path: "/" } }
  })
}));

Element.prototype.scrollIntoView = vi.fn();

const hotkeysMock = vi.fn().mockResolvedValue({ code: 0, data: [] });
window.electronAPI = { hotkeysList: hotkeysMock };

import CommandPalette from "./CommandPalette.vue";

function qs(sel) { return document.querySelector(sel); }

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    hotkeysMock.mockResolvedValue({ code: 0, data: [] });
    window.electronAPI = { hotkeysList: hotkeysMock };
  });

  it("renders nothing when not visible", () => {
    mount(CommandPalette, { props: { visible: false } });
    expect(qs(".cp-overlay")).toBeNull();
  });

  it("renders search input when visible", async () => {
    mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    expect(qs(".cp-input")).not.toBeNull();
  });

  it("shows all items when query is empty", async () => {
    mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    expect(qs(".cp-item")).not.toBeNull();
    expect(document.body.textContent).toContain("一键发布");
  });

  it("emits close on overlay click", async () => {
    const w = mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    qs(".cp-overlay").click();
    expect(w.emitted("close")).toBeTruthy();
  });

  it("closes when visible=false", async () => {
    const w = mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    expect(qs(".cp-overlay")).not.toBeNull();
    await w.setProps({ visible: false });
    await nextTick();
    expect(qs(".cp-overlay")).toBeNull();
  });

  it("filters items when typing", async () => {
    mount(CommandPalette, { props: { visible: true }, attachTo: document.body });
    await nextTick();
    const input = qs(".cp-input");
    input.value = "账号";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(document.body.textContent).toContain("账号管理");
  });

  it("shows empty state when no match", async () => {
    mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    const input = qs(".cp-input");
    input.value = "zzzznonexistent12345";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(qs(".cp-empty")).not.toBeNull();
  });

  it("navigates items with ArrowDown", async () => {
    mount(CommandPalette, { props: { visible: true }, attachTo: document.body });
    await nextTick();
    qs(".cp-overlay").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextTick();
    expect(qs(".cp-item.active")).not.toBeNull();
  });

  it("selects item with Enter", async () => {
    const w = mount(CommandPalette, { props: { visible: true }, attachTo: document.body });
    await nextTick();
    const o = qs(".cp-overlay");
    o.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextTick();
    o.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await nextTick();
    expect(w.emitted("close")).toBeTruthy();
  });

  it("selects item on click", async () => {
    const w = mount(CommandPalette, { props: { visible: true } });
    await nextTick();
    qs(".cp-item").click();
    await nextTick();
    expect(w.emitted("close")).toBeTruthy();
  });

  it("highlights item on mouse hover", async () => {
    mount(CommandPalette, { props: { visible: true }, attachTo: document.body });
    await nextTick();
    qs(".cp-item").dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await nextTick();
    expect(qs(".cp-item.active")).not.toBeNull();
  });

  it("loads shortcuts from electronAPI when visible changes to true", async () => {
    // Watch fires only when visible changes; start with false then toggle
    const w = mount(CommandPalette, { props: { visible: false } });
    hotkeysMock.mockResolvedValue({ code: 0, data: [{ label: "New Post", accelerator: "Cmd+N" }] });
    await w.setProps({ visible: true });
    await nextTick();          // watch fires, loadShortcuts() called
    await new Promise(r => setTimeout(r, 0));  // async resolution
    expect(hotkeysMock).toHaveBeenCalled();
  });
});
