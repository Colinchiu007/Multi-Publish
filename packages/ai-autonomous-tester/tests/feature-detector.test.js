const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { FeatureDetector } = require("../src/detectors/feature-detector");

const TMP = path.join(__dirname, ".tmp-features");

function write(f, content) {
  const full = path.join(TMP, f);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

describe("FeatureDetector", () => {
  const d = new FeatureDetector({ srcDir: TMP });

  it("空目录返回空", async () => {
    const items = await new FeatureDetector({ srcDir: "__nonexistent__" }).detect();
    assert.equal(items.length, 0);
  });

  it("检测 routes", async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    write("router/index.js", `
      const routes = [
        { path: "/login", name: "Login", component: Login },
        { path: "/publish", name: "Publish", component: Publish },
      ];
    `);
    const items = await d.detect();
    const routes = items.filter(i => i.type === "route");
    assert.ok(routes.length >= 2);
    assert.ok(routes.some(r => r.name.includes("Login")));
    assert.ok(routes.some(r => r.name.includes("Publish")));
    assert.ok(routes.every(r => r.path));
  });

  it("检测 nav items", async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    write("components/SideBar.vue", `
      <template>
        <div>
          <span>{{ t("title") }}</span>
          <nav>
            label: "首页"
            title: "设置"
          </nav>
        </div>
      </template>
    `);
    const items = await d.detect();
    const navs = items.filter(i => i.type === "nav-item");
    assert.ok(navs.some(n => n.name === "首页") || navs.some(n => n.name === "设置"));
  });

  it("检测 page titles", async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    write("views/Home.vue", `<template><div><title>首页</title><h1>欢迎</h1></div></template>`);
    write("views/Login.vue", `<template><div><h1>登录</h1></div></template>`);
    const items = await d.detect();
    assert.ok(items.some(i => i.type === "page-h1"));
  });

  it("检测 testid", async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    write("views/Form.vue", `
      <template>
        <input data-testid="login-form" />
        <button data-testid="submit-btn">提交</button>
      </template>
    `);
    const items = await d.detect();
    const testids = items.filter(i => i.type === "testid");
    assert.ok(testids.length >= 1);
    assert.ok(testids.some(t => t.testid === "login-form") || testids.some(t => t.testid === "submit-btn"));
  });

  it("去重: 同名同类型只出现一次", async () => {
    fs.rmSync(TMP, { recursive: true, force: true });
    write("router/a.js", `routes = [{ path: "/dup", name: "Dup" }];`);
    write("router/b.js", `routes = [{ path: "/dup", name: "Dup" }];`);
    const items = await d.detect();
    const dups = items.filter(i => i.name === "Dup" && i.type === "route");
    assert.equal(dups.length, 1);
  });

  it("_humanize: 驼峰转空格 + 首字母大写", () => {
    assert.equal(d._humanize("loginForm"), "Login Form");
    assert.equal(d._humanize("user-profile"), "User Profile");
    assert.equal(d._humanize("hello world"), "Hello World");
  });
});