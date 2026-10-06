import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (k) => k,
  })
}));

const notifyConfirmMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyErrorMock = vi.fn();
vi.mock("@/composables/useNotify", () => ({
  useNotify: () => ({
    notify: vi.fn(),
    notifyError: notifyErrorMock,
    notifySuccess: notifySuccessMock,
    notifyWarning: vi.fn(),
    notifyInfo: vi.fn(),
    notifyConfirm: notifyConfirmMock,
  }),
}));

import CalendarView from "./Calendar.vue";

const originalTimeZone = process.env.TZ;
const FIXED_NOW = new Date("2026-07-15T08:00:00.000Z");

beforeAll(() => {
  process.env.TZ = "Asia/Shanghai";
});

afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      schedulerList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    };
  });

  it("renders page title", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("发布日历");
  });
});

describe("CalendarView — full coverage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    setActivePinia(createPinia());
    window.electronAPI = {
      schedulerList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [] } }),
    };
  });

  it("renders navigation buttons", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.text()).toContain("◀");
    expect(w.text()).toContain("▶");
    expect(w.text()).toContain("今天");
  });

  it("shows current month label", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    const now = new Date();
    expect(w.vm.currentMonthLabel).toContain(now.getFullYear() + " 年");
    expect(w.vm.currentMonthLabel).toContain((now.getMonth() + 1) + " 月");
  });

  it("prevMonth goes to previous month", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    var initialMonth = w.vm.currentMonth;
    w.vm.prevMonth();
    expect(w.vm.currentMonth).toBe(initialMonth === 0 ? 11 : initialMonth - 1);
  });

  it("nextMonth goes to next month", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    var initialMonth = w.vm.currentMonth;
    w.vm.nextMonth();
    expect(w.vm.currentMonth).toBe(initialMonth === 11 ? 0 : initialMonth + 1);
  });

  it("today resets to current date and selects today", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.currentYear = 2020;
    w.vm.currentMonth = 0;
    w.vm.today();
    var now = new Date();
    expect(w.vm.currentYear).toBe(now.getFullYear());
    expect(w.vm.currentMonth).toBe(now.getMonth());
    expect(w.vm.selectedDate).toBe("2026-07-15");
  });

  it("selectDay sets selectedDate", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.selectDay({ dateStr: "2026-07-15" });
    expect(w.vm.selectedDate).toBe("2026-07-15");
  });

  it("selectedDateLabel formats date", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.selectedDate = "2026-07-15";
    expect(w.vm.selectedDateLabel).toBe("2026/07/15");
  });

  it("calendarDays returns 42 entries", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.calendarDays.length).toBe(42);
  });

  it("calendarDays marks today", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    var todayEntry = w.vm.calendarDays.find(d => d.isToday);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.day).toBe(15);
    expect(todayEntry.dateStr).toBe("2026-07-15");
    expect(todayEntry.isCurrentMonth).toBe(true);
  });

  it("uses local calendar keys for cells and timestamped events", async () => {
    window.electronAPI = {};
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    const scheduledAt = "2026-07-15T00:15";
    const publishedAt = "2026-07-14T16:30:00.000Z";
    w.vm.currentYear = 2026;
    w.vm.currentMonth = 6;
    w.vm.scheduledTasks = [{ id: "s1", title: "Scheduled", publishTime: scheduledAt, platform: "weixin" }];
    w.vm.publishHistory = [{ id: "h1", title: "Published", timestamp: publishedAt, success: true, platform: "weixin" }];
    await nextTick();

    const dayEntry = w.vm.calendarDays.find(day => day.isCurrentMonth && day.day === 15);
    expect(dayEntry.dateStr).toBe("2026-07-15");
    expect(dayEntry.events.map(event => event.type)).toEqual(["scheduled", "success"]);
    expect(w.vm.formatEventTime(dayEntry.events[0])).toBe("00:15");
    expect(w.vm.formatEventTime(dayEntry.events[1])).toBe("00:30");
  });

  it("today moves the calendar to the new local month after midnight", async () => {
    vi.setSystemTime(new Date("2026-07-31T15:59:59.000Z"));
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();

    vi.setSystemTime(new Date("2026-07-31T16:00:01.000Z"));
    w.vm.today();
    await nextTick();

    const todayEntry = w.vm.calendarDays.find(day => day.isToday);
    expect(w.vm.currentMonth).toBe(7);
    expect(w.vm.selectedDate).toBe("2026-08-01");
    expect(todayEntry.dateStr).toBe("2026-08-01");
    expect(todayEntry.isCurrentMonth).toBe(true);
  });

  it("rejects impossible and unsupported calendar dates without showing them on another day", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    for (const invalidDate of ["2026-02-30", "2026-02-30T10:00", "2026-07-15T24:00", "2026-2-5", "2026/02/30", "2026/07/15 24:00", "February 30, 2026"]) {
      expect(w.vm.toCalendarDateKey(invalidDate)).toBe("");
    }

    w.vm.scheduledTasks = [{ id: "invalid", title: "Invalid", publishTime: "2026/07/15 24:00", platform: "weixin" }];
    await nextTick();
    const nextDay = w.vm.calendarDays.find(day => day.isCurrentMonth && day.day === 16);
    expect(nextDay.events).toEqual([]);
  });

  it("shows empty state for selected date with no events", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.selectedDate = "2026-07-15";
    await nextTick();
    expect(w.text()).toContain("暂无发布记录");
  });

  it("displays scheduled events on calendar", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    w.vm.scheduledTasks = [{ id: "s1", title: "Scheduled Post", publishTime: new Date().toISOString(), platform: "weixin" }];
    await nextTick();
    var dayWithEvent = w.vm.calendarDays.find(d => d.events.length > 0);
    expect(dayWithEvent).toBeDefined();
  });

  it("loadData loads scheduler and history", async () => {
    window.electronAPI = {
      schedulerList: vi.fn().mockResolvedValue({ code: 0, data: [{ id: "s1", title: "Test" }] }),
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [{ id: "h1", title: "History" }] } }),
    };
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    await vi.runAllTimersAsync();
    await nextTick();
    expect(window.electronAPI.schedulerList).toHaveBeenCalled();
    expect(window.electronAPI.historyList).toHaveBeenCalled();
  });

  it("getEventsForDate returns sorted events", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    var dateStr = "2026-07-15";
    w.vm.scheduledTasks = [{ id: "s1", title: "Scheduled", publishTime: dateStr + "T10:00:00" }];
    w.vm.publishHistory = [{ id: "h1", title: "History", timestamp: dateStr + "T09:00:00", success: true }];
    var events = w.vm.getEventsForDate(dateStr);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("success");
    expect(events[1].type).toBe("scheduled");
  });

  it("formatEventTime extracts HH:MM from timestamp", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.formatEventTime({ publishTime: "2026-07-15T14:30:00Z" })).toBe("22:30");
    expect(w.vm.formatEventTime({ timestamp: "2026-07-15T08:05:00Z" })).toBe("16:05");
    expect(w.vm.formatEventTime({})).toBe("");
  });

  it("history without api silently handles", async () => {
    delete window.electronAPI;
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.loading).toBe(false);
  });
});

describe("CalendarView — 定时任务取消（排期管理闭环）", () => {
  let schedulerCancel;
  let schedulerList;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.clearAllMocks();
    setActivePinia(createPinia());
    notifyConfirmMock.mockResolvedValue(true);
    schedulerList = vi.fn().mockResolvedValue({ code: 0, data: [] });
    schedulerCancel = vi.fn().mockResolvedValue({ code: 0, data: true });
    window.electronAPI = {
      schedulerList,
      schedulerCancel,
      historyList: vi.fn().mockResolvedValue({ code: 0, data: { records: [] } }),
    };
  });

  async function mountWithPendingTask(task) {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    // 先让 onMounted 的 loadData（异步 schedulerList/historyList 回写
    // scheduledTasks/publishHistory）完成，避免它覆盖测试随后设置的 vm 数据。
    await nextTick();
    await vi.runAllTimersAsync();
    await nextTick();
    return w;
  }

  async function selectScheduledDay(w) {
    w.vm.currentYear = 2026;
    w.vm.currentMonth = 6;
    w.vm.scheduledTasks = [{
      id: "sched-1",
      title: "定时文章",
      publishTime: "2026-07-15T10:00:00",
      platform: "weixin",
      status: "pending",
    }];
    w.vm.selectedDate = "2026-07-15";
    await nextTick();
    return w;
  }

  it("pending 定时事件显示取消按钮，点击后确认并调用 schedulerCancel，成功后刷新列表", async () => {
    const w = await mountWithPendingTask();
    await selectScheduledDay(w);
    const listCallsBefore = schedulerList.mock.calls.length;

    const button = w.find('[data-testid="cancel-schedule-sched-1"]');
    expect(button.exists()).toBe(true);
    await button.trigger("click");
    await vi.runAllTimersAsync();
    await nextTick();

    expect(notifyConfirmMock).toHaveBeenCalled();
    expect(schedulerCancel).toHaveBeenCalledWith("sched-1");
    expect(schedulerList.mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(notifySuccessMock).toHaveBeenCalled();
  });

  it("确认弹窗被取消时不调用 schedulerCancel", async () => {
    notifyConfirmMock.mockResolvedValue(false);
    const w = await mountWithPendingTask();
    await selectScheduledDay(w);

    await w.find('[data-testid="cancel-schedule-sched-1"]').trigger("click");
    await nextTick();

    expect(schedulerCancel).not.toHaveBeenCalled();
  });

  it("schedulerCancel 返回失败时提示错误且不刷新", async () => {
    schedulerCancel.mockResolvedValue({ code: -1, message: "任务不存在" });
    const w = await mountWithPendingTask();
    await selectScheduledDay(w);
    const listCallsBefore = schedulerList.mock.calls.length;

    await w.find('[data-testid="cancel-schedule-sched-1"]').trigger("click");
    await vi.runAllTimersAsync();
    await nextTick();

    expect(notifyErrorMock).toHaveBeenCalled();
    expect(schedulerList.mock.calls.length).toBe(listCallsBefore);
  });

  it("历史事件（success/failed）不显示取消按钮", async () => {
    const w = await mountWithPendingTask();
    await selectScheduledDay(w);
    w.vm.publishHistory = [{ id: "h1", title: "已发布", timestamp: "2026-07-15T09:00:00", success: true, platform: "weixin" }];
    await nextTick();

    expect(w.find('[data-testid="cancel-schedule-h1"]').exists()).toBe(false);
  });

  it("非 pending 状态的定时条目不显示取消按钮（executed 已进历史，cancelled 不再可取消）", async () => {
    const w = await mountWithPendingTask();
    w.vm.currentYear = 2026;
    w.vm.currentMonth = 6;
    w.vm.scheduledTasks = [
      { id: "sched-done", title: "已执行", publishTime: "2026-07-15T10:00:00", platform: "weixin", status: "executed" },
      { id: "sched-cancelled", title: "已取消", publishTime: "2026-07-15T11:00:00", platform: "weixin", status: "cancelled" },
    ];
    w.vm.selectedDate = "2026-07-15";
    await nextTick();

    expect(w.find('[data-testid="cancel-schedule-sched-done"]').exists()).toBe(false);
    expect(w.find('[data-testid="cancel-schedule-sched-cancelled"]').exists()).toBe(false);
  });

  it("cancelled/executed 状态的定时条目不再渲染为 ⏰ 待发事件（避免已取消任务仍显示为待发布）", async () => {
    const w = await mountWithPendingTask();
    w.vm.currentYear = 2026;
    w.vm.currentMonth = 6;
    w.vm.scheduledTasks = [
      { id: "sched-pending", title: "待发布", publishTime: "2026-07-15T10:00:00", platform: "weixin", status: "pending" },
      { id: "sched-cancelled", title: "已取消", publishTime: "2026-07-15T11:00:00", platform: "weixin", status: "cancelled" },
      { id: "sched-executed", title: "已执行", publishTime: "2026-07-15T12:00:00", platform: "weixin", status: "executed" },
    ];
    w.vm.selectedDate = "2026-07-15";
    await nextTick();

    const events = w.vm.getEventsForDate("2026-07-15");
    expect(events.map(e => e.id)).toEqual(["sched-pending"]);
  });

  it("无 id 的定时条目不渲染取消按钮（防御脏数据）", async () => {
    const w = await mountWithPendingTask();
    w.vm.currentYear = 2026;
    w.vm.currentMonth = 6;
    w.vm.scheduledTasks = [{ title: "无 ID", publishTime: "2026-07-15T10:00:00", platform: "weixin", status: "pending" }];
    w.vm.selectedDate = "2026-07-15";
    await nextTick();

    const buttons = w.findAll('[data-testid^="cancel-schedule-"]');
    expect(buttons.length).toBe(0);
  });

  // 定时任务到点但入队失败时，用户必须在界面上看到——旧实现零可见性。
  describe("定时派发失败实时提示", () => {
    it("收到 scheduler 派发失败信号时弹错误提示并刷新日历数据", async () => {
      let captured = null;
      window.electronAPI.onSchedulerDispatchFailed = vi.fn((cb) => {
        captured = cb;
        return () => {};
      });
      const w = await mountWithPendingTask();
      expect(typeof captured).toBe("function");

      window.electronAPI.schedulerList.mockClear();
      captured({ id: "sched-x", platform: "weixin", publishTime: "2026-07-15T10:00:00", reason: "队列已暂停", stage: "enqueue" });
      await nextTick();

      expect(notifyErrorMock).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.schedulerList).toHaveBeenCalled();
      w.unmount();
    });

    it("卸载时解除监听，避免内存泄漏与幽灵提示", async () => {
      const cleanup = vi.fn();
      window.electronAPI.onSchedulerDispatchFailed = vi.fn(() => cleanup);
      const w = await mountWithPendingTask();

      w.unmount();
      await nextTick();

      expect(cleanup).toHaveBeenCalled();
    });

    it("preload 未暴露监听能力时不报错（老版本兼容）", async () => {
      delete window.electronAPI.onSchedulerDispatchFailed;
      const w = await mountWithPendingTask();
      expect(w.exists()).toBe(true);
      w.unmount();
    });

    // P0：cancel 返回 data=false 表示「没取消掉」，重试无意义，必须区分文案
    it("取消返回 data=false 时提示「无法取消」而非「失败请重试」，并刷新日历", async () => {
      const w = await mountWithPendingTask();
      w.vm.cancelledScheduleResult = undefined;
      window.electronAPI.schedulerCancel = vi.fn().mockResolvedValue({ code: 0, data: false });
      window.electronAPI.schedulerList.mockClear();

      await w.vm.cancelSchedule({ type: "scheduled", id: "sched-pending" });
      await nextTick();

      expect(notifyErrorMock).toHaveBeenCalledWith(
        "calendarPage.scheduleCancelledUncancellable",
        expect.objectContaining({ fallback: expect.any(String) })
      );
      expect(notifySuccessMock).not.toHaveBeenCalled();
      expect(window.electronAPI.schedulerList).toHaveBeenCalled();
      w.unmount();
    });
  });

  // 批量排期此前唯一取消入口是发布页会话内的 scheduledBatchId（内存态），
  // 离开页面即丢，日历也只渲染 scheduler:* 任务 → 排期批次无法取消。
  describe("批量排期取消入口", () => {
    const mountWithBatch = async (batches) => {
      window.electronAPI.batchList = vi.fn().mockResolvedValue({ code: 0, data: batches });
      const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
      await vi.runAllTimersAsync();
      return w;
    };

    // 批次必须含带 publishTime 的文章才会渲染（全部立即发布的批次不渲染为待发事件）
    const scheduledBatch = (id, overrides = {}) => ({
      id,
      status: "scheduled",
      created_at: "2026-07-15T08:00:00",
      article_count: 2,
      articles: [
        { publishTime: "2026-07-15T10:00:00", platform: "weixin" },
        { publishTime: "2026-07-15T18:00:00", platform: "zhihu" },
      ],
      ...overrides,
    });

    it("加载时读取 batchList 并把 scheduled 批次渲染为可取消事件", async () => {
      const w = await mountWithBatch([scheduledBatch("batch-1")]);

      expect(window.electronAPI.batchList).toHaveBeenCalled();
      const events = w.vm.getEventsForDate("2026-07-15");
      expect(events.some(e => e.type === "scheduled-batch" && e.id === "batch-1")).toBe(true);
      w.unmount();
    });

    it("点击取消走 batchCancel，成功后提示并刷新", async () => {
      const w = await mountWithBatch([scheduledBatch("batch-1")]);
      notifyConfirmMock.mockResolvedValue(true);
      window.electronAPI.batchCancel = vi.fn().mockResolvedValue({ code: 0 });
      window.electronAPI.batchList.mockClear();

      await w.vm.cancelScheduledBatch({ type: "scheduled-batch", id: "batch-1" });
      await nextTick();

      expect(window.electronAPI.batchCancel).toHaveBeenCalledWith("batch-1");
      expect(notifySuccessMock).toHaveBeenCalled();
      expect(window.electronAPI.batchList).toHaveBeenCalled();
      w.unmount();
    });

    it("batchCancel 失败时保留提示可重试，且不谎报成功", async () => {
      const w = await mountWithBatch([scheduledBatch("batch-1")]);
      notifyConfirmMock.mockResolvedValue(true);
      window.electronAPI.batchCancel = vi.fn().mockResolvedValue({ code: -1, message: "该批次未在排期中" });

      await w.vm.cancelScheduledBatch({ type: "scheduled-batch", id: "batch-1" });
      await nextTick();

      expect(notifyErrorMock).toHaveBeenCalled();
      expect(notifySuccessMock).not.toHaveBeenCalled();
      w.unmount();
    });

    it("非 scheduled 状态的批次不渲染为待发事件", async () => {
      const w = await mountWithBatch([
        scheduledBatch("batch-done", { status: "completed" }),
        scheduledBatch("batch-cancel", { status: "cancelled" }),
      ]);

      const events = w.vm.getEventsForDate("2026-07-15");
      expect(events.some(e => e.type === "scheduled-batch")).toBe(false);
      w.unmount();
    });

    it("全部文章都无定时时间的批次不渲染为待发事件", async () => {
      const w = await mountWithBatch([
        scheduledBatch("batch-immediate", { articles: [{ platform: "weixin" }], article_count: 1 }),
      ]);

      expect(w.vm.getEventsForDate("2026-07-15").some(e => e.type === "scheduled-batch")).toBe(false);
      w.unmount();
    });

    it("无 batchList 能力时不影响单篇定时渲染（向后兼容）", async () => {
      delete window.electronAPI.batchList;
      const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
      await vi.runAllTimersAsync();
      w.vm.currentYear = 2026;
      w.vm.currentMonth = 6;
      w.vm.scheduledTasks = [{ id: "s1", title: "单篇", publishTime: "2026-07-15T10:00:00", platform: "weixin", status: "pending" }];
      w.vm.selectedDate = "2026-07-15";
      await nextTick();

      expect(w.vm.getEventsForDate("2026-07-15").some(e => e.id === "s1")).toBe(true);
      w.unmount();
    });
  });
});

