// @ts-check
/**
 * UrlCollector 回归测试 — 知乎专栏/问题回答正文提取
 *
 * 覆盖：
 *   - 知乎专栏（zhuanlan.zhihu.com）：.Post-RichTextContainer 优先提取
 *   - 知乎问题/回答（www.zhihu.com）：.RichContent-inner 优先提取
 *   - 百家号（baijiahao.baidu.com）：SPA <p> 段落聚合 + h1 标题回退
 *   - 通用站点回退：article → main → body
 *   - SSRF 防护：内网地址拒绝
 *   - IPC handler：url-collect:fetch 成功/失败路径
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/logger", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const UrlCollector = require("./url-collector");

function zhihuColumnHtml() {
  return `<html>
  <head>
    <meta property="og:title" content="知乎专栏文章标题">
    <meta property="og:description" content="专栏描述">
    <meta property="og:image" content="https://example.com/cover.jpg">
    <meta property="article:published_time" content="2024-01-01T00:00:00+08:00">
    <meta property="og:site_name" content="知乎">
    <title>知乎专栏文章标题</title>
  </head>
  <body>
    <nav>导航栏无关内容</nav>
    <div class="Post-RichTextContainer">
      <div class="RichText ztext Post-RichText">这是知乎专栏的正文内容，包含完整段落文字。</div>
    </div>
    <aside>侧栏推荐内容</aside>
    <footer>页脚版权信息</footer>
  </body>
</html>`;
}

function zhihuAnswerHtml() {
  return `<html>
  <head>
    <meta property="og:title" content="知乎问题标题">
    <title>知乎问题标题 - 知乎</title>
  </head>
  <body>
    <header>顶部导航</header>
    <div class="QuestionHeader">
      <h1 class="QuestionHeader-title">知乎问题标题</h1>
    </div>
    <div class="RichContent RichContent--unescapable">
      <div class="RichText ztext RichContent-inner">这是知乎某个回答的完整正文内容。</div>
    </div>
    <div class="RichContent RichContent--unescapable">
      <div class="RichText ztext RichContent-inner">这是第二个回答的正文。</div>
    </div>
    <aside>相关推荐</aside>
  </body>
</html>`;
}

function genericArticleHtml() {
  return `<html>
  <head><title>普通文章标题</title></head>
  <body>
    <article><p>普通站点正文内容。</p></article>
    <footer>页脚</footer>
  </body>
</html>`;
}

function baijiahaoHtml() {
  // 百家号是 SPA，class 名每次构建混淆变化；正文稳定在 <p> 段落标签中。
  // 页面含多个带 class 的容器（导航/侧栏/正文），正文容器拥有最多 <p>。
  return `<html>
  <head><title>英伟达“掀桌子”了：国产大模型免费用 - 百家号</title></head>
  <body>
    <div class="_1nav">
      <a>首页</a><a>登录</a>
    </div>
    <div class="xcp-publish">
      <p>AI导读：这是一段较短的导读文字。</p>
    </div>
    <div class="_2jN0Z">
      <h1>英伟达“掀桌子”了：国产大模型免费用</h1>
      <p>上次发了一篇文章，发现AI行业内外有巨大的信息差。</p>
      <p>周六又发了一个“英伟达开放 60 多个免费大模型”的视频被转发了几千次。</p>
      <p>听起来像是黄仁勋突然改行做慈善：GLM、MiniMax、Qwen，统统不要钱。</p>
      <p>真正的福利是：英伟达替你准备好了显卡和运行环境。</p>
    </div>
    <div class="_3side">
      <p>相关推荐：另一篇文章标题</p>
    </div>
  </body>
</html>`;
}

describe("UrlCollector _needsBrowser", () => {
  let collector;

  beforeEach(() => {
    collector = new UrlCollector();
  });

  it("识别知乎域名需要浏览器渲染", () => {
    expect(collector._needsBrowser("zhuanlan.zhihu.com")).toBe(true);
    expect(collector._needsBrowser("www.zhihu.com")).toBe(true);
    expect(collector._needsBrowser("zhihu.com")).toBe(true);
  });

  it("识别百家号域名需要浏览器渲染", () => {
    expect(collector._needsBrowser("baijiahao.baidu.com")).toBe(true);
  });

  it("非知乎域名不需要浏览器渲染", () => {
    expect(collector._needsBrowser("example.com")).toBe(false);
    expect(collector._needsBrowser("mp.weixin.qq.com")).toBe(false);
  });
});

describe("UrlCollector _parseHtml", () => {
  let collector;

  beforeEach(() => {
    collector = new UrlCollector();
  });

  it("知乎专栏：优先从 .Post-RichTextContainer 提取正文，排除导航/侧栏/页脚", () => {
    const result = collector._parseHtml(zhihuColumnHtml(), "https://zhuanlan.zhihu.com/p/368038553");
    expect(result.title).toBe("知乎专栏文章标题");
    expect(result.content).toContain("这是知乎专栏的正文内容");
    expect(result.content).not.toContain("导航栏无关内容");
    expect(result.content).not.toContain("侧栏推荐内容");
    expect(result.content).not.toContain("页脚版权信息");
    expect(result.source).toBe("知乎");
    expect(result.publishTime).toBe("2024-01-01T00:00:00+08:00");
    expect(result.coverImage).toBe("https://example.com/cover.jpg");
  });

  it("知乎问题回答：优先从 .RichContent-inner 提取首个回答正文", () => {
    const result = collector._parseHtml(zhihuAnswerHtml(), "https://www.zhihu.com/question/12345678/answer/87654321");
    expect(result.content).toContain("这是知乎某个回答的完整正文内容");
    expect(result.content).not.toContain("第二个回答的正文");
    expect(result.content).not.toContain("顶部导航");
    expect(result.content).not.toContain("相关推荐");
  });

  it("通用站点：回退到 article 标签", () => {
    const result = collector._parseHtml(genericArticleHtml(), "https://example.com/post/1");
    expect(result.content).toContain("普通站点正文内容");
    expect(result.content).not.toContain("页脚");
  });

  it("无 article/main 时回退到 body", () => {
    const html = `<html><head><title>无结构页</title></head><body>只有正文的页面</body></html>`;
    const result = collector._parseHtml(html, "https://example.com/plain");
    expect(result.content).toContain("只有正文的页面");
  });

  it("zhihu.com（无 www）也走回答提取分支", () => {
    const result = collector._parseHtml(zhihuAnswerHtml(), "https://zhihu.com/question/12345678/answer/87654321");
    expect(result.content).toContain("这是知乎某个回答的完整正文内容");
  });

  it("百家号：SPA <p> 段落聚合，取含最多 <p> 的容器为正文，排除导航/侧栏/导读", () => {
    const result = collector._parseHtml(baijiahaoHtml(), "https://baijiahao.baidu.com/s?id=1873093353787420593");
    // 正文容器含 4 个 <p>，其余容器段落更少
    expect(result.content).toContain("上次发了一篇文章");
    expect(result.content).toContain("周六又发了一个");
    expect(result.content).toContain("听起来像是黄仁勋");
    expect(result.content).toContain("真正的福利是");
    // 排除侧栏/导航/导读内容
    expect(result.content).not.toContain("AI导读");
    expect(result.content).not.toContain("相关推荐");
    expect(result.content).not.toContain("首页");
  });

  it("百家号：无 og:title 时回退 h1 或 <title>", () => {
    const result = collector._parseHtml(baijiahaoHtml(), "https://baijiahao.baidu.com/s?id=1873093353787420593");
    // 百家号 SPA 无 og:title meta，title 来自 <title> 标签
    expect(result.title).toContain("英伟达");
  });
});

describe("UrlCollector SSRF 防护", () => {
  let collector;

  beforeEach(() => {
    collector = new UrlCollector();
  });

  it.each([
    ["http://127.0.0.1:8299/api"],
    ["http://localhost:3000"],
    ["http://10.0.0.1/admin"],
    ["http://192.168.1.1/internal"],
    ["http://172.16.0.1/service"],
    ["http://169.254.169.254/latest/meta-data"],
  ])("拒绝内网地址 %s", async (url) => {
    const result = await collector.collect(url);
    expect(result.success).toBe(false);
    expect(result.error).toContain("内网");
  });

  it("拒绝非 http/https 协议", async () => {
    const result = await collector.collect("file:///etc/passwd");
    expect(result.success).toBe(false);
    expect(result.error).toContain("协议");
  });
});
