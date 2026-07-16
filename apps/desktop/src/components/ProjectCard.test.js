import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const pushSpy = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

import ProjectCard from "./ProjectCard.vue";

describe("ProjectCard", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("renders project name", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "My Project", status: "draft" } },
    });
    expect(w.text()).toContain("My Project");
  });

  it("renders default name when name missing", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", status: "draft" } },
    });
    expect(w.text()).toContain("未命名项目");
  });

  it("renders status badge with correct label", () => {
    const statuses = [
      { status: "draft", label: "草稿" },
      { status: "running", label: "运行中" },
      { status: "paused", label: "已暂停" },
      { status: "completed", label: "已完成" },
      { status: "failed", label: "失败" },
      { status: "cancelled", label: "已取消" },
    ];
    for (const { status, label } of statuses) {
      const w = mount(ProjectCard, {
        props: { project: { id: "p1", name: "P", status } },
      });
      expect(w.find(".status-badge").text()).toBe(label);
      expect(w.find(".status-badge").classes()).toContain("badge-" + status);
    }
  });

  it("renders pipeline tag when present", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft", pipelineType: "animated-explainer" } },
    });
    expect(w.find(".pipeline-tag").text()).toBe("animated-explainer");
  });

  it("does not render pipeline tag when absent", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft" } },
    });
    expect(w.find(".pipeline-tag").exists()).toBe(false);
  });

  it("renders cost label when estimatedCost present", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft", estimatedCost: "high" } },
    });
    expect(w.find(".footer-cost").text()).toBe("高成本");
  });

  it("navigates to board on click", async () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft" } },
    });
    await w.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith("/board/p1");
  });

  it("emits delete when delete button clicked (stops propagation)", async () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft" } },
    });
    await w.find(".delete-btn").trigger("click");
    expect(w.emitted("delete")).toBeTruthy();
    expect(w.emitted("delete")[0]).toEqual(["p1"]);
    // Should not navigate
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("renders thumbnail image when present", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft", thumbnail: "/img/t.png" } },
    });
    expect(w.find("img").exists()).toBe(true);
    expect(w.find("img").attributes("src")).toBe("/img/t.png");
  });

  it("renders placeholder when no thumbnail", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "draft" } },
    });
    expect(w.find("img").exists()).toBe(false);
    expect(w.find(".thumb-placeholder").exists()).toBe(true);
  });

  it("applies status class to card root", () => {
    const w = mount(ProjectCard, {
      props: { project: { id: "p1", name: "P", status: "running" } },
    });
    expect(w.find(".project-card").classes()).toContain("status-running");
  });
});
