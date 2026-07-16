import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SceneCard from "./SceneCard.vue";

describe("SceneCard", () => {
  it("renders scene name and index", () => {
    const scene = { id: "s1", index: 1, name: "开场镜头", status: "QUEUED" };
    const w = mount(SceneCard, { props: { scene } });
    expect(w.find(".scene-name").text()).toBe("开场镜头");
    expect(w.find(".scene-index").text()).toBe("#1");
  });

  it("renders default name when missing", () => {
    const scene = { id: "s1", status: "QUEUED" };
    const w = mount(SceneCard, { props: { scene } });
    expect(w.find(".scene-name").text()).toBe("未命名场景");
  });

  it("renders all status badges", () => {
    const statuses = [
      { status: "QUEUED", label: "队列中", class: "queued" },
      { status: "GENERATING", label: "生成中", class: "generating" },
      { status: "AWAITING", label: "待审批", class: "awaiting" },
      { status: "APPROVED", label: "已批准", class: "approved" },
      { status: "REJECTED", label: "已驳回", class: "rejected" },
      { status: "COMPLETED", label: "已完成", class: "completed" },
      { status: "FAILED", label: "失败", class: "failed" },
    ];
    for (const s of statuses) {
      const w = mount(SceneCard, {
        props: { scene: { id: "s1", status: s.status } },
      });
      const badge = w.find(".scene-badge");
      expect(badge.text()).toBe(s.label);
      expect(badge.classes()).toContain("badge-" + s.class);
    }
  });

  it("falls back to queued for unknown status", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "UNKNOWN" } },
    });
    const badge = w.find(".scene-badge");
    expect(badge.text()).toBe("队列中");
    expect(badge.classes()).toContain("badge-queued");
  });

  it("truncates long prompt to 80 chars with ellipsis", () => {
    const longPrompt = "a".repeat(120);
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "QUEUED", prompt: longPrompt } },
    });
    const promptEl = w.find(".scene-prompt");
    expect(promptEl.text().length).toBe(83); // 80 + "..."
    expect(promptEl.text().endsWith("...")).toBe(true);
  });

  it("does not truncate short prompt", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "QUEUED", prompt: "short prompt" } },
    });
    expect(w.find(".scene-prompt").text()).toBe("short prompt");
  });

  it("does not render prompt element when missing", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "QUEUED" } },
    });
    expect(w.find(".scene-prompt").exists()).toBe(false);
  });

  it("renders up to 3 take thumbnails", () => {
    const takes = [
      { thumbnail: "t1.jpg" },
      { thumbnail: "t2.jpg" },
      { thumbnail: "t3.jpg" },
      { thumbnail: "t4.jpg" },
      { thumbnail: "t5.jpg" },
    ];
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "AWAITING", takes } },
    });
    const thumbs = w.findAll(".take-thumb");
    expect(thumbs.length).toBe(3);
    expect(thumbs[0].attributes("src")).toBe("t1.jpg");
    expect(thumbs[1].attributes("src")).toBe("t2.jpg");
    expect(thumbs[2].attributes("src")).toBe("t3.jpg");
    expect(w.find(".take-more").text()).toBe("+2");
  });

  it("renders no more indicator when takes <= 3", () => {
    const takes = [{ thumbnail: "t1.jpg" }, { thumbnail: "t2.jpg" }];
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "AWAITING", takes } },
    });
    expect(w.findAll(".take-thumb").length).toBe(2);
    expect(w.find(".take-more").exists()).toBe(false);
  });

  it("supports string takes (uses string as src)", () => {
    const takes = ["str1.jpg", "str2.jpg"];
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "AWAITING", takes } },
    });
    const thumbs = w.findAll(".take-thumb");
    expect(thumbs.length).toBe(2);
    expect(thumbs[0].attributes("src")).toBe("str1.jpg");
  });

  it("renders footer with provider, cost, quality", () => {
    const w = mount(SceneCard, {
      props: {
        scene: {
          id: "s1",
          status: "COMPLETED",
          provider: "OpenAI",
          cost: 0.05,
          qualityScore: 8.5,
        },
      },
    });
    expect(w.find(".scene-provider").text()).toBe("OpenAI");
    expect(w.find(".scene-cost").text()).toBe("¥0.05");
    expect(w.find(".scene-quality").text()).toContain("8.5");
  });

  it("hides footer items when missing", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "QUEUED" } },
    });
    expect(w.find(".scene-provider").exists()).toBe(false);
    expect(w.find(".scene-cost").exists()).toBe(false);
    expect(w.find(".scene-quality").exists()).toBe(false);
  });

  it("emits select with scene id on card click", async () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "QUEUED" } },
    });
    await w.find(".scene-card").trigger("click");
    expect(w.emitted("select")).toBeTruthy();
    expect(w.emitted("select")[0]).toEqual(["s1"]);
  });

  it("applies awaiting border class when status is AWAITING", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "AWAITING" } },
    });
    expect(w.find(".scene-card").classes()).toContain("scene-awaiting");
  });

  it("applies failed border class when status is FAILED", () => {
    const w = mount(SceneCard, {
      props: { scene: { id: "s1", status: "FAILED" } },
    });
    expect(w.find(".scene-card").classes()).toContain("scene-failed");
  });
});
