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
});

