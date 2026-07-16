import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";

beforeEach(() => { delete window.electronAPI; });

import { useProjectList, useLiveBoard, useApprovalFlow } from "./useBacklot.js";
import { useBacklotStore } from "@/stores/backlot";

describe("useProjectList", () => {
  beforeEach(() => { setActivePinia(createPinia()); delete window.electronAPI; });

  it("returns reactive state from store", () => {
    const { projects, loading, error, runningProject, refreshed, refresh, deleteProject } = useProjectList();
    expect(projects.value).toEqual([]);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
    expect(runningProject.value).toBeNull();
    expect(refreshed.value).toBe(false);
    expect(typeof refresh).toBe("function");
    expect(typeof deleteProject).toBe("function");
  });

  it("refresh() loads projects", async () => {
    const mockProjects = [{ id: "p1", name: "P1", status: "draft" }];
    window.electronAPI = {
      project: { list: vi.fn().mockResolvedValue({ code: 0, data: mockProjects }) },
    };
    const { projects, refreshed, refresh } = useProjectList();
    await refresh();
    expect(projects.value).toEqual(mockProjects);
    expect(refreshed.value).toBe(true);
  });

  it("deleteProject() removes project", async () => {
    window.electronAPI = {
      project: { del: vi.fn().mockResolvedValue({ code: 0 }) },
    };
    const { deleteProject, projects } = useProjectList();
    projects.value = [{ id: "p1" }, { id: "p2" }];
    const ok = await deleteProject("p1");
    expect(ok).toBe(true);
    expect(projects.value.length).toBe(1);
  });
});

describe("useLiveBoard", () => {
  beforeEach(() => { setActivePinia(createPinia()); delete window.electronAPI; });

  it("subscribe() does nothing when projectId is null", async () => {
    const { subscribe, board } = useLiveBoard(ref(null));
    await subscribe();
    expect(board.value).toBeNull();
  });

  it("subscribe() calls board.subscribe and registers onUpdate", async () => {
    const boardState = { projectId: "p1", status: "running" };
    const onUpdateFn = vi.fn().mockReturnValue(() => {});
    window.electronAPI = {
      board: {
        subscribe: vi.fn().mockResolvedValue({ subscribed: true, initial: boardState }),
        onUpdate: onUpdateFn,
      },
    };
    const { subscribe, board } = useLiveBoard(ref("p1"));
    await subscribe();
    expect(board.value).toEqual(boardState);
    expect(onUpdateFn).toHaveBeenCalled();
  });

  it("subscribe() handles ref to constant", async () => {
    window.electronAPI = {
      board: {
        subscribe: vi.fn().mockResolvedValue({ subscribed: true }),
        onUpdate: vi.fn().mockReturnValue(() => {}),
      },
    };
    const { subscribe } = useLiveBoard("p1");
    await subscribe();
    // 验证 subscribe 被调用
    expect(window.electronAPI.board.subscribe).toHaveBeenCalledWith("p1");
  });

  it("onUpdate callback updates board state", async () => {
    let updateCallback = null;
    const onUpdateFn = vi.fn().mockImplementation((cb) => {
      updateCallback = cb;
      return () => {};
    });
    const initial = { projectId: "p1", status: "running", stages: [] };
    window.electronAPI = {
      board: {
        subscribe: vi.fn().mockResolvedValue({ subscribed: true, initial }),
        onUpdate: onUpdateFn,
      },
    };
    const { subscribe, board } = useLiveBoard(ref("p1"));
    await subscribe();
    expect(board.value).toEqual(initial);

    // 模拟推送更新
    const updated = { ...initial, status: "completed" };
    updateCallback(updated);
    expect(board.value).toEqual(updated);
  });

  it("unsubscribe() clears state and calls unsubUpdate", async () => {
    const unsubUpdate = vi.fn();
    const onUpdateFn = vi.fn().mockReturnValue(unsubUpdate);
    window.electronAPI = {
      board: {
        subscribe: vi.fn().mockResolvedValue({ subscribed: true }),
        onUpdate: onUpdateFn,
        unsubscribe: vi.fn().mockResolvedValue({}),
      },
    };
    const { subscribe, unsubscribe, board } = useLiveBoard(ref("p1"));
    await subscribe();
    board.value = { projectId: "p1" };
    await unsubscribe();
    expect(unsubUpdate).toHaveBeenCalled();
    expect(window.electronAPI.board.unsubscribe).toHaveBeenCalled();
    expect(board.value).toBeNull();
  });

  it("refresh() calls fetchBoard", async () => {
    const boardState = { projectId: "p1", status: "running" };
    window.electronAPI = {
      board: {
        get: vi.fn().mockResolvedValue({ code: 0, data: boardState }),
      },
    };
    const { refresh, board } = useLiveBoard(ref("p1"));
    await refresh();
    expect(board.value).toEqual(boardState);
  });

  it("refresh() does nothing when projectId is null", async () => {
    const { refresh, board } = useLiveBoard(ref(null));
    await refresh();
    expect(board.value).toBeNull();
  });

  it("unsubscribe without subscribe is safe", async () => {
    const { unsubscribe } = useLiveBoard(ref("p1"));
    // 不应抛错
    await unsubscribe();
  });
});

describe("useApprovalFlow", () => {
  beforeEach(() => { setActivePinia(createPinia()); delete window.electronAPI; });

  it("returns reactive state from store", () => {
    const { pendingApprovals, hasPending, currentApproval, approve, reject, dismiss, addApproval } = useApprovalFlow();
    expect(pendingApprovals.value).toEqual([]);
    expect(hasPending.value).toBe(false);
    expect(currentApproval.value).toBeNull();
    expect(typeof approve).toBe("function");
    expect(typeof reject).toBe("function");
    expect(typeof dismiss).toBe("function");
    expect(typeof addApproval).toBe("function");
  });

  it("addApproval() adds pending", () => {
    const { addApproval, pendingApprovals, hasPending, currentApproval } = useApprovalFlow();
    addApproval({ id: "a1", stage: "scenes" });
    expect(pendingApprovals.value.length).toBe(1);
    expect(hasPending.value).toBe(true);
    expect(currentApproval.value.id).toBe("a1");
  });

  it("currentApproval returns first pending", () => {
    const { addApproval, currentApproval } = useApprovalFlow();
    addApproval({ id: "a1" });
    addApproval({ id: "a2" });
    expect(currentApproval.value.id).toBe("a1");
  });

  it("approve() without API removes from list", async () => {
    const { addApproval, approve, pendingApprovals, hasPending } = useApprovalFlow();
    addApproval({ id: "a1" });
    const ok = await approve("a1");
    expect(ok).toBe(true);
    expect(pendingApprovals.value.length).toBe(0);
    expect(hasPending.value).toBe(false);
  });

  it("approve() with API calls approval.approve", async () => {
    const approveFn = vi.fn().mockResolvedValue({ code: 0 });
    window.electronAPI = { approval: { approve: approveFn } };
    const { addApproval, approve } = useApprovalFlow();
    addApproval({ id: "a1" });
    const ok = await approve("a1");
    expect(ok).toBe(true);
    expect(approveFn).toHaveBeenCalledWith("a1");
  });

  it("reject() with API calls approval.reject with reason", async () => {
    const rejectFn = vi.fn().mockResolvedValue({ code: 0 });
    window.electronAPI = { approval: { reject: rejectFn } };
    const { addApproval, reject } = useApprovalFlow();
    addApproval({ id: "a1" });
    const ok = await reject("a1", "bad quality");
    expect(ok).toBe(true);
    expect(rejectFn).toHaveBeenCalledWith("a1", "bad quality");
  });

  it("dismiss() sets lastApprovalDismissed", () => {
    const store = useBacklotStore();
    store.lastApprovalDismissed = false;
    const { dismiss } = useApprovalFlow();
    dismiss();
    expect(store.lastApprovalDismissed).toBe(true);
  });
});
