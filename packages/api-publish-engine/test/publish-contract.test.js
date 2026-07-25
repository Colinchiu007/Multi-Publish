const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BasePlatformAdapter,
} = require("../src/base-adapter");
const {
  REGISTRY,
  batchPublish,
  pluginLoader,
  publishViaApi,
} = require("../src/index");

const BUILTIN_PLATFORM = "__publish_contract_builtin__";
const PLUGIN_PLATFORM = "__publish_contract_plugin__";
const FAILED_PLUGIN_PLATFORM = "__publish_contract_failed_plugin__";

class RecordingAdapter extends BasePlatformAdapter {
  constructor() {
    super(BUILTIN_PLATFORM);
    this.calls = [];
    RecordingAdapter.instance = this;
  }

  getReferer() { return "https://example.test/publish"; }

  async uploadVideo() {
    this.calls.push("uploadVideo");
    return { mediaId: "video-1" };
  }

  async uploadCover() {
    this.calls.push("uploadCover");
    return { mediaId: "cover-1" };
  }

  buildPostData(taskData, uploads) {
    this.calls.push("buildPostData");
    this.buildArguments = { taskData, uploads };
    return { title: taskData.title, uploads };
  }

  async publish(cookie, postData) {
    this.calls.push("publish");
    this.publishArguments = { cookie, postData };
    return { success: true, platform: BUILTIN_PLATFORM, publishId: "post-1" };
  }
}

test("内置适配器通过 execute 保留上传结果和 Cookie 参数顺序", async () => {
  const taskData = { title: "标题", content: "正文", cover: "cover.png" };
  const cookie = "session=expected";
  const options = { onProgress() {} };
  REGISTRY[BUILTIN_PLATFORM] = RecordingAdapter;

  try {
    const result = await publishViaApi(BUILTIN_PLATFORM, taskData, cookie, options);
    const adapter = RecordingAdapter.instance;

    assert.equal(result.success, true);
    assert.deepEqual(adapter.calls, ["uploadVideo", "uploadCover", "buildPostData", "publish"]);
    assert.equal(adapter.buildArguments.taskData.title, taskData.title);
    assert.deepEqual(adapter.buildArguments.uploads, {
      video: { mediaId: "video-1" },
      cover: { mediaId: "cover-1" },
    });
    assert.equal(adapter.publishArguments.cookie, cookie);
    assert.deepEqual(adapter.publishArguments.postData.uploads, adapter.buildArguments.uploads);
  } finally {
    delete REGISTRY[BUILTIN_PLATFORM];
  }
});

test("插件 publish 保持 postData、cookie 的兼容参数顺序", async () => {
  const taskData = { title: "插件标题" };
  const cookie = "session=plugin";
  let publishArguments;
  pluginLoader._plugins.set(PLUGIN_PLATFORM, {
    platform: PLUGIN_PLATFORM,
    async publish(postData, suppliedCookie) {
      publishArguments = { postData, suppliedCookie };
      return { success: true, platform: PLUGIN_PLATFORM };
    },
  });

  try {
    const result = await publishViaApi(PLUGIN_PLATFORM, taskData, cookie);
    assert.equal(result.success, true);
    assert.strictEqual(publishArguments.postData, taskData);
    assert.equal(publishArguments.suppliedCookie, cookie);
  } finally {
    pluginLoader._plugins.delete(PLUGIN_PLATFORM);
  }
});

test("批量发布不会把适配器明确失败误记为成功", async () => {
  pluginLoader._plugins.set(FAILED_PLUGIN_PLATFORM, {
    platform: FAILED_PLUGIN_PLATFORM,
    async publish() {
      return { success: false, error: "平台拒绝发布" };
    },
  });

  try {
    const [result] = await batchPublish([FAILED_PLUGIN_PLATFORM], { title: "标题" }, "session=failed");
    assert.equal(result.success, false);
    assert.equal(result.error, "平台拒绝发布");
  } finally {
    pluginLoader._plugins.delete(FAILED_PLUGIN_PLATFORM);
  }
});
