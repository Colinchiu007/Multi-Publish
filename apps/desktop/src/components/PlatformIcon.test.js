import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import PlatformIcon from "./PlatformIcon.vue";

describe("PlatformIcon", () => {
  it("renders known platform with correct color and letter", () => {
    const w = mount(PlatformIcon, { props: { platform: "douyin" } });
    expect(w.text()).toBe("抖");
    // jsdom converts hex to rgb()
    expect(w.attributes("style")).toContain("rgb(124, 92, 191)");
  });

  it("renders unknown platform with fallback", () => {
    const w = mount(PlatformIcon, { props: { platform: "unknown_platform" } });
    expect(w.text()).toBe("U");
    expect(w.attributes("style")).toContain("rgb(124, 92, 191)");
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
      { k: "xiaohongshu", l: "红", c: "rgb(244, 114, 182)" },
      { k: "weibo", l: "微", c: "rgb(230, 22, 45)" },
      { k: "zhihu", l: "知", c: "rgb(0, 102, 255)" },
      { k: "youtube", l: "Y", c: "rgb(255, 0, 0)" },
    ];
    for (const t of tests) {
      const w = mount(PlatformIcon, { props: { platform: t.k } });
      expect(w.text()).toBe(t.l);
      expect(w.attributes("style")).toContain(t.c);
    }
  });
});