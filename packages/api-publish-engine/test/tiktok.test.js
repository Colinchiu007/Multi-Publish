/**
 * tiktok.test.js — TikTok 适配器契约
 *
 * 2026-10-06 重写。此前该文件只断言 `result.platform === 'tiktok'`，
 * 而适配器**完全不识别 dryRun**，于是「传 dryRun 也照样外发」这条路径从未被覆盖，
 * 「拿不到 upload_url 却 return {success:true}」的假成功分支同样无任何断言。
 * 本次按三条修复各自补断言。
 */
const TikTokAdapter = require("../src/adapters/tiktok");

describe("TikTokAdapter", function() {
  var adapter;
  var originalToken;
  var originalApiPost;

  beforeEach(function() {
    adapter = new TikTokAdapter();
    originalToken = process.env.TIKTOK_ACCESS_TOKEN;
    process.env.TIKTOK_ACCESS_TOKEN = "test-token";
  });

  afterEach(function() {
    if (originalToken === undefined) delete process.env.TIKTOK_ACCESS_TOKEN;
    else process.env.TIKTOK_ACCESS_TOKEN = originalToken;
    if (originalApiPost) adapter._apiPost = originalApiPost;
  });

  function stubApiPost(responses) {
    var calls = [];
    originalApiPost = adapter._apiPost;
    adapter._apiPost = function(path, body) {
      calls.push({ path: path, body: body });
      const r = responses[calls.length - 1];
      return Promise.resolve(r);
    };
    return calls;
  }

  test("has correct name", function() {
    expect(adapter.name).toBe("tiktok");
  });

  // 修复①：dryRun 必须被尊重——此前被忽略，缺凭证也会真去外发
  test("dryRun 不发起任何请求", async function() {
    const calls = stubApiPost([{}]);
    const result = await adapter.execute({ title: "T" }, null, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.platform).toBe("tiktok");
    expect(calls.length).toBe(0);
  });

  // 修复②：拿不到 upload_url 不得报成功
  test("init 无 upload_url → unsupported 而非假成功", async function() {
    stubApiPost([{ data: { message: "no url" } }]);
    const result = await adapter.execute({ title: "T" }, null, {});
    expect(result.success).toBe(false);
    expect(result.unsupported).toBe(true);
    expect(result.platform).toBe("tiktok");
    expect(result.error).toMatch(/upload_url/);
  });

  // 修复③：没有 publish_id 不得报成功
  test("publish 无 publish_id → 失败", async function() {
    stubApiPost([
      { data: { upload_url: "https://upload.example/x" } },
      { data: { message: "queued but no id" } },
    ]);
    const result = await adapter.execute({ title: "T" }, null, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/publish_id/);
  });

  test("完整链路：init 有 url 且 publish 回 id → 成功", async function() {
    const calls = stubApiPost([
      { data: { upload_url: "https://upload.example/x" } },
      { data: { publish_id: "p-123" } },
    ]);
    const result = await adapter.execute({ title: "标题", content: "正文" }, null, {});
    expect(result.success).toBe(true);
    expect(result.publishId).toBe("p-123");
    // 标题必须并入 description 首行（无标题平台口径）
    expect(calls[1].body.post_info.description).toBe("标题\n正文");
  });

  test("缺 TIKTOK_ACCESS_TOKEN → 失败而非外发", async function() {
    delete process.env.TIKTOK_ACCESS_TOKEN;
    const calls = stubApiPost([{}]);
    const result = await adapter.execute({ title: "T" }, null, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/TIKTOK_ACCESS_TOKEN/);
    expect(calls.length).toBe(0);
  });
});