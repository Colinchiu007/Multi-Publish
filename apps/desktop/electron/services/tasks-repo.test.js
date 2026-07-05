import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const path = require("path");
const fs = require("fs");
const os = require("os");

vi.mock("../services/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const { TasksRepo, TASK_STATUS } = require("../services/tasks-repo");

describe("TasksRepo", () => {
  let repo;
  let dbPath;

  beforeEach(async () => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tasks-repo-test-")), "test.db");
    repo = new TasksRepo(dbPath);
    await repo.init();
  });

  afterEach(() => {
    repo.close();
    try { fs.rmSync(path.dirname(dbPath), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  });

  describe("constants", () => {
    it("defines all 6 task statuses", () => {
      expect(TASK_STATUS).toEqual({
        PENDING: "pending",
        RUNNING: "running",
        COMPLETED: "completed",
        FAILED: "failed",
        CANCELED: "canceled",
        PAUSED: "paused",
      });
    });
  });

  describe("init", () => {
    it("creates the tasks table", () => {
      const tasks = repo.list();
      expect(Array.isArray(tasks)).toBe(true);
    });
    it("is idempotent", async () => {
      await expect(repo.init()).resolves.toBeUndefined();
    });
  });

  describe("create", () => {
    it("creates a task with required fields", () => {
      const task = repo.create({ type: "publish", platform: "wx", payload: { title: "test" } });
      expect(task.id).toBeDefined();
      expect(task.type).toBe("publish");
      expect(task.platform).toBe("wx");
      expect(task.status).toBe(TASK_STATUS.PENDING);
    });
    it("creates task with once schedule", () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      const task = repo.create({ type: "publish", schedule: { type: "once", runAt: future } });
      expect(task.schedule.type).toBe("once");
    });
    it("creates task with interval schedule", () => {
      const task = repo.create({ type: "monitor", schedule: { type: "interval", intervalMs: 60000 } });
      expect(task.schedule.type).toBe("interval");
    });
    it("generates unique IDs", () => {
      const t1 = repo.create({ type: "publish" });
      const t2 = repo.create({ type: "publish" });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  describe("get / updateStatus", () => {
    it("gets a task by ID", () => {
      const created = repo.create({ type: "publish" });
      expect(repo.get(created.id).id).toBe(created.id);
    });
    it("returns null for non-existent ID", () => {
      expect(repo.get("nonexistent")).toBeNull();
    });
    it("updates task status", () => {
      const task = repo.create({ type: "publish" });
      repo.updateStatus(task.id, TASK_STATUS.RUNNING);
      expect(repo.get(task.id).status).toBe(TASK_STATUS.RUNNING);
    });
    it("updates partial fields", () => {
      const task = repo.create({ type: "publish" });
      repo.updateStatus(task.id, TASK_STATUS.RUNNING, { progress: 50, message: "processing" });
      expect(repo.get(task.id).progress).toBe(50);
      expect(repo.get(task.id).message).toBe("processing");
    });
  });

  describe("list", () => {
    it("lists all tasks", () => {
      repo.create({ type: "publish" });
      repo.create({ type: "monitor" });
      expect(repo.list().length).toBe(2);
    });
    it("filters by status", () => {
      const t1 = repo.create({ type: "publish" });
      repo.create({ type: "monitor" });
      repo.updateStatus(t1.id, TASK_STATUS.RUNNING);
      expect(repo.list({ status: TASK_STATUS.PENDING }).length).toBe(1);
    });
    it("filters by type", () => {
      repo.create({ type: "publish" });
      repo.create({ type: "monitor" });
      expect(repo.list({ type: "publish" }).length).toBe(1);
    });
  });

  describe("findDueSchedules", () => {
    it("finds past-due once tasks", () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const task = repo.create({ type: "publish", schedule: { type: "once", runAt: past } });
      expect(repo.findDueSchedules().some(function (t) { return t.id === task.id; })).toBe(true);
    });
    it("ignores future once tasks", () => {
      repo.create({ type: "publish", schedule: { type: "once", runAt: new Date(Date.now() + 3600000).toISOString() } });
      expect(repo.findDueSchedules().length).toBe(0);
    });
    it("finds interval tasks with past nextRun", () => {
      const task = repo.create({ type: "monitor", schedule: { type: "interval", intervalMs: 60000 } });
      repo.updateStatus(task.id, TASK_STATUS.RUNNING, { nextRun: new Date(Date.now() - 10000).toISOString() });
      expect(repo.findDueSchedules().some(function (t) { return t.id === task.id; })).toBe(true);
    });
    it("ignores completed tasks", () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const task = repo.create({ type: "publish", schedule: { type: "once", runAt: past } });
      repo.updateStatus(task.id, TASK_STATUS.COMPLETED);
      expect(repo.findDueSchedules().length).toBe(0);
    });
  });

  describe("statistics", () => {
    it("returns task statistics", () => {
      const t1 = repo.create({ type: "publish" });
      repo.create({ type: "monitor" });
      repo.updateStatus(t1.id, TASK_STATUS.COMPLETED);
      const stats = repo.statistics();
      expect(stats.total).toBe(2);
      expect(stats.by_status[TASK_STATUS.PENDING]).toBe(1);
      expect(stats.by_status[TASK_STATUS.COMPLETED]).toBe(1);
    });
  });

  describe("remove", () => {
    it("removes a task by ID", () => {
      const task = repo.create({ type: "publish" });
      expect(repo.remove(task.id)).toBe(true);
      expect(repo.get(task.id)).toBeNull();
    });
    it("returns false for non-existent task", () => {
      expect(repo.remove("nonexistent")).toBe(false);
    });
  });

  describe("cancel / pause / resume", () => {
    it("cancels a pending task", () => {
      const task = repo.create({ type: "publish" });
      expect(repo.cancel(task.id)).toBe(true);
      expect(repo.get(task.id).status).toBe(TASK_STATUS.CANCELED);
    });
    it("pauses and resumes a running task", () => {
      const task = repo.create({ type: "publish" });
      repo.updateStatus(task.id, TASK_STATUS.RUNNING);
      expect(repo.pause(task.id)).toBe(true);
      expect(repo.get(task.id).status).toBe(TASK_STATUS.PAUSED);
      expect(repo.resume(task.id)).toBe(true);
      expect(repo.get(task.id).status).toBe(TASK_STATUS.RUNNING);
    });
    it("cannot cancel completed task", () => {
      const task = repo.create({ type: "publish" });
      repo.updateStatus(task.id, TASK_STATUS.COMPLETED);
      expect(repo.cancel(task.id)).toBe(false);
    });
  });
});