// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StageProgress from "./StageProgress.vue";

const tStub = (key) => ({
  "stageProgress.statusCompleted": "已完成",
  "stageProgress.statusRunning": "运行中",
  "stageProgress.statusFailed": "失败",
  "stageProgress.statusWaitingApproval": "等待确认",
  "stageProgress.statusCancelled": "已取消",
  "stageProgress.statusPending": "等待中",
  "create.story2video.selectionWait.stageLabel": "等待选择素材",
  "pipelines.statuses.paused": "已暂停",
}[key] || key);

const makeStage = (overrides = {}) => ({
  name: "generate_assets",
  status: "pending",
  startedAt: null,
  completedAt: null,
  ...overrides,
});

const mountWith = (props) =>
  mount(StageProgress, { props, global: { mocks: { $t: tStub } } });

describe("StageProgress 等待态渲染（2026-08-13）", () => {
  it("scene_asset_selection 检查点暂停：显示「等待选择素材」+ waiting paused 样式 + ⏸ 图标", () => {
    const w = mountWith({
      stages: [makeStage({ status: "paused", startedAt: new Date().toISOString() })],
      checkpoint: { type: "scene_asset_selection" },
    });
    const item = w.find('[data-testid="story2video-stage-generate_assets"]');
    expect(item.classes()).toContain("waiting");
    expect(item.classes()).toContain("paused");
    expect(item.find(".stage-icon").text()).toBe("⏸");
    expect(item.find(".stage-status").text()).toContain("等待选择素材");
    w.unmount();
  });

  it("手动暂停（无 scene_asset_selection 检查点）：显示「已暂停」，仍为 waiting 样式", () => {
    const w = mountWith({
      stages: [makeStage({ name: "compose", status: "paused", startedAt: new Date().toISOString() })],
      checkpoint: null,
    });
    const item = w.find('[data-testid="story2video-stage-compose"]');
    expect(item.classes()).toContain("waiting");
    expect(item.classes()).toContain("paused");
    expect(item.find(".stage-status").text()).toContain("已暂停");
    w.unmount();
  });

  it("waiting_approval 既有语义不回归（不含 paused 类，避免触发等待用户输入脉冲样式）", () => {
    const w = mountWith({ stages: [makeStage({ status: "waiting_approval" })] });
    const item = w.find('[data-testid="story2video-stage-generate_assets"]');
    expect(item.classes()).toContain("waiting");
    expect(item.classes()).not.toContain("paused");
    expect(item.find(".stage-icon").text()).toBe("⏸");
    expect(item.find(".stage-status").text()).toContain("等待确认");
    w.unmount();
  });

  it("completed / running 既有渲染不回归", () => {
    const w = mountWith({
      stages: [
        makeStage({ name: "split", status: "completed", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:30Z" }),
        makeStage({ name: "generate_assets", status: "running", startedAt: "2026-01-01T00:00:00Z" }),
      ],
    });
    expect(w.find('[data-testid="story2video-stage-split"]').classes()).toContain("completed");
    expect(w.find('[data-testid="story2video-stage-generate_assets"]').classes()).toContain("running");
    expect(w.find('[data-testid="story2video-stage-generate_assets"] .stage-icon').text()).toBe("⟳");
    w.unmount();
  });
});