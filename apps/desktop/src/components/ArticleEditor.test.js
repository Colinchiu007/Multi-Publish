import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@vueup/vue-quill", () => ({
  QuillEditor: { name: "QuillEditor", template: "<div class='quill-mock' />", props: ["content", "contentType", "options"] }
}));

import i18n from "@/i18n";
import ArticleEditor from "./ArticleEditor.vue";

const mountEditor = (props) => mount(ArticleEditor, { props, global: { plugins: [i18n] } });

describe("ArticleEditor", () => {
  it("renders in rich text mode by default", () => {
    const w = mountEditor({ modelValue: "" });
    expect(w.find(".quill-mock").exists()).toBe(true);
  });

  it("switches to markdown mode on tab click", async () => {
    const w = mountEditor({ modelValue: "" });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find(".quill-mock").exists()).toBe(false);
    expect(w.find("textarea").exists()).toBe(true);
  });

  it("shows placeholder in markdown mode", async () => {
    const w = mountEditor({ modelValue: "", placeholder: "在此编辑内容..." });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").attributes("placeholder")).toBe("在此编辑内容...");
  });

  it("markdown textarea shows modelValue", async () => {
    const w = mountEditor({ modelValue: "测试内容" });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").element.value).toBe("测试内容");
  });

  it("emits update:modelValue on markdown edit", async () => {
    const w = mountEditor({ modelValue: "" });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    const textarea = w.find("textarea");
    await textarea.setValue("新内容");
    expect(w.emitted("update:modelValue")).toBeTruthy();
    expect(w.emitted("update:modelValue")[0]).toEqual(["新内容"]);
  });

  // PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F1：应用端 10000 字上限与计数
  it("markdown textarea 硬上限 maxlength=10000（prop 默认 APP_ARTICLE_CONTENT_MAX）", async () => {
    const w = mountEditor({ modelValue: "" });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").attributes("maxlength")).toBe("10000");
  });

  it("显示字数计数 {count}/10000 字", async () => {
    const w = mountEditor({ modelValue: "abc字" });
    await nextTick();
    const counter = w.find('[data-testid="article-char-counter"]');
    expect(counter.exists()).toBe(true);
    expect(counter.text()).toContain("4/10000");
  });

  it("计数按码点统计（emoji 不拆半）", async () => {
    const w = mountEditor({ modelValue: "😀😀" });
    await nextTick();
    expect(w.find('[data-testid="article-char-counter"]').text()).toContain("2/10000");
  });

  it("超限时计数出现 over class", async () => {
    const w = mountEditor({ modelValue: "a".repeat(10001) });
    await nextTick();
    const counter = w.find('[data-testid="article-char-counter"]');
    expect(counter.classes()).toContain("article-char-counter--over");
  });

  it("maxChars prop 可覆盖默认上限", async () => {
    const w = mountEditor({ modelValue: "abcde", maxChars: 10 });
    await nextTick();
    expect(w.find('[data-testid="article-char-counter"]').text()).toContain("5/10");
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").attributes("maxlength")).toBe("10");
  });
});