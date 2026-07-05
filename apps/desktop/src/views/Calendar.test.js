import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/stores/platforms", () => ({
  usePlatformStore: () => ({
    load: vi.fn(),
    getLabel: (k) => k,
  })
}));

import CalendarView from "./Calendar.vue";

describe("CalendarView", () => {
  beforeEach(() => {
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
    expect(w.vm.selectedDate).toBe(now.toISOString().slice(0, 10));
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
    expect(todayEntry.isCurrentMonth).toBe(true);
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
    await new Promise(r => setTimeout(r, 10));
    await nextTick();
    expect(window.electronAPI.schedulerList).toHaveBeenCalled();
    expect(window.electronAPI.historyList).toHaveBeenCalled();
  });

  it("getEventsForDate returns sorted events", async () => {
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    var dateStr = new Date().toISOString().slice(0, 10);
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
    expect(w.vm.formatEventTime({ publishTime: "2026-07-15T14:30:00Z" })).toBe("14:30");
    expect(w.vm.formatEventTime({ timestamp: "2026-07-15T08:05:00Z" })).toBe("08:05");
    expect(w.vm.formatEventTime({})).toBe("");
  });

  it("history without api silently handles", async () => {
    delete window.electronAPI;
    const w = mount(CalendarView, { global: { plugins: [createPinia()] } });
    await nextTick();
    expect(w.vm.loading).toBe(false);
  });
});

