const assert = require("assert");
const test = require("node:test");

const { WebhookManager } = require("../src/webhook-manager");

const PUBLIC_URL = "http://public.example/hook";

function createTransport(options) {
  options = options || {};
  var calls = [];
  var request = options.request || function(requestOptions) {
    var chunks = [];
    var call = { options: requestOptions, chunks: chunks, ended: false };
    calls.push(call);
    return {
      on: function() { return this; },
      setTimeout: function() { return this; },
      write: function(chunk) { chunks.push(Buffer.from(chunk)); },
      end: function() { call.ended = true; },
      destroy: function() {},
    };
  };
  var manager = new WebhookManager({
    lookup: async function() { return [{ address: "93.184.216.34", family: 4 }]; },
    httpRequest: request,
    requestTimeoutMs: 100,
  });
  return { calls: calls, manager: manager };
}

function payloadOf(call) {
  return JSON.parse(Buffer.concat(call.chunks).toString("utf8"));
}

test("WebhookManager 可以构造", function() {
  assert.strictEqual(typeof WebhookManager, "function");
});

test("注册 Webhook 并保存事件过滤器", async function() {
  var manager = createTransport().manager;
  var webhook = await manager.register({ url: PUBLIC_URL, events: ["schedule.completed"] });
  assert.strictEqual(typeof webhook.id, "string");
  assert.strictEqual(webhook.url, PUBLIC_URL);
  assert.deepStrictEqual(webhook.events, ["schedule.completed"]);
});

test("注册时拒绝非法 URL 与回环地址", async function() {
  var manager = createTransport().manager;
  await assert.rejects(manager.register({ url: "not-a-url" }), /Invalid webhook URL/);
  await assert.rejects(manager.register({ url: "http://127.0.0.1/hook" }), /internal\/private network/);
});

test("列表和删除按 owner 隔离", async function() {
  var manager = createTransport().manager;
  var ownerA = await manager.register({ url: PUBLIC_URL, ownerSubject: "user-a" });
  await manager.register({ url: "http://other.example/hook", ownerSubject: "user-b" });
  assert.strictEqual(manager.list("user-a").length, 1);
  assert.strictEqual(manager.remove(ownerA.id, "user-b"), false);
  assert.strictEqual(manager.remove(ownerA.id, "user-a"), true);
  assert.strictEqual(manager.list("user-a").length, 0);
});

test("fire 向固定公网解析结果发送正确 JSON 载荷", async function() {
  var transport = createTransport();
  await transport.manager.register({ url: PUBLIC_URL });
  await transport.manager.fire("schedule.completed", { id: "sched-1", status: "success" });

  assert.strictEqual(transport.calls.length, 1);
  assert.strictEqual(transport.calls[0].options.hostname, "public.example");
  assert.strictEqual(transport.calls[0].options.method, "POST");
  assert.strictEqual(transport.calls[0].ended, true);
  var payload = payloadOf(transport.calls[0]);
  assert.strictEqual(payload.event, "schedule.completed");
  assert.strictEqual(payload.data.id, "sched-1");
  assert.strictEqual(payload.data.status, "success");
  assert.strictEqual(typeof payload.timestamp, "string");
});

test("fire 仅发送匹配事件，空事件列表匹配全部", async function() {
  var filtered = createTransport();
  await filtered.manager.register({ url: PUBLIC_URL, events: ["publish.completed"] });
  await filtered.manager.fire("schedule.completed", {});
  assert.strictEqual(filtered.calls.length, 0);

  var allEvents = createTransport();
  await allEvents.manager.register({ url: PUBLIC_URL, events: [] });
  await allEvents.manager.fire("schedule.completed", {});
  assert.strictEqual(allEvents.calls.length, 1);
});

test("fire 按 owner 过滤 Webhook", async function() {
  var transport = createTransport();
  await transport.manager.register({ url: PUBLIC_URL, ownerSubject: "user-a" });
  await transport.manager.register({ url: "http://other.example/hook", ownerSubject: "user-b" });
  await transport.manager.fire("publish.completed", {}, "user-a");
  assert.strictEqual(transport.calls.length, 1);
  assert.strictEqual(transport.calls[0].options.hostname, "public.example");
});

test("传输层异常不会让 fire 抛错", async function() {
  var transport = createTransport({
    request: function() { throw new Error("连接失败"); },
  });
  await transport.manager.register({ url: PUBLIC_URL });
  await assert.doesNotReject(transport.manager.fire("schedule.completed", {}));
});

// 抽取 ssrf-guard 时的文案回归锁。
// 抽取把「4 条不同文案」模板化成 1 条，宣称「逐条一致」——实为证伪。
// 本锁逐条比对抽取前（c762ed81）的原文案，防止再次「重构顺带改行为」。
test("抽取 ssrf-guard 后错误文案与抽取前逐条一致", async function() {
  var manager = createTransport().manager;
  var expectations = [
    ["not-a-url", "Invalid webhook URL"],
    ["http://127.0.0.1/hook", "Webhook URL cannot point to internal/private network"],
    ["ftp://example.com/x", "Valid webhook URL is required (http:// or https://)"],
    ["http://user:pw@example.com/x", "Valid webhook URL is required (http:// or https://)"],
    [42, "Valid webhook URL is required (http:// or https://)"],
    ["http://" + new Array(2100).join("a"), "Valid webhook URL is required (http:// or https://)"],
  ];
  for (const [input, expected] of expectations) {
    var actual = null;
    try { await manager.register({ url: input }); } catch (e) { actual = e.message; }
    assert.strictEqual(actual, expected,
      "输入 " + JSON.stringify(String(input).slice(0, 24)) + " 的文案与抽取前不一致");
  }
});

