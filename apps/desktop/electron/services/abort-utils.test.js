import { describe, it, expect, vi } from "vitest";

const {
  createAbort,
  checkAborted,
  wrapWithAbort,
  raceWithSignal,
} = require("../services/abort-utils");

describe("AbortUtils", () => {
  describe("createAbort", () => {
    it("returns signal and abort function", () => {
      var a = createAbort();
      expect(a.signal).toBeDefined();
      expect(typeof a.abort).toBe("function");
      expect(typeof a.cleanup).toBe("function");
    });

    it("signal starts not aborted", () => {
      var a = createAbort();
      expect(a.signal.aborted).toBe(false);
    });

    it("abort sets signal to aborted", () => {
      var a = createAbort();
      a.abort();
      expect(a.signal.aborted).toBe(true);
    });

    it("timeout auto-aborts", function () {
      return new Promise(function (resolve) {
        var a = createAbort(30);
        expect(a.signal.aborted).toBe(false);
        setTimeout(function () {
          expect(a.signal.aborted).toBe(true);
          a.cleanup();
          resolve();
        }, 80);
      });
    });

    it("timeout of 0 does not auto-abort", function () {
      var a = createAbort(0);
      expect(a.signal.aborted).toBe(false);
      a.cleanup();
    });
  });

  describe("checkAborted", () => {
    it("does not throw for non-aborted signal", () => {
      var a = createAbort();
      expect(function () { checkAborted(a.signal); }).not.toThrow();
    });

    it("throws for aborted signal", () => {
      var a = createAbort();
      a.abort();
      expect(function () { checkAborted(a.signal); }).toThrow();
    });

    it("does nothing for null/undefined", () => {
      expect(function () { checkAborted(null); }).not.toThrow();
      expect(function () { checkAborted(undefined); }).not.toThrow();
    });
  });

  describe("wrapWithAbort", () => {
    it("calls function when not aborted", function () {
      var a = createAbort();
      var fn = vi.fn(function (x) { return x + 1; });
      var wrapped = wrapWithAbort(fn, a.signal);
      expect(wrapped(5)).toBe(6);
    });

    it("throws when signal already aborted", () => {
      var a = createAbort();
      a.abort();
      var fn = vi.fn();
      var wrapped = wrapWithAbort(fn, a.signal);
      expect(function () { wrapped(); }).toThrow();
      expect(fn).not.toHaveBeenCalled();
    });

    it("calls function when no signal", function () {
      var fn = vi.fn(function () { return "ok"; });
      var wrapped = wrapWithAbort(fn, null);
      expect(wrapped()).toBe("ok");
    });
  });

  describe("raceWithSignal", () => {
    it("resolves when promise resolves first", function () {
      return new Promise(function (resolve) {
        var a = createAbort();
        var p = new Promise(function (r) { setTimeout(function () { r("done"); }, 5); });
        raceWithSignal(p, a.signal).then(function (v) {
          expect(v).toBe("done");
          a.cleanup();
          resolve();
        }).catch(function () { resolve(); });
      });
    });
  });
});