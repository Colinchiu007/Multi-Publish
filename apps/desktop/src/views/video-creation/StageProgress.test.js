// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StageProgress from "./StageProgress.vue";

const tStub = (key, params = {}) => {
  const map = {
    "stageProgress.statusCompleted": "已完成",
    "stageProgress.statusRunning": "运行中",
    "stageProgress.statusFailed": "失败",
    "stageProgress.statusWaitingApproval": "等待确认",
    "stageProgress.statusCancelled": "已取消",
    "stageProgress.statusPending": "等待中",
    "create.story2video.selectionWait.stageLabel": "等待选择素材",
    "pipelines.statuses.paused": "已暂停",
    "stageProgress.startedAt": "开始于 {time}",
    "stageProgress.completedAt": "完成于 {time}",
    "stageProgress.splitScenes": "拆分为了 {count} 个场景",
    "stageProgress.optimizeDone": "共 {total} 个场景，已完成 {done} 个",
    "stageProgress.composeSegments": "正在合成片段 {done}/{total} · {percent}%",
    "stageProgress.composeVideo": "视频合成 {percent}%",
    "stageProgress.assetsDetail": "图片 {images}/{imagesTotal} · 视频 {videos}/{videosTotal} · 旁白 {tts}/{ttsTotal}",
    "stageProgress.assetsDetailNoVideo": "图片 {images}/{imagesTotal} · 旁白 {tts}/{ttsTotal}",
  };
  const template = map[key] || key;
  return Object.keys(params).reduce((s, k) => s.replace(`{${k}}`, String(params[k])), template);
};

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

describe("StageProgress 阶段级进行中信息统一契约（openspec pipeline-progress-feedback-unification）", () => {
  it("任意阶段带 stage.progress：显示 message + 迷你进度条（非 compose 阶段）", () => {
    const w = mountWith({
      stages: [
        makeStage({
          name: "publish",
          status: "running",
          startedAt: new Date().toISOString(),
          progress: { percent: 50, message: "正在发布到 weibo (2/4)", updatedAt: "2026-08-13T00:00:00.000Z" },
        }),
      ],
    });
    const item = w.find('[data-testid="story2video-stage-publish"]');
    expect(item.find(".stage-detail").text()).toBe("正在发布到 weibo (2/4)");
    const bar = w.find('[data-testid="story2video-stage-progress-publish"]');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes("aria-valuenow")).toBe("50");
    w.unmount();
  });

  it("completed 阶段 summary 优先于 progress.message 展示", () => {
    const w = mountWith({
      stages: [
        makeStage({
          name: "split",
          status: "completed",
          startedAt: "2026-01-01T00:00:00Z",
          completedAt: "2026-01-01T00:00:30Z",
          progress: { percent: 100, message: "文案分句完成", updatedAt: "2026-08-13T00:00:00.000Z" },
          summary: "拆分为了 12 个场景",
        }),
      ],
    });
    const item = w.find('[data-testid="story2video-stage-split"]');
    expect(item.find(".stage-detail").text()).toBe("拆分为了 12 个场景");
    w.unmount();
  });

  it("无 stage.progress / summary：安全降级（不渲染迷你进度条，detail 仅保留既有时间文本）", () => {
    const w = mountWith({
      stages: [
        makeStage({ name: "domain_enrich", status: "running", startedAt: new Date().toISOString() }),
      ],
    });
    const item = w.find('[data-testid="story2video-stage-domain_enrich"]');
    // 无统一契约数据：detail 回退既有「开始于 …」时间文本（不显示空文案也不显示进行中 message）
    expect(item.find(".stage-detail").text()).toContain("开始于");
    expect(item.find(".stage-sub-progress").exists()).toBe(false);
    w.unmount();
  });

  it("compose 旧快照降级：无 stage.progress 时读 orchestrationContext.compose_progress 渲染子进度条（testid 兼容）", () => {
    const w = mountWith({
      stages: [makeStage({ name: "compose", status: "running", startedAt: new Date().toISOString() })],
      orchestrationContext: { compose_progress: { phase: "segments", percent: 39, segmentsDone: 3, segmentsTotal: 5 } },
    });
    const bar = w.find('[data-testid="story2video-stage-compose-progress"]');
    expect(bar.exists()).toBe(true);
    expect(bar.attributes("aria-valuenow")).toBe("39");
    expect(w.find(".stage-detail").text()).toContain("正在合成片段 3/5 · 39%");
    w.unmount();
  });

  it("optimize 运行中：旧快照降级展示 optimize_progress（不再等完成）", () => {
    const w = mountWith({
      stages: [makeStage({ name: "optimize", status: "running", startedAt: new Date().toISOString() })],
      orchestrationContext: { optimize_progress: { done: 2, total: 5 } },
    });
    const item = w.find('[data-testid="story2video-stage-optimize"]');
    expect(item.find(".stage-detail").text()).toBe("共 5 个场景，已完成 2 个");
    w.unmount();
  });
});