/**
 * OSS uploader TDD
 */
const { OssUploader, CHUNK } = require("../src/oss-uploader");

describe("OssUploader", function() {
  var uploader;

  beforeAll(function() {
    uploader = new OssUploader();
  });

  test("exports correct CHUNK size", function() {
    expect(CHUNK).toBe(8 * 1024 * 1024);
  });

  test("is an instance of OssUploader", function() {
    expect(uploader).toBeInstanceOf(OssUploader);
  });

  test("upload throws without file path", async function() {
    await expect(uploader.upload(null, {})).rejects.toThrow();
  });

  test("upload throws without valid upload info", async function() {
    await expect(uploader.upload("nonexistent.mp4", null)).rejects.toThrow();
  });
});
