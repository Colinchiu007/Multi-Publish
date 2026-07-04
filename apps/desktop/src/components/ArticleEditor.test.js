import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@vueup/vue-quill", () => ({
  QuillEditor: { name: "QuillEditor", template: "<div class='quill-mock' />", props: ["content", "contentType", "options"] }
}));

import ArticleEditor from "./ArticleEditor.vue";

describe("ArticleEditor", () => {
  it("renders in rich text mode by default", () => {
    const w = mount(ArticleEditor, { props: { modelValue: "" } });
    expect(w.find(".quill-mock").exists()).toBe(true);
  });

  it("switches to markdown mode on tab click", async () => {
    const w = mount(ArticleEditor, { props: { modelValue: "" } });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find(".quill-mock").exists()).toBe(false);
    expect(w.find("textarea").exists()).toBe(true);
  });

  it("shows placeholder in markdown mode", async () => {
    const w = mount(ArticleEditor, { props: { modelValue: "", placeholder: "在此编辑内容..." } });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").attributes("placeholder")).toBe("在此编辑内容...");
  });

  it("markdown textarea shows modelValue", async () => {
    const w = mount(ArticleEditor, { props: { modelValue: "测试内容" } });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    expect(w.find("textarea").element.value).toBe("测试内容");
  });

  it("emits update:modelValue on markdown edit", async () => {
    const w = mount(ArticleEditor, { props: { modelValue: "" } });
    await nextTick();
    const mdBtn = w.findAll("button").filter(b => b.text().includes("Markdown"));
    await mdBtn[0].trigger("click");
    await nextTick();
    const textarea = w.find("textarea");
    await textarea.setValue("新内容");
    expect(w.emitted("update:modelValue")).toBeTruthy();
    expect(w.emitted("update:modelValue")[0]).toEqual(["新内容"]);
  });
});