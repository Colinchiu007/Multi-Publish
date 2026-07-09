/**
 * OnboardingManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(false),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
})

const onboarding = require("../electron/services/onboarding")

describe("OnboardingManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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