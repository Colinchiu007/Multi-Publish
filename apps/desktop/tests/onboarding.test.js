/**
 * OnboardingManager unit tests
 */
jest.mock("electron", () => ({
  app: {
    getPath: jest.fn().mockReturnValue("/tmp/test-user-data"),
    getAppPath: jest.fn().mockReturnValue("/tmp"),
  },
}))

jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}))

const onboarding = require("../electron/onboarding")

describe("OnboardingManager", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test("isOnboardingDone returns false initially", () => {
    expect(onboarding.isOnboardingDone()).toBe(false)
  })

  test("getSteps returns 4 steps", () => {
    const steps = onboarding.getSteps()
    expect(steps).toHaveLength(4)
    expect(steps[0].id).toBe("welcome")
    expect(steps[1].id).toBe("accounts")
    expect(steps[2].id).toBe("publish")
    expect(steps[3].id).toBe("complete")
  })

  test("completeOnboarding writes file", () => {
    const result = onboarding.completeOnboarding()
    expect(result).toBe(true)
  })

  test("resetOnboarding removes file", () => {
    const fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    onboarding.resetOnboarding()
    expect(fs.unlinkSync).toHaveBeenCalled()
  })
})