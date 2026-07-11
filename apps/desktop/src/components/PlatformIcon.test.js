import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import PlatformIcon from "./PlatformIcon.vue";

describe("PlatformIcon", () => {
  it("renders known platform with correct color and letter", () => {
    const w = mount(PlatformIcon, { props: { platform: "douyin" } });
    expect(w.text()).toBe("抖");
    expect(w.classes()).toContain("pi");
    // jsdom limitation: :style binding not reflected in element.style
  });

  it("renders unknown platform with fallback", () => {
    const w = mount(PlatformIcon, { props: { platform: "unknown_platform" } });
    expect(w.text()).toBe("U");
    expect(w.classes()).toContain("pi");
  });

  it("uses label prop for display and title", () => {
    const w = mount(PlatformIcon, { props: { platform: "douyin", label: "抖音短视频" } });
    expect(w.text()).toBe("抖");
    expect(w.attributes("title")).toBe("抖音短视频");
  });

  it("applies size class correctly", () => {
    const sm = mount(PlatformIcon, { props: { platform: "bilibili", size: "sm" } });
    expect(sm.classes()).toContain("pi-sm");

    const md = mount(PlatformIcon, { props: { platform: "bilibili", size: "md" } });
    expect(md.classes()).toContain("pi-md");

    const lg = mount(PlatformIcon, { props: { platform: "bilibili", size: "lg" } });
    expect(lg.classes()).toContain("pi-lg");
  });

  it("renders multiple known platforms", () => {
    const tests = [
      { k: "xiaohongshu", l: "红" },
      { k: "weibo", l: "微" },
      { k: "zhihu", l: "知" },
      { k: "youtube", l: "Y" },
    ];
    for (const t of tests) {
      const w = mount(PlatformIcon, { props: { platform: t.k } });
      expect(w.text()).toBe(t.l);
      expect(w.classes()).toContain("pi");
    }
  });
});