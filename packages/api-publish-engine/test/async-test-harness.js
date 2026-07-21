'use strict'

function createHarness() {
  const cases = []

  function test(name, callback) {
    cases.push({ name, callback })
  }

  async function run() {
    let passed = 0
    let failed = 0
    for (const testCase of cases) {
      try {
        await testCase.callback()
        passed += 1
        console.log(`  ✅ ${testCase.name}`)
      } catch (error) {
        failed += 1
        console.error(`  ❌ ${testCase.name}: ${error && error.stack ? error.stack : error}`)
      }
    }
    console.log(`\n========== ${passed}/${passed + failed} ==========`)
    if (failed > 0) process.exitCode = 1
    return { passed, failed }
  }

  return { run, test }
}

module.exports = { createHarness }
