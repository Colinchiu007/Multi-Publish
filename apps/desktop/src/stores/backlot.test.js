import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// 每个测试前清空 window.electronAPI，避免相互污染
beforeEach(() => { delete window.electronAPI; });

import { useBacklotStore } from "./backlot.js";

describe("useBacklotStore", () => {
  beforeEach(() => { setActivePinia(createPinia()); delete window.electronAPI; });

  // ─── 初始状态 ───
  it("initial state is empty", () => {
    const s = useBacklotStore();
    expect(s.projects).toEqual([]);
    expect(s.currentBoard).toBeNull();
    expect(s.pendingApprovals).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.lastApprovalDismissed).toBe(false);
    expect(s.subscribedProjectId).toBeNull();
    expect(s.runningProject).toBeNull();
    expect(s.hasPendingApprovals).toBe(false);
    expect(s.currentProject).toBeNull();
  });

  // ─── loadProjects ───
  it("loadProjects() sets error when electronAPI.project.list unavailable", async () => {
    const s = useBacklotStore();
    await s.loadProjects();
    expect(s.projects).toEqual([]);
    expect(s.error).toBeTruthy();
    expect(s.loading).toBe(false);
  });

  it("loadProjects() loads from {code:0,data:[...]} response", async () => {
    const mockProjects = [
      { id: "p1", name: "Project 1", status: "draft" },
      { id: "p2", name: "Project 2", status: "running" },
    ];
    window.electronAPI = {
      project: { list: vi.fn().mockResolvedValue({ code: 0, data: mockProjects }) },
    };
    const s = useBacklotStore();
    await s.loadProjects();
    expect(s.projects).toEqual(mockProjects);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("loadProjects() loads from array response", async () => {
    const mockProjects = [{ id: "p1", name: "P1" }];
    window.electronAPI = {
      project: { list: vi.fn().mockResolvedValue(mockProjects) },
    };
    const s = useBacklotStore();
    await s.loadProjects();
    expect(s.projects).toEqual(mockProjects);
  });

  it("loadProjects() handles error", async () => {
    window.electronAPI = {
      project: { list: vi.fn().mockRejectedValue(new Error("network")) },
    };
    const s = useBacklotStore();
    await s.loadProjects();
    expect(s.projects).toEqual([]);
    expect(s.error).toBe("network");
    expect(s.loading).toBe(false);
  });

  // ─── Getters ───
  it("runningProject returns first running project", () => {
    const s = useBacklotStore();
    s.projects = [
      { id: "p1", status: "draft" },
      { id: "p2", status: "running" },
      { id: "p3", status: "running" },
    ];
    expect(s.runningProject.id).toBe("p2");
  });

  it("runningProject returns null when none running", () => {
    const s = useBacklotStore();
    s.projects = [{ id: "p1", status: "draft" }];
    expect(s.runningProject).toBeNull();
  });

  it("currentProject returns subscribed project", () => {
    const s = useBacklotStore();
    s.projects = [{ id: "p1", status: "draft" }, { id: "p2", status: "running" }];
    s.subscribedProjectId = "p1";
    expect(s.currentProject.id).toBe("p1");
  });

  it("currentProject falls back to runningProject", () => {
    const s = useBacklotStore();
    s.projects = [{ id: "p1", status: "draft" }, { id: "p2", status: "running" }];
    expect(s.currentProject.id).toBe("p2");
  });

  // ─── deleteProject ───
  it("deleteProject() removes from list", async () => {
    window.electronAPI = {
      project: { del: vi.fn().mockResolvedValue({ code: 0 }) },
    };
    const s = useBacklotStore();
    s.projects = [{ id: "p1" }, { id: "p2" }];
    const ok = await s.deleteProject("p1");
    expect(ok).toBe(true);
    expect(s.projects.length).toBe(1);
    expect(s.projects[0].id).toBe("p2");
  });

  it("deleteProject() clears subscription if deleted", async () => {
    window.electronAPI = {
      project: { del: vi.fn().mockResolvedValue({ code: 0 }) },
    };
    const s = useBacklotStore();
    s.projects = [{ id: "p1" }];
    s.subscribedProjectId = "p1";
    s.currentBoard = { projectId: "p1" };
    await s.deleteProject("p1");
    expect(s.subscribedProjectId).toBeNull();
    expect(s.currentBoard).toBeNull();
  });

  it("deleteProject() handles error", async () => {
    window.electronAPI = {
      project: { del: vi.fn().mockRejectedValue(new Error("io")) },
    };
    const s = useBacklotStore();
    s.projects = [{ id: "p1" }];
    const ok = await s.deleteProject("p1");
    expect(ok).toBe(false);
    expect(s.error).toBe("io");
    // 失败时不应从列表移除
    expect(s.projects.length).toBe(1);
  });

  // ─── subscribeBoard / unsubscribeBoard ───
  it("subscribeBoard() sets currentBoard from initial", async () => {
    const board = { projectId: "p1", status: "running", stages: [] };
    window.electronAPI = {
      board: { subscribe: vi.fn().mockResolvedValue({ subscribed: true, initial: board }) },
    };
    const s = useBacklotStore();
    await s.subscribeBoard("p1");
    expect(s.subscribedProjectId).toBe("p1");
    expect(s.currentBoard).toEqual(board);
  });

  it("subscribeBoard() handles null initial", async () => {
    window.electronAPI = {
      board: { subscribe: vi.fn().mockResolvedValue({ subscribed: true }) },
    };
    const s = useBacklotStore();
    await s.subscribeBoard("p1");
    expect(s.subscribedProjectId).toBe("p1");
    expect(s.currentBoard).toBeNull();
  });

  it("subscribeBoard() handles error", async () => {
    window.electronAPI = {
      board: { subscribe: vi.fn().mockRejectedValue(new Error("ipc")) },
    };
    const s = useBacklotStore();
    await s.subscribeBoard("p1");
    expect(s.error).toBe("ipc");
    expect(s.subscribedProjectId).toBeNull();
  });

  it("unsubscribeBoard() clears state", async () => {
    window.electronAPI = {
      board: { unsubscribe: vi.fn().mockResolvedValue({}) },
    };
    const s = useBacklotStore();
    s.subscribedProjectId = "p1";
    s.currentBoard = { projectId: "p1" };
    await s.unsubscribeBoard();
    expect(s.subscribedProjectId).toBeNull();
    expect(s.currentBoard).toBeNull();
  });

  it("unsubscribeBoard() swallows error", async () => {
    window.electronAPI = {
      board: { unsubscribe: vi.fn().mockRejectedValue(new Error("ipc")) },
    };
    const s = useBacklotStore();
    s.subscribedProjectId = "p1";
    await s.unsubscribeBoard();
    // 即使失败也清理状态
    expect(s.subscribedProjectId).toBeNull();
  });

  // ─── fetchBoard ───
  it("fetchBoard() sets board from {code:0,data}", async () => {
    const board = { projectId: "p1", status: "running" };
    window.electronAPI = {
      board: { get: vi.fn().mockResolvedValue({ code: 0, data: board }) },
    };
    const s = useBacklotStore();
    const result = await s.fetchBoard("p1");
    expect(result).toEqual(board);
    expect(s.currentBoard).toEqual(board);
  });

  it("fetchBoard() handles direct BoardState response", async () => {
    const board = { projectId: "p1", status: "idle" };
    window.electronAPI = {
      board: { get: vi.fn().mockResolvedValue(board) },
    };
    const s = useBacklotStore();
    const result = await s.fetchBoard("p1");
    expect(result).toEqual(board);
    expect(s.currentBoard).toEqual(board);
  });

  // ─── handleBoardUpdate ───
  it("handleBoardUpdate() updates currentBoard", () => {
    const s = useBacklotStore();
    const board = { projectId: "p1", status: "running", stages: [] };
    s.handleBoardUpdate(board);
    expect(s.currentBoard).toEqual(board);
  });

  it("handleBoardUpdate() ignores null", () => {
    const s = useBacklotStore();
    s.currentBoard = { projectId: "p1" };
    s.handleBoardUpdate(null);
    expect(s.currentBoard).toEqual({ projectId: "p1" });
  });

  // ─── 审批相关 ───
  it("addApproval() adds and resets dismissed flag", () => {
    const s = useBacklotStore();
    s.lastApprovalDismissed = true;
    s.addApproval({ id: "a1", stage: "scenes" });
    expect(s.pendingApprovals.length).toBe(1);
    expect(s.hasPendingApprovals).toBe(true);
    expect(s.lastApprovalDismissed).toBe(false);
  });

  it("addApproval() ignores null", () => {
    const s = useBacklotStore();
    s.addApproval(null);
    expect(s.pendingApprovals.length).toBe(0);
  });

  it("approve() without API still removes from list", async () => {
    // Task 7/8 未完成时，approval API 不存在
    const s = useBacklotStore();
    s.pendingApprovals = [{ id: "a1" }, { id: "a2" }];
    const ok = await s.approve("a1");
    expect(ok).toBe(true);
    expect(s.pendingApprovals.length).toBe(1);
    expect(s.pendingApprovals[0].id).toBe("a2");
  });

  it("approve() with API calls approval.approve", async () => {
    const approveFn = vi.fn().mockResolvedValue({ code: 0 });
    window.electronAPI = { approval: { approve: approveFn } };
    const s = useBacklotStore();
    s.pendingApprovals = [{ id: "a1" }];
    const ok = await s.approve("a1");
    expect(ok).toBe(true);
    expect(approveFn).toHaveBeenCalledWith("a1");
    expect(s.pendingApprovals.length).toBe(0);
  });

  it("reject() with reason calls approval.reject", async () => {
    const rejectFn = vi.fn().mockResolvedValue({ code: 0 });
    window.electronAPI = { approval: { reject: rejectFn } };
    const s = useBacklotStore();
    s.pendingApprovals = [{ id: "a1" }];
    const ok = await s.reject("a1", "quality too low");
    expect(ok).toBe(true);
    expect(rejectFn).toHaveBeenCalledWith("a1", "quality too low");
  });

  it("dismissApproval() sets lastApprovalDismissed=true", () => {
    const s = useBacklotStore();
    s.dismissApproval();
    expect(s.lastApprovalDismissed).toBe(true);
  });

  it("clearError() clears error", () => {
    const s = useBacklotStore();
    s.error = "something";
    s.clearError();
    expect(s.error).toBeNull();
  });
});
