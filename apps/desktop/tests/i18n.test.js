/**
 * i18n unit tests
 */
const fs = require("fs")
const path = require("path")

describe("i18n configuration", () => {
  test("locale files exist", () => {
    const zhPath = path.join(__dirname, "../src/locales/zh.js")
    const enPath = path.join(__dirname, "../src/locales/en.js")
    
    expect(fs.existsSync(zhPath)).toBe(true)
    expect(fs.existsSync(enPath)).toBe(true)
  })

  test("zh locale file has content", () => {
    const zhPath = path.join(__dirname, "../src/locales/zh.js")
    const content = fs.readFileSync(zhPath, "utf8")
    expect(content).toContain("common")
    expect(content).toContain("nav")
    expect(content).toContain("publish")
  })

  test("en locale file has content", () => {
    const enPath = path.join(__dirname, "../src/locales/en.js")
    const content = fs.readFileSync(enPath, "utf8")
    expect(content).toContain("common")
    expect(content).toContain("nav")
    expect(content).toContain("publish")
  })
})