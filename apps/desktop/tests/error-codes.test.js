/**
 * error-codes unit tests
 */
var EC = require("../electron/error-codes")

describe("error-codes", function() {
  test("ERROR is frozen with expected codes", function() {
    expect(EC.ERROR.SUCCESS).toBe(0)
    expect(EC.ERROR.REQUEST_ERROR).toBe(-1)
    expect(EC.ERROR.VALIDATION_ERROR).toBe(-2)
    expect(EC.ERROR.AUTH_ERROR).toBe(-3)
    expect(EC.ERROR.NOT_FOUND).toBe(-4)
    expect(EC.ERROR.TIMEOUT_ERROR).toBe(-5)
    expect(EC.ERROR.NETWORK_ERROR).toBe(-6)
    expect(EC.ERROR.IO_ERROR).toBe(-7)
    expect(EC.ERROR.TASK_CANCELLED).toBe(-999)
    expect(EC.ERROR.UNKNOWN_ERROR).toBe(-99)
  })

  test("getMessage returns correct messages", function() {
    expect(EC.getMessage(0)).toBe("Success")
    expect(EC.getMessage(-2)).toBe("Validation error")
    expect(EC.getMessage(-999)).toBe("Task cancelled")
  })

  test("getMessage returns fallback for unknown code", function() {
    expect(EC.getMessage(999)).toBe("Unknown error")
  })
})