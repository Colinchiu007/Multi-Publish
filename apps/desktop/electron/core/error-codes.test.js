const { ERROR, getMessage } = require("./error-codes");

describe("ErrorCodes core", () => {
  test("has all error codes", () => {
    expect(ERROR.SUCCESS).toBe(0);
    expect(ERROR.REQUEST_ERROR).toBe(-1);
    expect(ERROR.VALIDATION_ERROR).toBe(-2);
    expect(ERROR.AUTH_ERROR).toBe(-3);
    expect(ERROR.NOT_FOUND).toBe(-4);
    expect(ERROR.TIMEOUT_ERROR).toBe(-5);
    expect(ERROR.NETWORK_ERROR).toBe(-6);
    expect(ERROR.IO_ERROR).toBe(-7);
    expect(ERROR.TASK_CANCELLED).toBe(-999);
    expect(ERROR.UNKNOWN_ERROR).toBe(-99);
  });

  test("getMessage returns correct message", () => {
    expect(getMessage(ERROR.SUCCESS)).toBe("Success");
    expect(getMessage(ERROR.AUTH_ERROR)).toBe("Authentication failed");
    expect(getMessage(ERROR.TASK_CANCELLED)).toBe("Task cancelled");
  });

  test("getMessage returns default for unknown code", () => {
    expect(getMessage(999)).toBe("Unknown error");
  });
});