// CSS comment-closure regression tests
//
// Guards against the tokens.css bug where a comment body containing a
// star-slash sequence (e.g. "--space-*/-/--r-*") closed the comment early,
// turning the trailing text plus ":root" into an invalid selector prelude
// so the whole :root rule block was dropped by the browser and every
// var(--primary) consumer (e.g. .cohere-btn-primary "保存" button) rendered
// transparent/white.
//
// Scan rule: walk the file as the CSS tokenizer does. Inside a comment,
// only the star-slash sequence ends it. Outside a comment, a star-slash
// sequence is a lone closer — evidence that some earlier comment closed
// prematurely — and any comment still open at EOF is unclosed.
const fs = require("fs")
const path = require("path")

function scanCssComments (css) {
  const errors = []
  let inComment = false
  let commentStart = -1
  let i = 0
  while (i < css.length - 1) {
    const a = css[i]
    const b = css[i + 1]
    if (!inComment && a === "/" && b === "*") {
      inComment = true
      commentStart = i
      i += 2
      continue
    }
    if (inComment && a === "*" && b === "/") {
      inComment = false
      commentStart = -1
      i += 2
      continue
    }
    if (!inComment && a === "*" && b === "/") {
      errors.push(
        "lone closer '*/' at offset " + i + " — a previous comment closed early"
      )
      i += 2
      continue
    }
    i += 1
  }
  if (inComment) {
    errors.push("unclosed comment starting at offset " + commentStart)
  }
  return errors
}

describe("styles CSS comment closure", () => {
  const stylesDir = path.join(__dirname, "../src/styles")

  test("all src/styles/*.css files have well-closed comments", () => {
    const files = fs
      .readdirSync(stylesDir)
      .filter((f) => f.endsWith(".css"))
      .sort()
    expect(files.length).toBeGreaterThan(0)
    const failures = []
    for (const file of files) {
      const css = fs.readFileSync(path.join(stylesDir, file), "utf8")
      const errors = scanCssComments(css)
      if (errors.length > 0) {
        failures.push(file + ": " + errors.join("; "))
      }
    }
    expect(failures).toEqual([])
  })

  test("scan detects a comment closed early by */ inside its body", () => {
    // The historical tokens.css failure pattern: "--space-*/--r-*" inside
    // a comment ends the comment at the first "*/", and the stray text plus
    // ":root" then produce an invalid rule that the browser drops.
    const bad = `/**
 * keep (--space-*/--r-*) alive
 */
:root {
  --color-primary: #5048E5;
}
`
    const errors = scanCssComments(bad)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.indexOf("lone closer") >= 0)).toBe(true)
  })

  test("scan accepts well-formed comments and :root rules", () => {
    const good = `/**
 * keep (--space-* vs --r-*) as plain text
 */
:root {
  --color-primary: #5048E5;
}
/* trailing comment */
`
    expect(scanCssComments(good)).toEqual([])
  })

  test("scan detects an unclosed comment", () => {
    expect(scanCssComments(":root {\n  /* never closed\n}")).toHaveLength(1)
  })
})
