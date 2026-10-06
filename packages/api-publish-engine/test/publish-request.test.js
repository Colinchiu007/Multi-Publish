const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { test: t, run } = require("./async-test-harness").createHarness();
const { buildTaskDataFromRequest, ARTICLE_KEYS } = require("../src/publish/publish-request");
const { errorCode } = require("../src/error-codes");

function eq(a, b) { assert.deepStrictEqual(a, b); }
function ok(v, m) { assert.ok(v, m); }

// ── 测试用真实文件（媒体路径必须真实存在才能过校验）────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-request-"));
const realVideo = path.join(tmpDir, "v.mp4");
const realCover = path.join(tmpDir, "c.png");
fs.writeFileSync(realVideo, "fake-video-bytes");
fs.writeFileSync(realCover, "fake-cover-bytes");
const missingPath = path.join(tmpDir, "nope.mp4");

console.log("--- buildTaskDataFromRequest: 正常路径 ---");

t("文章发布（无 media）→ 标题/正文/标签透传", () => {
  const r = buildTaskDataFromRequest({ platform: "zhihu", title: "标题", content: "正文", tags: ["a", "b"] });
  ok(r.ok, "应成功");
  eq(r.taskData.title, "标题");
  eq(r.taskData.content, "正文");
  eq(r.taskData.tags, ["a", "b"]);
  eq(r.taskData.video, undefined, "无 video_path 时不应产出 video 字段");
});

t("视频发布 → video_path 翻译为嵌套 taskData.video.path（适配器契约形状）", () => {
  const r = buildTaskDataFromRequest({ platform: "kuaishou", title: "T", video_path: realVideo });
  ok(r.ok, "应成功");
  eq(r.taskData.video.path, realVideo);
  eq(r.taskData.video.duration, 0);
  eq(r.taskData.video.width, 0);
  eq(r.taskData.video.height, 0);
});

t("视频 + 封面 → cover 透传", () => {
  const r = buildTaskDataFromRequest({ video_path: realVideo, cover_path: realCover });
  ok(r.ok, "应成功");
  eq(r.taskData.cover, realCover);
});

t("视频 + 时长宽高 → 填入 videoInfo（缺省为 0）", () => {
  const r = buildTaskDataFromRequest({ video_path: realVideo, duration: 12.5, width: 1080, height: 1920 });
  ok(r.ok, "应成功");
  eq(r.taskData.video.duration, 12.5);
  eq(r.taskData.video.width, 1080);
  eq(r.taskData.video.height, 1920);
});

t("图文模式 → images / author 透传", () => {
  const r = buildTaskDataFromRequest({ title: "图文", images: [realCover], author: "作者" });
  ok(r.ok, "应成功");
  eq(r.taskData.images, [realCover]);
  eq(r.taskData.author, "作者");
  eq(r.taskData.video, undefined);
});

t("draft=true → 草稿分支；aiGenerated 缺省为 true", () => {
  const r = buildTaskDataFromRequest({ title: "x", draft: true });
  ok(r.ok, "应成功");
  eq(r.taskData.draft, true);
  eq(r.taskData.aiGenerated, true);
});

t("平台特有字段透传（与 task-data PASSTHROUGH_KEYS 对齐）", () => {
  const r = buildTaskDataFromRequest({ title: "x", copyright: 2, collectionId: 7 });
  ok(r.ok, "应成功");
  eq(r.taskData.copyright, 2);
  eq(r.taskData.collectionId, 7);
});

console.log("--- buildTaskDataFromRequest: 异常路径 ---");

t("tags 非数组 → data_error", () => {
  const r = buildTaskDataFromRequest({ tags: "not-an-array" });
  eq(r.ok, false);
  eq(r.status, 400);
  eq(r.error, errorCode.data_error);
});

t("images 非数组 → data_error", () => {
  const r = buildTaskDataFromRequest({ images: "not-an-array" });
  eq(r.ok, false);
  eq(r.error, errorCode.data_error);
});

t("video_path 在服务端不存在 → io_error（早失败，不让请求走到链路深处）", () => {
  const r = buildTaskDataFromRequest({ video_path: missingPath });
  eq(r.ok, false);
  eq(r.status, 400);
  eq(r.error, errorCode.io_error);
});

t("video_path 指向目录 → io_error", () => {
  const r = buildTaskDataFromRequest({ video_path: tmpDir });
  eq(r.ok, false);
  eq(r.error, errorCode.io_error);
});

t("video_path 为非字符串 → data_error", () => {
  const r = buildTaskDataFromRequest({ video_path: 12345 });
  eq(r.ok, false);
  eq(r.error, errorCode.data_error);
});

t("cover_path 在服务端不存在 → io_error", () => {
  const r = buildTaskDataFromRequest({ video_path: realVideo, cover_path: missingPath });
  eq(r.ok, false);
  eq(r.error, errorCode.io_error);
});

console.log("--- buildTaskDataFromRequest: 边界 ---");

t("video_path 为空串 / null → 视为无视频，不报错", () => {
  for (const v of ["", null]) {
    const r = buildTaskDataFromRequest({ title: "x", video_path: v });
    ok(r.ok, "应成功，video_path=" + JSON.stringify(v));
    eq(r.taskData.video, undefined);
  }
});

t("时长宽高为非数字 → 归零，不产生 NaN", () => {
  const r = buildTaskDataFromRequest({ video_path: realVideo, duration: "abc", width: null, height: {} });
  ok(r.ok, "应成功");
  eq(r.taskData.video.duration, 0);
  eq(r.taskData.video.width, 0);
  eq(r.taskData.video.height, 0);
});

t("缺省字段归一：tags 恒为数组，title/content 恒为字符串", () => {
  const r = buildTaskDataFromRequest({});
  ok(r.ok, "应成功");
  eq(r.taskData.tags, []);
  eq(r.taskData.title, "");
  eq(r.taskData.content, "");
});

t("body 为 null / 非对象 → 仍能构造出可用的空 taskData", () => {
  for (const b of [null, undefined, "字符串", 42]) {
    const r = buildTaskDataFromRequest(b);
    ok(r.ok, "应成功，body=" + JSON.stringify(b));
    eq(r.taskData.tags, []);
  }
});

t("未声明字段不透传（防请求体杂字段泄漏进发布链）", () => {
  const r = buildTaskDataFromRequest({ title: "x", cookie: "c", 内部字段: "x", __proto__polluted: 1 });
  ok(r.ok, "应成功");
  eq(r.taskData.cookie, undefined, "cookie 是传输凭证，不应进 taskData");
  eq(r.taskData["内部字段"], undefined);
  eq(r.taskData.polluted, undefined);
  ok(ARTICLE_KEYS.indexOf("cookie") === -1, "cookie 不在 article 白名单内");
});

t("ARTICLE_KEYS 白名单含 media 关键字段且不含 cookie", () => {
  ["video_path", "cover_path", "images", "author", "draft", "aiGenerated"].forEach(function (k) {
    ok(ARTICLE_KEYS.indexOf(k) !== -1, "白名单应含 " + k);
  });
  ok(ARTICLE_KEYS.indexOf("cookie") === -1, "白名单不应含 cookie");
});

console.log("--- buildTaskDataFromRequest: 幂等 ---");

t("同一请求体连续两次产出等价 taskData（纯函数）", () => {
  const body = { platform: "kuaishou", title: "T", video_path: realVideo, cover_path: realCover, tags: ["x"], draft: true };
  const a = buildTaskDataFromRequest(body);
  const b = buildTaskDataFromRequest(body);
  eq(a, b);
});

t("不修改入参（调用方对象保持原样）", () => {
  const body = { title: "T", video_path: realVideo };
  const snapshot = JSON.stringify(body);
  buildTaskDataFromRequest(body);
  eq(JSON.stringify(body), snapshot, "入参不应被就地改写");
});

run();