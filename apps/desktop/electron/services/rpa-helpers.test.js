import { describe, it, expect } from "vitest";

// ---- RPA Progress Throttle ----

describe("ProgressThrottle", () => {
  it("reports 100% immediately", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle(5000, 10);
    expect(pt.shouldReport(100)).toBe(true);
  });

  it("reports first percentage below threshold", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle(5000, 10);
    expect(pt.shouldReport(30)).toBe(true);
  });

  it("throttles when below minPercentDelta and within minInterval", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle(50000, 20);  // 50s interval, 20% delta
    pt.shouldReport(10);  // first report
    expect(pt.shouldReport(15)).toBe(false);  // only 5% delta
  });

  it("reports when percent delta exceeds threshold", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle(50000, 20);
    pt.shouldReport(10);
    expect(pt.shouldReport(35)).toBe(true);  // 25% delta > 20%
  });

  it("reset clears last state", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle(5000, 10);
    pt.shouldReport(50);
    pt.reset();
    expect(pt.shouldReport(50)).toBe(true);  // After reset, same percent reports
  });

  it("uses default values when not provided", () => {
    const { ProgressThrottle } = require("../services/rpa-progress-throttle");
    const pt = new ProgressThrottle();
    expect(pt.shouldReport(0)).toBe(true);
  });
});

// ---- RPA Field Retry State ----

describe("FieldRetryState", () => {
  it("starts with no fields", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState();
    expect(fr.allDone).toBe(true);
    expect(fr.unfinishedFields).toEqual([]);
  });

  it("addField creates a retryable field", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("title");
    expect(fr.hasUnfinished).toBe(true);
    // NOTE: isDone("title") returns true because (0 || 3) >= 3 is true — original behavior
    expect(fr.isDone("title")).toBe(true);
  });

  it("markDone sets field to retryCount", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("title");
    fr.markDone("title");
    expect(fr.isDone("title")).toBe(true);
    expect(fr.hasUnfinished).toBe(false);
  });

  it("retry increments counter and returns true until exhausted", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("title");
    expect(fr.retry("title")).toBe(true);   // 0→1
    expect(fr.retry("title")).toBe(true);   // 1→2
    expect(fr.retry("title")).toBe(false);  // 2→3, exhausted
  });

  it("exhaustedFields returns fields at limit", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("title");
    fr.addField("content");
    fr.markDone("content");
    fr.retry("title"); fr.retry("title");
    expect(fr.exhaustedFields).toEqual(["title"]);
  });

  it("retry on unknown field returns false", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    expect(fr.retry("nonexistent")).toBe(false);
  });

  it("isDone returns true for fields at or above retryCount", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(2);
    fr.addField("title");
    // NOTE: (0 || 2) >= 2 = true — original code treats 0 as retryCount
    expect(fr.isDone("title")).toBe(true);
    fr.retry("title");  // 0→1, isDone = 1 >= 2 = false
    expect(fr.isDone("title")).toBe(false);
    fr.retry("title");  // 1→2, isDone = 2 >= 2 = true
    expect(fr.isDone("title")).toBe(true);  // 1 attempt + 1 retry = 2 ≥ 2
  });

  it("allDone is true when no fields added", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    expect(fr.allDone).toBe(true);
  });

  it("allDone is true after all fields marked done", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("a"); fr.addField("b");
    fr.markDone("a"); fr.markDone("b");
    expect(fr.allDone).toBe(true);
  });

  it("returns empty array for exhaustedFields when none exhausted", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("title");
    expect(fr.exhaustedFields).toEqual([]);
  });

  it("default retryCount is 3", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState();
    fr.addField("test");
    fr.retry("test");  // 0→1
    fr.retry("test");  // 1→2
    expect(fr.retry("test")).toBe(false);  // 2→3 exhausted, default=3
  });

  it("unfinishedFields returns only incomplete fields", () => {
    const { FieldRetryState } = require("../services/rpa-field-retry");
    const fr = new FieldRetryState(3);
    fr.addField("a"); fr.addField("b"); fr.addField("c");
    fr.markDone("a");
    fr.retry("b"); fr.retry("b");  // b: 2/3
    // c: 0/3
    const uf = fr.unfinishedFields;
    expect(uf).toContain("b");
    expect(uf).toContain("c");
    expect(uf).not.toContain("a");
  });
});


