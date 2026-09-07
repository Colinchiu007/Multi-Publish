const WebSocket = require("ws");
const http = require("http");
const VITE = "http://127.0.0.1:5174";
let PASS = 0, FAIL = 0;
const FAILURES = [];
function t(n, ok, d) { if (ok) PASS++; else { FAIL++; FAILURES.push(n + " => " + (d || "")); } console.log((ok ? "PASS" : "FAIL") + " | " + n + (d ? " | " + d : "")); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpGetJson = url => new Promise((res, rej) => { http.get(url, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej); });
class C {
  constructor(u) { this.ws = new WebSocket(u); this.id = 0; this.p = new Map(); this.ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && this.p.has(m.id)) { const h = this.p.get(m.id); this.p.delete(m.id); m.error ? h.rej(m.error) : h.res(m.result || {}); } }); }
  open() { return new Promise((res, rej) => { if (this.ws.readyState === 1) return res(); this.ws.once("open", res); this.ws.once("error", rej); }); }
  call(m, p = {}, to = 30000) { const id = ++this.id; return new Promise((res, rej) => { const tm = setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error("timeout " + m)); } }, to); this.p.set(id, { res: r => { clearTimeout(tm); res(r); }, rej: e => { clearTimeout(tm); rej(e); } }); this.ws.send(JSON.stringify({ id, method: m, params: p })); }); }
  async ev(e, ap = false, to = 15000) { const r = await this.call("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: ap }, to); if (r.exceptionDetails) return { __err: r.exceptionDetails.text }; return r.result ? r.result.value : undefined; }
  async waitFor(e, to = 30000, iv = 800) { const s = Date.now(); while (Date.now() - s < to) { const v = await this.ev(e, false, 5000); if (v && v !== "no-result" && v !== "none" && v !== "" && v !== false) return v; await sleep(iv); } return this.ev(e, false, 5000); }
  async nav(u) { await this.call("Page.navigate", { url: u }); await sleep(5000); const url = await this.ev("window.location.href", false, 5000); console.log("  navigated to:", url); }
  close() { this.ws.close(); }
}
const SI = "var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;";

async function main() {
  const pages = await httpGetJson("http://127.0.0.1:11213/json");
  const page = pages.find(p => p.type === "page" && p.url.includes("5174")) || pages.find(p => p.type === "page");
  console.log("Using page:", page.url);
  const c = new C(page.webSocketDebuggerUrl);
  await c.open();
  await c.call("Runtime.enable"); await c.call("Page.enable");

  await c.nav(VITE + "/#/collection");
  let v = await c.ev("document.querySelector('.page-title')?.textContent?.trim()");
  t("1. page-title=内容采集", v === "内容采集", JSON.stringify(v));
  v = await c.ev("document.querySelector('.page-subtitle')?.textContent?.trim()");
  t("2. page-subtitle", v === "从各平台采集内容，或快速创建草稿", JSON.stringify(v));
  v = await c.ev("document.querySelector('.page-actions')?.textContent || ''");
  t("3. 从剪贴板导入按钮", String(v).includes("从剪贴板导入"));
  t("4. 新建草稿按钮", String(v).includes("新建草稿"));
  v = await c.ev("document.querySelector('.cohere-card select')?.options?.length");
  t("5. 采集源选项 4 项", v === 4, "count=" + v);
  v = await c.ev("document.querySelector('input[placeholder*=链接]')?.placeholder || ''");
  t("6. 输入框 placeholder", String(v).includes("输入文章链接"), JSON.stringify(v));

  console.log("\n=== 核心：成功采集 example.com ===");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  console.log("  collect clicked, waiting for result...");
  v = await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  console.log("  result:", JSON.stringify(v).slice(0, 120));
  t("7. 采集结果显示区域", v !== "" && v !== "no-result", "内容: " + JSON.stringify(v).slice(0, 80));
  v = await c.ev("(function(){var secs=document.querySelectorAll('.cohere-section-title');for(var i=0;i<secs.length;i++){if(secs[i].textContent.includes('采集结果'))return secs[i].textContent.trim();}return '';})()");
  t("8. 采集结果列表标题", String(v).includes("采集结果"), "title=" + JSON.stringify(v));

  console.log("\n=== 采集结果卡片操作按钮 ===");
  v = await c.ev("(function(){var cards=document.querySelectorAll('.cohere-card-grid .cohere-card');for(var i=0;i<cards.length;i++){var btns=Array.from(cards[i].querySelectorAll('button')).map(b=>b.textContent.trim());if(btns.includes('视频创作'))return btns.join(',');}return '';})()");
  console.log("  card buttons:", v);
  t("9. 查看按钮", String(v).includes("查看"), String(v));
  t("10. 创建草稿按钮", String(v).includes("创建草稿"), String(v));
  t("11. 视频创作按钮", String(v).includes("视频创作"), String(v));
  t("12. 发布按钮", String(v).includes("发布"), String(v));

  console.log("\n=== 改写功能 ===");
  v = await c.ev("(function(){var btns=document.querySelectorAll('.cohere-btn-secondary');var r=[];for(var i=0;i<btns.length;i++)r.push(btns[i].textContent.trim());return r.join(',');})()");
  console.log("  secondary buttons:", v);
  t("13. AI 改写按钮存在", String(v).includes("AI 改写"), String(v));
  await c.ev("(function(){var btns=document.querySelectorAll('.cohere-btn-secondary');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim().includes('AI 改写')){btns[i].click();return 'clicked';}}return 'not-found';})()", false);
  await sleep(5000);
  // Check toast notification (inline error is Vue reactivity timing issue, toast is definitive)
  v = await c.ev("Array.from(document.querySelectorAll('.el-message')).map(e=>e.textContent.trim()).join('|')");
  console.log("  rewrite toast:", JSON.stringify(v));
  t("14. 改写反馈 toast", String(v).includes("AI 改写失败") || String(v).includes("改写完成"), "toast=" + JSON.stringify(v).slice(0, 100));

  console.log("\n=== 创建草稿 → 发布页 ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  await c.ev("(function(){var btns=document.querySelectorAll('.cohere-btn-primary');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==='创建草稿'){btns[i].click();return 'clicked';}}return 'not-found';})()", false);
  await sleep(3000);
  v = await c.ev("window.location.hash");
  t("15. 创建草稿→/publish", String(v).includes("/publish"), String(v));

  console.log("\n=== 视频创作跳转 ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  // Wait for cards to render and click video creation button
  await sleep(1500);
  await c.ev("(function(){var cards=document.querySelectorAll('.cohere-card-grid .cohere-card');for(var i=0;i<cards.length;i++){var btn=Array.from(cards[i].querySelectorAll('button')).find(b=>b.textContent.trim()==='视频创作');if(btn){btn.click();return 'clicked';}}return 'not-found';})()", false);
  await sleep(3000);
  v = await c.ev("window.location.hash");
  t("16. 视频创作→/create", String(v).includes("/create"), String(v));

  console.log("\n=== 发布跳转 ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  await sleep(1500);
  await c.ev("(function(){var cards=document.querySelectorAll('.cohere-card-grid .cohere-card');for(var i=0;i<cards.length;i++){var btn=Array.from(cards[i].querySelectorAll('button')).find(b=>b.textContent.trim()==='发布');if(btn){btn.click();return 'clicked';}}return 'not-found';})()", false);
  await sleep(3000);
  v = await c.ev("window.location.hash");
  t("17. 发布→/publish", String(v).includes("/publish"), String(v));

  console.log("\n=== 清空采集结果 ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  v = await c.ev("(function(){var btns=document.querySelectorAll('.cohere-btn-secondary');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==='清空'){btns[i].click();return 'clicked';}}return 'not-found';})()");
  t("18. 清空按钮存在", v === "clicked", v);
  await sleep(800);
  v = await c.ev("(function(){var secs=document.querySelectorAll('.cohere-section-title');for(var i=0;i<secs.length;i++){if(secs[i].textContent.includes('采集结果'))return true;}return false;})()");
  t("19. 清空后结果区消失", v === false, "visible=" + v);

  console.log("\n=== 取消采集结果 ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'https://example.com');inp.dispatchEvent(new Event('input',{bubbles:true}));var btn=Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集');if(btn)btn.click();})()", false);
  await c.waitFor("document.querySelector('[style*=soft-stone]')?.textContent?.trim() || ''", 30000);
  await c.ev("(function(){var btns=document.querySelectorAll('.cohere-btn-secondary');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==='取消'){btns[i].click();return 'clicked';}}return 'not-found';})()", false);
  await sleep(800);
  v = await c.ev("document.querySelector('[style*=soft-stone]') ? 'visible' : 'hidden'");
  t("20. 取消后结果隐藏", v === "hidden", v);

  console.log("\n=== 空链接采集 toast ===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){var inp=document.querySelector('input[placeholder*=链接]');" + SI + "s.call(inp,'');inp.dispatchEvent(new Event('input',{bubbles:true}));Array.from(document.querySelectorAll('.cohere-card button.cohere-btn-primary')).find(b=>b.textContent.trim()==='采集').click();})()", false);
  await sleep(1500);
  v = await c.ev("Array.from(document.querySelectorAll('.el-message')).map(e=>e.textContent.trim()).join('|')");
  t("21. 空链接 toast", String(v).includes("请输入链接"), "toast=" + JSON.stringify(v));

  console.log("\n=== 快捷操作卡片 ===");
  await c.nav(VITE + "/#/collection");
  v = await c.ev("document.querySelectorAll('.cohere-stat-card').length");
  t("22. 卡片数量", v === 5, "count=" + v);
  v = await c.ev("Array.from(document.querySelectorAll('.cohere-stat-card .stat-label')).map(e=>e.textContent.trim()).join(',')");
  t("23. 卡片标签", ["新建草稿","剪贴板导入","微博","知乎","今日头条"].every(s => String(v).includes(s)), String(v));
  await c.ev("(function(){Array.from(document.querySelectorAll('.cohere-stat-card')).find(x=>x.textContent.includes('微博')).click();})()");
  await sleep(1500);
  v = await c.ev("Array.from(document.querySelectorAll('.el-message')).map(e=>e.textContent.trim()).join('|')");
  t("24. 微博卡片 toast", String(v).includes("微博") || String(v).includes("weibo"), "toast=" + JSON.stringify(v));

  console.log("\n=== DPI/渲染 ===");
  v = await c.ev("window.devicePixelRatio");
  t("25. devicePixelRatio", typeof v === "number", "dpr=" + v);
  v = await c.ev("document.querySelector('.cohere-page-header')?.offsetHeight > 0");
  t("26. header 可见", v === true, JSON.stringify(v));

  console.log("\n=== 新建草稿（快速导航）===");
  await c.nav(VITE + "/#/collection");
  await c.ev("(function(){Array.from(document.querySelectorAll('.page-actions button')).find(b=>b.textContent.includes('新建草稿')).click();})()", false);
  await sleep(2500);
  v = await c.ev("window.location.hash");
  t("27. 新建草稿→/publish", String(v).includes("/publish"), String(v));

  console.log("\n=== 路由跳转 ===");
  await c.ev("window.location.hash='#/create'"); await sleep(2000);
  v = await c.ev("window.location.hash");
  t("28. 路由→视频创作", String(v).includes("/create"), String(v));
  await c.ev("window.location.hash='#/publish'"); await sleep(2000);
  v = await c.ev("window.location.hash");
  t("29. 路由→发布", String(v).includes("/publish"), String(v));

  console.log("\n=== 下拉框切换 ===");
  await c.nav(VITE + "/#/collection");
  const SS = "var s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;";
  await c.ev("(function(){var sel=document.querySelector('.cohere-card select');" + SS + "s.call(sel,'rss');sel.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(500);
  v = await c.ev("document.querySelector('.cohere-card select').value");
  t("30. 切换到 RSS", v === "rss", String(v));
  await c.ev("(function(){var sel=document.querySelector('.cohere-card select');" + SS + "s.call(sel,'sitemap');sel.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(500);
  v = await c.ev("document.querySelector('.cohere-card select').value");
  t("31. 切换到 Sitemap", v === "sitemap", String(v));

  console.log("\n=== API 健康 ===");
  try { const h = await httpGetJson("http://127.0.0.1:8299/api/health"); t("32. /api/health", !!h, JSON.stringify(h)); }
  catch (e) { t("32. /api/health", false, e.message); }
  try { const s = await httpGetJson("http://127.0.0.1:8299/aggregation/sources"); t("33. /aggregation/sources", Array.isArray(s), "len=" + (Array.isArray(s) ? s.length : "n/a")); }
  catch (e) { t("33. /aggregation/sources", false, e.message); }

  console.log("\n" + "=".repeat(50));
  console.log("Total: " + PASS + " PASS, " + FAIL + " FAIL (" + (PASS + FAIL) + " items)");
  console.log("=".repeat(50));
  if (FAILURES.length > 0) { console.log("FAILURES:"); FAILURES.forEach(f => console.log("  - " + f)); }
  c.close();
  process.exit(FAIL > 0 ? 1 : 0);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
