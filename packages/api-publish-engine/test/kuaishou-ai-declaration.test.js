// @ts-check
import { describe, it, expect, beforeEach } from "vitest"
import KuaishouAdapter from "../src/adapters/kuaishou"

describe("KuaishouAdapter AI 内容声明", () => {
  let adapter
  beforeEach(() => { adapter = new KuaishouAdapter() })

  it("默认声明为 AI 生成内容（ai_generated=1）", () => {
    const data = adapter.buildPostData({ title: "测试", content: "测试内容", tags: ["标签1"] })
    expect(data.ai_generated).toBe(1)
  })

  it("显式 aiGenerated=false 时声明为人工创作（ai_generated=0）", () => {
    const data = adapter.buildPostData({ title: "人工", aiGenerated: false })
    expect(data.ai_generated).toBe(0)
  })

  it("显式 aiGenerated=true 时声明为 AI 生成（ai_generated=1）", () => {
    const data = adapter.buildPostData({ title: "AI", aiGenerated: true })
    expect(data.ai_generated).toBe(1)
  })

  it("非布尔真值仍按 AI 生成处理", () => {
    expect(adapter.buildPostData({ title: "t", aiGenerated: undefined }).ai_generated).toBe(1)
    expect(adapter.buildPostData({ title: "t", aiGenerated: null }).ai_generated).toBe(1)
    expect(adapter.buildPostData({ title: "t", aiGenerated: 1 }).ai_generated).toBe(1)
  })

  it("保留原有字段", () => {
    const data = adapter.buildPostData({ title: "完整", content: "内容", tags: ["科技"], aiGenerated: false })
    expect(data.title).toBe("完整")
    expect(data.content).toBe("内容")
    expect(data.tags).toEqual(["科技"])
    expect(data.ai_generated).toBe(0)
  })

  it("空数据仍默认 AI 生成", () => {
    const data = adapter.buildPostData({})
    expect(data.ai_generated).toBe(1)
    expect(data.title).toBe("")
    expect(data.content).toBe("")
    expect(data.tags).toEqual([])
  })
})
