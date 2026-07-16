import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BoardStageIndicator from "./BoardStageIndicator.vue";

describe("BoardStageIndicator", () => {
  it("renders correct number of stage nodes", () => {
    const stages = ["script", "scenes", "assets", "render"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 1 } });
    expect(w.findAll(".stage-node").length).toBe(4);
  });

  it("renders connectors between stages", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 0 } });
    expect(w.findAll(".stage-connector").length).toBe(2);
  });

  it("renders no connector for single stage", () => {
    const w = mount(BoardStageIndicator, { props: { stages: ["a"], currentIndex: 0 } });
    expect(w.findAll(".stage-connector").length).toBe(0);
  });

  it("marks stages before currentIndex as completed", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 2 } });
    const nodes = w.findAll(".stage-node");
    expect(nodes[0].classes()).toContain("stage-completed");
    expect(nodes[1].classes()).toContain("stage-completed");
    expect(nodes[2].classes()).toContain("stage-running");
  });

  it("marks current stage as running", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 1 } });
    const nodes = w.findAll(".stage-node");
    expect(nodes[1].classes()).toContain("stage-running");
  });

  it("marks stages after currentIndex as pending", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 0 } });
    const nodes = w.findAll(".stage-node");
    expect(nodes[1].classes()).toContain("stage-pending");
    expect(nodes[2].classes()).toContain("stage-pending");
  });

  it("uses stage.status when available", () => {
    const stages = [
      { name: "a", status: "completed" },
      { name: "b", status: "failed" },
      { name: "c", status: "pending" },
    ];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 1 } });
    const nodes = w.findAll(".stage-node");
    expect(nodes[0].classes()).toContain("stage-completed");
    expect(nodes[1].classes()).toContain("stage-failed");
    expect(nodes[2].classes()).toContain("stage-pending");
  });

  it("renders friendly Chinese names", () => {
    const stages = ["script", "scenes", "assets"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 0 } });
    const labels = w.findAll(".stage-label");
    expect(labels[0].text()).toBe("脚本");
    expect(labels[1].text()).toBe("分镜");
    expect(labels[2].text()).toBe("素材");
  });

  it("falls back to original name when no mapping", () => {
    const stages = ["unknown_stage"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 0 } });
    expect(w.find(".stage-label").text()).toBe("unknown_stage");
  });

  it("highlights current stage label", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 1 } });
    const labels = w.findAll(".stage-label");
    expect(labels[1].classes()).toContain("active");
    expect(labels[0].classes()).not.toContain("active");
  });

  it("marks connector as completed when previous stage completed", () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 2 } });
    const connectors = w.findAll(".stage-connector");
    expect(connectors[0].classes()).toContain("completed");
    expect(connectors[1].classes()).toContain("completed");
  });

  it("emits select with index when node clicked", async () => {
    const stages = ["a", "b", "c"];
    const w = mount(BoardStageIndicator, { props: { stages, currentIndex: 0 } });
    await w.findAll(".stage-node")[1].trigger("click");
    expect(w.emitted("select")).toBeTruthy();
    expect(w.emitted("select")[0]).toEqual([1]);
  });
});
