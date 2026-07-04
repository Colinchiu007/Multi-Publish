/**
 * RedemptionCodes unit tests
 */
// Note: crypto.randomBytes is NOT mocked to ensure unique codes in batch generation
// The generate function uses crypto.randomBytes directly

describe("RedemptionCodes", function() {
  let RedemptionCodes

  beforeAll(function() {
    RedemptionCodes = require("../electron/redemption-codes")
  })

  test("generates a valid code", function() {
    let code = RedemptionCodes.generate()
    expect(code).toBeDefined()
    expect(typeof code).toBe("string")
    expect(code.split("-").length).toBe(4)
  })

  test("generated code passes validation", function() {
    let code = RedemptionCodes.generate()
    let result = RedemptionCodes.validate(code)
    expect(result.valid).toBe(true)
  })

  test("validate returns invalid for random string", function() {
    let result = RedemptionCodes.validate("INVALID-CODE-HERE-1234")
    expect(result.valid).toBe(false)
  })

  test("validate returns invalid for tampered code", function() {
    let code = RedemptionCodes.generate()
    let tampered = code.slice(0, -1) + String.fromCharCode(code.charCodeAt(code.length - 1) ^ 1)
    let result = RedemptionCodes.validate(tampered)
    expect(result.valid).toBe(false)
  })

  test("generateBatch creates multiple unique codes", function() {
    let codes = RedemptionCodes.generateBatch(5)
    expect(Array.isArray(codes)).toBe(true)
    expect(codes.length).toBe(5)
    let unique = new Set(codes)
    expect(unique.size).toBe(5)
  })

  test("code with metadata validates successfully", function() {
    let code = RedemptionCodes.generate({ plan: "pro", duration: "lifetime" })
    let result = RedemptionCodes.validate(code)
    expect(result.valid).toBe(true)
  })

  test("code with metadata parameters is still valid", function() {
    // Metadata is embedded as signature, doesn't affect validity
    let code = RedemptionCodes.generate({ plan: "pro" })
    let result = RedemptionCodes.validate(code)
    expect(result.valid).toBe(true)
  })

  test("code format validation rejects wrong format", function() {
    expect(RedemptionCodes.validate("").valid).toBe(false)
    expect(RedemptionCodes.validate("SHORT").valid).toBe(false)
    expect(RedemptionCodes.validate("AAAA-BBBB-CCCC").valid).toBe(false)
    expect(RedemptionCodes.validate(12345).valid).toBe(false)
  })
})
