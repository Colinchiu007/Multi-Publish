/**
 * COS uploader TDD
 */
const { CosUploader, CHUNK } = require("../src/cos-uploader");

describe("CosUploader", function() {
  var uploader;

  beforeAll(function() {
    uploader = new CosUploader();
  });

  test("exports correct CHUNK size", function() {
    expect(CHUNK).toBe(8 * 1024 * 1024);
  });

  test("is an instance of CosUploader", function() {
    expect(uploader).toBeInstanceOf(CosUploader);
  });

  test("upload throws without file path", async function() {
    await expect(uploader.upload(null, { token: "t", fileIds: ["f"] })).rejects.toThrow();
  });

  test("upload throws without valid token", async function() {
    await expect(uploader.upload("nonexistent.mp4", null)).rejects.toThrow();
  });
});
