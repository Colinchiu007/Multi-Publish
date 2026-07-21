'use strict'

function createHarness(options = {}) {
  const cases = []
  const successMark = options.successMark || 'PASS'
  const failureMark = options.failureMark || 'FAIL'

  function test(name, run) {
    cases.push({ name, run })
  }

  async function run() {
    let passed = 0
    let failed = 0
    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index]
      try {
        await testCase.run()
        passed += 1
        console.log(`  ${successMark} ${testCase.name}`)
      } catch (error) {
        failed += 1
        console.error(`  ${failureMark} ${testCase.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    console.log(`\n========== Result: ${passed}/${passed + failed} ==========`)
    if (failed > 0) process.exitCode = 1
    return { passed, failed }
  }

  return { run, test }
}

module.exports = { createHarness }
