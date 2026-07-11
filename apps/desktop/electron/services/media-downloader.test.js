/**
 * MediaDownloader ? ????????
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

const {
  getExtensionFromContentType,
  getFileNameFromDisposition,
  ensureUniqueFilePath,
  downloadMedia,
} = require("../services/media-downloader");

describe("MediaDownloader", () => {
  describe("getExtensionFromContentType", () => {
    it("returns .mp4 for video/mp4", () => {
      expect(getExtensionFromContentType("video/mp4")).toBe(".mp4");
    });
    it("returns .jpg for image/jpeg", () => {
      expect(getExtensionFromContentType("image/jpeg")).toBe(".jpg");
    });
    it("returns .png for image/png", () => {
      expect(getExtensionFromContentType("image/png")).toBe(".png");
    });
    it("returns .webm for video/webm", () => {
      expect(getExtensionFromContentType("video/webm")).toBe(".webm");
    });
    it("returns .bin for unknown type", () => {
      expect(getExtensionFromContentType("application/octet-stream")).toBe(".bin");
    });
    it("returns .bin for empty input", () => {
      expect(getExtensionFromContentType("")).toBe(".bin");
      expect(getExtensionFromContentType(null)).toBe(".bin");
      expect(getExtensionFromContentType(undefined)).toBe(".bin");
    });
  });

  describe("getFileNameFromDisposition", () => {
    it("extracts filename from inline", () => {
      expect(getFileNameFromDisposition('inline; filename="video.mp4"')).toBe("video.mp4");
    });
    it("extracts filename from attachment", () => {
      expect(getFileNameFromDisposition('attachment; filename="cover.jpg"')).toBe("cover.jpg");
    });
    it("extracts RFC 5987 filename", () => {
      const result = getFileNameFromDisposition("attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.mp4");
      expect(result).toBe("\u6587\u4ef6.mp4");
    });
    it("returns null when no filename", () => {
      expect(getFileNameFromDisposition("attachment")).toBeNull();
      expect(getFileNameFromDisposition("")).toBeNull();
      expect(getFileNameFromDisposition(null)).toBeNull();
    });
    it("prefers filename* over filename", () => {
      const result = getFileNameFromDisposition('attachment; filename="old.mp4"; filename*=UTF-8\'\'new.mp4');
      expect(result).toBe("new.mp4");
    });
  });

  describe("ensureUniqueFilePath", () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediadl-test-"));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    it("returns original path when file does not exist", () => {
      const p = path.join(tmpDir, "video.mp4");
      expect(ensureUniqueFilePath(p)).toBe(p);
    });
    it("adds (1) when file exists", () => {
      const p = path.join(tmpDir, "video.mp4");
      fs.writeFileSync(p, "dummy");
      expect(ensureUniqueFilePath(p)).toBe(path.join(tmpDir, "video (1).mp4"));
    });
    it("increments suffix on multiple conflicts", () => {
      const p = path.join(tmpDir, "video.mp4");
      fs.writeFileSync(p, "dummy");
      fs.writeFileSync(path.join(tmpDir, "video (1).mp4"), "dummy");
      fs.writeFileSync(path.join(tmpDir, "video (2).mp4"), "dummy");
      expect(ensureUniqueFilePath(p)).toBe(path.join(tmpDir, "video (3).mp4"));
    });
    it("handles file without extension", () => {
      const p = path.join(tmpDir, "video");
      fs.writeFileSync(p, "dummy");
      expect(ensureUniqueFilePath(p)).toBe(path.join(tmpDir, "video (1)"));
    });
  });

  describe("downloadMedia", () => {
    it("throws when destDir does not exist", async () => {
      const nonExistentDir = path.join(os.tmpdir(), "nonexistent-dir-12345-test");
      await expect(downloadMedia("http://example.com/v.mp4", nonExistentDir)).rejects.toThrow(/does not exist/);
    });
    it("throws when signal is already aborted", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediadl-test-"));
      const ac = new AbortController();
      ac.abort();
      await expect(downloadMedia("http://example.com/v.mp4", tmpDir, { signal: ac.signal })).rejects.toThrow(/aborted/);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
