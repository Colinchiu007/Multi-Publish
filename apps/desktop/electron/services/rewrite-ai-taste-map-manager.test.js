// @ts-check
/**
 * RewriteAiTasteMapManager 单元测试（ai-taste-ops-center 刀 2）
 * 覆盖：sanitize 判据（与 ops-center 同表）、applyRemote 变更检测、持久化往返、
 * getMap 排除 disabled、getDisabled、空下发清空覆盖层（回内置）。
 */
const os = require("os")
const path = require("path")
const fs = require("fs")
const RewriteAiTasteMapManager = require("./rewrite-ai-taste-map-manager")

function tmpFile() {
  return path.join(os.tmpdir(), "rat-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".json")
}

const ENTRY_OK = { word: "综上所述", replacement: "归根结底", severity: "S1", enabled: true }

describe("RewriteAiTasteMapManager sanitize", () => {
  test("M1a 合法条目通过（enabled 0/1 都保留）", () => {
    const a = RewriteAiTasteMapManager.sanitizeRemoteEntry({ word: "综上所述", replacement: "归根结底", severity: "S1", enabled: true })
    expect(a).toEqual({ word: "综上所述", replacement: "归根结底", severity: "S1", enabled: true })
    const b = RewriteAiTasteMapManager.sanitizeRemoteEntry({ word: "某词", replacement: "某替", severity: "S2", enabled: false })
    expect(b).toEqual({ word: "某词", replacement: "某替", severity: "S2", enabled: false })
  })

  test("M1b 判据拒绝表（与 ops-center 同表）：控制字符/纯标点/正则元字符/超长/非法 severity/空值", () => {
    const bad = [
      { word: "换行\n词", replacement: "x", severity: "S2" },
      { word: ".", replacement: "x", severity: "S2" },
      { word: "好词", replacement: "", severity: "S2" },
      { word: "好词", replacement: "x", severity: "S4" },
      { word: "好".repeat(31), replacement: "x", severity: "S2" },
      { word: "好词", replacement: "长".repeat(51), severity: "S2" },
      { word: "", replacement: "x", severity: "S2" },
      null,
      "string",
      { word: "好词", replacement: 123, severity: "S2" },
    ]
    for (const e of bad) {
      expect(RewriteAiTasteMapManager.sanitizeRemoteEntry(e)).toBeNull()
    }
  })

  test("M1c severity 缺省回 S2", () => {
    const a = RewriteAiTasteMapManager.sanitizeRemoteEntry({ word: "好词", replacement: "替换" })
    expect(a).toEqual({ word: "好词", replacement: "替换", severity: "S2", enabled: true })
  })
})

describe("RewriteAiTasteMapManager applyRemote / getters", () => {
  test("M2 applyRemote 变更检测（同内容 false、变更 true、非数组 false）", () => {
    const m = new RewriteAiTasteMapManager(tmpFile())
    expect(m.applyRemote([ENTRY_OK])).toBe(true)
    expect(m.applyRemote([ENTRY_OK])).toBe(false)
    expect(m.applyRemote([{ ...ENTRY_OK, replacement: "改口" }])).toBe(true)
    expect(m.applyRemote("not-array")).toBe(false)
    expect(m.applyRemote(null)).toBe(false)
  })

  test("M3 持久化往返（load 恢复下发内容）", () => {
    const file = tmpFile()
    const m1 = new RewriteAiTasteMapManager(file)
    m1.applyRemote([ENTRY_OK, { word: "停用词", replacement: "停用替", severity: "S2", enabled: false }])
    const m2 = new RewriteAiTasteMapManager(file)
    expect(m2.getMap()["综上所述"]).toBe("归根结底")
    expect(m2.getDisabled()).toEqual(["停用词"])
    expect(m2.getCurrent().length).toBe(2)
  })

  test("M4 getMap 仅含 enabled=1，返回 plain object（引擎注入形态）", () => {
    const m = new RewriteAiTasteMapManager(tmpFile())
    m.applyRemote([
      ENTRY_OK,
      { word: "停用词", replacement: "停用替", severity: "S2", enabled: false },
    ])
    const map = m.getMap()
    expect(map["综上所述"]).toBe("归根结底")
    expect(map["停用词"]).toBeUndefined()
    expect(Object.getPrototypeOf(map)).toBe(Object.prototype)
  })

  test("M5 getDisabled 返回 enabled=0 的 word 数组", () => {
    const m = new RewriteAiTasteMapManager(tmpFile())
    m.applyRemote([
      ENTRY_OK,
      { word: "停用词", replacement: "停用替", severity: "S2", enabled: false },
      { word: "停用词2", replacement: "停用替2", severity: "S2", enabled: false },
    ])
    expect(m.getDisabled().sort()).toEqual(["停用词", "停用词2"])
  })

  test("M6 空下发（空数组）清空覆盖层（回内置语义）", () => {
    const m = new RewriteAiTasteMapManager(tmpFile())
    m.applyRemote([ENTRY_OK])
    expect(m.getMap()["综上所述"]).toBe("归根结底")
    m.applyRemote([])
    expect(Object.keys(m.getMap()).length).toBe(0)
    expect(m.getDisabled().length).toBe(0)
  })

  test("M7 混合下发逐条 sanitize：非法条目跳过不影响合法条目", () => {
    const m = new RewriteAiTasteMapManager(tmpFile())
    m.applyRemote([
      ENTRY_OK,
      { word: "坏词\n", replacement: "x", severity: "S2" },
      { word: ".", replacement: "x", severity: "S2" },
    ])
    expect(Object.keys(m.getMap())).toEqual(["综上所述"])
  })
})
