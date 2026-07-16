import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";

const pushSpy = vi.fn();
let mockRouteParams = { projectId: "p1" };

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useRouter: () => ({ push: pushSpy }),
}));

import ReplayTimeline from "./ReplayTimeline.vue";

// 构造测试事件
function makeEvent(type, stageName, extra = {}) {
  return {
    id: "evt_" + Math.random().toString(36).slice(2, 8),
    projectId: "p1",
    timestamp: new Date().toISOString(),
    type,
    stageName: stageName || "",
    data: {},
    snapshot: null,
    ...extra,
  };
}

describe("ReplayTimeline", () => {
  let getFn;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouteParams = { projectId: "p1" };
    getFn = vi.fn();
    window.electronAPI = {
      replay: { get: getFn },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.electronAPI;
  });

  it("renders page title and back link", async () => {
    getFn.mockResolvedValue({ code: 0, data: { events: [], project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    expect(w.find(".replay-title").text()).toBe("生产回放");
    const backLink = w.find(".back-link");
    expect(backLink.attributes("to")).toBe("/board/p1");
  });

  it("shows loading state initially", async () => {
    getFn.mockReturnValue(new Promise(() => {}));
    const w = mount(ReplayTimeline);
    await nextTick();
    expect(w.find(".replay-loading").exists()).toBe(true);
  });

  it("shows empty state when no events", async () => {
    getFn.mockResolvedValue({ code: 0, data: { events: [], project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-empty").exists()).toBe(true);
    expect(w.text()).toContain("该生产无录制数据");
  });

  it("renders error state when IPC fails", async () => {
    getFn.mockRejectedValue(new Error("disk error"));
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-error").exists()).toBe(true);
    expect(w.text()).toContain("disk error");
  });

  it("renders error when IPC API missing", async () => {
    delete window.electronAPI;
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-error").exists()).toBe(true);
    expect(w.text()).toContain("IPC API 不可用");
  });

  it("renders error when replay.get missing", async () => {
    window.electronAPI = { replay: {} };
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-error").exists()).toBe(true);
    expect(w.text()).toContain("IPC API 不可用");
  });

  it("shows error message from non-zero code response", async () => {
    getFn.mockResolvedValue({ code: 500, message: "project not found" });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-error").exists()).toBe(true);
    expect(w.text()).toContain("project not found");
  });

  it("renders replay body with events", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: { name: "MyProject" }, totalDuration: 120 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-body").exists()).toBe(true);
    expect(w.find(".replay-title").text()).toContain("MyProject");
    expect(w.find(".replay-title").text()).toContain("生产回放");
    expect(w.find(".replay-duration").exists()).toBe(true);
    expect(w.find(".replay-duration").text()).toContain("2m 0s");
  });

  it("shows position indicator 1/N", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("1 / 3");
  });

  it("renders timeline markers for each event", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("scene:complete", "scene1"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.findAll(".timeline-marker").length).toBe(3);
  });

  it("toggles play/pause button text", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const btn = w.findAll("button").find(b => b.text().includes("播放"));
    expect(btn).toBeDefined();
    await btn.trigger("click");
    await nextTick();
    const pauseBtn = w.findAll("button").find(b => b.text().includes("暂停"));
    expect(pauseBtn).toBeDefined();
  });

  it("toggles event list visibility on title click", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Initially collapsed
    expect(w.find(".event-list").exists()).toBe(false);
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    expect(w.find(".event-list").exists()).toBe(true);
    // Toggle back
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    expect(w.find(".event-list").exists()).toBe(false);
  });

  it("jumps to event when clicking event row", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Expand event list
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    const rows = w.findAll(".event-row");
    expect(rows.length).toBe(3);
    await rows[2].trigger("click");
    await nextTick();
    // Position should update to 3/3
    expect(w.find(".timeline-position").text()).toBe("3 / 3");
    // Row 2 should be active
    const updatedRows = w.findAll(".event-row");
    expect(updatedRows[2].classes()).toContain("active");
  });

  it("pauses playback on slider input", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Start playing
    const playBtn = w.findAll("button").find(b => b.text().includes("播放"));
    await playBtn.trigger("click");
    await nextTick();
    expect(w.findAll("button").some(b => b.text().includes("暂停"))).toBe(true);
    // Drag slider
    const slider = w.find(".timeline-slider");
    await slider.trigger("input");
    await nextTick();
    // Should be paused now
    expect(w.findAll("button").some(b => b.text().includes("播放"))).toBe(true);
  });

  it("displays current event type label", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // First event selected, should show "流水线开始"
    expect(w.find(".event-type").text()).toBe("流水线开始");
    // Move to next
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    const rows = w.findAll(".event-row");
    await rows[1].trigger("click");
    await nextTick();
    expect(w.find(".event-type").text()).toBe("阶段完成");
  });

  it("renders snapshot panel when snapshot exists", async () => {
    const events = [
      makeEvent("pipeline:start", "", {
        snapshot: {
          stages: [{ name: "script", status: "completed" }],
          currentStageIndex: 0,
          status: "running",
          totalActualCost: 1.5,
          totalEstimatedCost: 3.0,
          elapsed: "2m",
          currentOperation: "generating",
          scenes: [{ id: "s1", index: 1, name: "Scene 1", status: "APPROVED" }],
        },
      }),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".snapshot-panel").exists()).toBe(true);
    expect(w.find(".snapshot-title").text()).toBe("看板快照");
    // Stages
    expect(w.find(".snapshot-stages").exists()).toBe(true);
    expect(w.findAll(".stage-node").length).toBe(1);
    // Info items
    expect(w.text()).toContain("运行中");
    expect(w.text()).toContain("$1.5");
    expect(w.text()).toContain("$3");
    expect(w.text()).toContain("2m");
    expect(w.text()).toContain("generating");
    // Scenes
    expect(w.find(".snapshot-scenes").exists()).toBe(true);
    expect(w.find(".scenes-subtitle").text()).toContain("场景 (1)");
  });

  it("hides snapshot panel when snapshot is null", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".snapshot-panel").exists()).toBe(false);
  });

  it("displays all 12 event type labels correctly", async () => {
    const types = [
      ["pipeline:start", "流水线开始"],
      ["pipeline:complete", "流水线完成"],
      ["pipeline:fail", "流水线失败"],
      ["stage:start", "阶段开始"],
      ["stage:complete", "阶段完成"],
      ["stage:fail", "阶段失败"],
      ["checkpoint:pause", "审批暂停"],
      ["scene:complete", "场景完成"],
      ["scene:fail", "场景失败"],
      ["scene:retry", "场景重试"],
      ["contact_sheet:all_approved", "全部批准"],
      ["approval:resolved", "审批已处理"],
    ];
    const events = types.map(([type]) => makeEvent(type, "stage"));
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    const rowTypes = w.findAll(".event-row-type");
    expect(rowTypes.length).toBe(12);
    for (let i = 0; i < types.length; i++) {
      expect(rowTypes[i].text()).toBe(types[i][1]);
    }
  });

  it("applies correct marker classes for event types", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("pipeline:complete", ""),
      makeEvent("pipeline:fail", ""),
      makeEvent("stage:start", ""),
      makeEvent("stage:complete", ""),
      makeEvent("checkpoint:pause", ""),
      makeEvent("scene:complete", ""),
      makeEvent("scene:retry", ""),
      makeEvent("contact_sheet:all_approved", ""),
      makeEvent("approval:resolved", ""),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const markers = w.findAll(".timeline-marker");
    expect(markers[0].classes()).toContain("marker-start");
    expect(markers[1].classes()).toContain("marker-complete");
    expect(markers[2].classes()).toContain("marker-fail");
    expect(markers[3].classes()).toContain("marker-stage-start");
    expect(markers[4].classes()).toContain("marker-stage-complete");
    expect(markers[5].classes()).toContain("marker-pause");
    expect(markers[6].classes()).toContain("marker-scene");
    expect(markers[7].classes()).toContain("marker-retry");
    expect(markers[8].classes()).toContain("marker-approved");
    expect(markers[9].classes()).toContain("marker-resolved");
  });

  it("shows default marker class for unknown event type", async () => {
    const events = [makeEvent("unknown:event", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".timeline-marker").classes()).toContain("marker-default");
    // Current event type label should show the raw type
    expect(w.find(".event-type").text()).toBe("unknown:event");
  });

  it("plays through events with fake timers", async () => {
    vi.useFakeTimers();
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Start playing
    const playBtn = w.findAll("button").find(b => b.text().includes("播放"));
    await playBtn.trigger("click");
    await nextTick();
    // Should be at index 0, position 1/3
    expect(w.find(".timeline-position").text()).toBe("1 / 3");
    // Advance 1s (default 1x speed = 1000ms)
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("2 / 3");
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("3 / 3");
    // Auto-stop at end
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(w.findAll("button").some(b => b.text().includes("播放"))).toBe(true);
  });

  it("wraps around to start when playing from end", async () => {
    vi.useFakeTimers();
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Move to last event
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    const rows = w.findAll(".event-row");
    await rows[1].trigger("click");
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("2 / 2");
    // Click play — should wrap to index 0
    const playBtn = w.findAll("button").find(b => b.text().includes("播放"));
    await playBtn.trigger("click");
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("1 / 2");
  });

  it("restarts playback when speed changes while playing", async () => {
    vi.useFakeTimers();
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const playBtn = w.findAll("button").find(b => b.text().includes("播放"));
    await playBtn.trigger("click");
    await nextTick();
    // Change to 2x — interval should be 500ms
    const select = w.find(".speed-select");
    await select.setValue("2");
    await nextTick();
    // After 500ms should advance
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(w.find(".timeline-position").text()).toBe("2 / 3");
  });

  it("handles empty project name gracefully", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-title").text()).toBe("生产回放");
  });

  it("handles project with empty name", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: { name: "" }, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Empty name falls back to just "生产回放"
    expect(w.find(".replay-title").text()).toBe("生产回放");
  });

  it("hides duration when totalDuration is 0", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-duration").exists()).toBe(false);
  });

  it("formats duration in minutes and seconds", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 65 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-duration").text()).toContain("1m 5s");
  });

  it("formats short duration as seconds", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 45 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-duration").text()).toContain("45s");
  });

  it("retries loading on error retry button click", async () => {
    getFn.mockRejectedValueOnce(new Error("first fail"));
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-error").exists()).toBe(true);
    // Click retry
    getFn.mockResolvedValue({ code: 0, data: { events: [makeEvent("pipeline:start", "")], project: null, totalDuration: 0 } });
    const retryBtn = w.findAll("button").find(b => b.text().includes("重试"));
    await retryBtn.trigger("click");
    await flushPromises();
    await nextTick();
    expect(w.find(".replay-body").exists()).toBe(true);
    expect(getFn).toHaveBeenCalledTimes(2);
  });

  it("calls replay.get with projectId from route", async () => {
    getFn.mockResolvedValue({ code: 0, data: { events: [], project: null, totalDuration: 0 } });
    mount(ReplayTimeline);
    await flushPromises();
    expect(getFn).toHaveBeenCalledWith("p1");
  });

  it("uses different projectId from route params", async () => {
    mockRouteParams = { projectId: "abc-123" };
    getFn.mockResolvedValue({ code: 0, data: { events: [], project: null, totalDuration: 0 } });
    mount(ReplayTimeline);
    await flushPromises();
    expect(getFn).toHaveBeenCalledWith("abc-123");
  });

  it("shows current operation in snapshot info", async () => {
    const events = [makeEvent("pipeline:start", "", {
      snapshot: { status: "running", currentOperation: "rendering scene 5" },
    })];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.text()).toContain("rendering scene 5");
  });

  it("shows all status labels in snapshot", async () => {
    const statuses = [
      ["draft", "草稿"],
      ["running", "运行中"],
      ["paused", "已暂停"],
      ["completed", "已完成"],
      ["failed", "已失败"],
      ["cancelled", "已取消"],
    ];
    for (const [status, label] of statuses) {
      const events = [makeEvent("pipeline:start", "", { snapshot: { status } })];
      getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
      const w = mount(ReplayTimeline);
      await flushPromises();
      await nextTick();
      expect(w.text()).toContain(label);
    }
  });

  it("renders scene grid with multiple scenes", async () => {
    const events = [makeEvent("pipeline:start", "", {
      snapshot: {
        status: "running",
        scenes: [
          { id: "s1", index: 1, name: "Scene 1", status: "APPROVED" },
          { id: "s2", index: 2, name: "Scene 2", status: "AWAITING" },
          { id: "s3", index: 3, name: "Scene 3", status: "GENERATING" },
        ],
      },
    })];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".scenes-subtitle").text()).toContain("场景 (3)");
  });

  it("hides cost info when not in snapshot", async () => {
    const events = [makeEvent("pipeline:start", "", {
      snapshot: { status: "running" },
    })];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.text()).not.toContain("实际成本");
    expect(w.text()).not.toContain("预估成本");
  });

  it("hides elapsed info when not in snapshot", async () => {
    const events = [makeEvent("pipeline:start", "", {
      snapshot: { status: "running" },
    })];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.text()).not.toContain("已耗时");
  });

  it("handles event with missing stageName", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // current-event should exist but no event-stage span
    expect(w.find(".current-event").exists()).toBe(true);
    expect(w.find(".event-stage").exists()).toBe(false);
  });

  it("shows stage name when event has stageName", async () => {
    const events = [makeEvent("stage:start", "script")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(w.find(".event-stage").exists()).toBe(true);
    expect(w.find(".event-stage").text()).toBe("script");
  });

  it("unmounts without errors after loading", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    expect(() => w.unmount()).not.toThrow();
  });

  it("unmounts without errors while playing", async () => {
    vi.useFakeTimers();
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const playBtn = w.findAll("button").find(b => b.text().includes("播放"));
    await playBtn.trigger("click");
    await nextTick();
    expect(() => w.unmount()).not.toThrow();
  });

  it("marker position is 0% when only one event", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const marker = w.find(".timeline-marker");
    expect(marker.attributes("style")).toContain("left: 0%");
  });

  it("marker positions distribute across timeline", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const markers = w.findAll(".timeline-marker");
    expect(markers[0].attributes("style")).toContain("left: 0%");
    expect(markers[1].attributes("style")).toContain("left: 50%");
    expect(markers[2].attributes("style")).toContain("left: 100%");
  });

  it("slider has correct min/max attributes", async () => {
    const events = [
      makeEvent("pipeline:start", ""),
      makeEvent("stage:start", "script"),
      makeEvent("stage:complete", "script"),
    ];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    const slider = w.find(".timeline-slider");
    expect(slider.attributes("min")).toBe("0");
    expect(slider.attributes("max")).toBe("2");
  });

  it("shows toggle icon direction based on list state", async () => {
    const events = [makeEvent("pipeline:start", "")];
    getFn.mockResolvedValue({ code: 0, data: { events, project: null, totalDuration: 0 } });
    const w = mount(ReplayTimeline);
    await flushPromises();
    await nextTick();
    // Collapsed: ▶
    expect(w.find(".toggle-icon").text()).toBe("▶");
    await w.find(".event-list-title").trigger("click");
    await nextTick();
    // Expanded: ▼
    expect(w.find(".toggle-icon").text()).toBe("▼");
  });
});
