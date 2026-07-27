const assert = require('node:assert/strict')
const { describe, it } = require('node:test')

const { auditInitialControls } = require('./route-functional-suite')

function emptyCollection () {
  return {
    count: async () => 0,
    evaluateAll: async () => [],
  }
}

function clickableLocator () {
  const locator = {
    clicks: 0,
    count: async () => 1,
    isDisabled: async () => false,
    click: async () => { locator.clicks += 1 },
  }
  return locator
}

describe('route-functional-suite manual 扫描合同', () => {
  it('只计数 data-e2e-scan=manual 按钮，不自动点击', async () => {
    const automaticButton = clickableLocator()
    const manualButton = clickableLocator()
    const domButtons = [
      {
        getClientRects: () => [{}],
        closest: () => null,
        textContent: '刷新',
        getAttribute: (name) => ({ 'data-testid': 'refresh-accounts' })[name] || null,
        disabled: false,
      },
      {
        getClientRects: () => [{}],
        closest: () => null,
        textContent: '删除',
        getAttribute: (name) => ({
          'data-testid': 'delete-account-a',
          'data-e2e-scan': 'manual',
        })[name] || null,
        disabled: false,
      },
    ]
    const buttons = {
      evaluateAll: async (collect) => collect(domButtons),
    }
    const empty = emptyCollection()
    const resetCalls = []
    const r = {
      checks: [],
      resetToRoute: async (...args) => { resetCalls.push(args) },
      page: {
        locator: (selector) => {
          if (selector === '.cohere-main button') return buttons
          if (selector === '.cohere-main button[data-testid="refresh-accounts"]') return automaticButton
          if (selector === '.cohere-main button[data-testid="delete-account-a"]') return manualButton
          return empty
        },
      },
    }

    await auditInitialControls(r, { route: '/accounts', initialAuditStrategy: 'semantic' })

    assert.equal(automaticButton.clicks, 1)
    assert.equal(manualButton.clicks, 0)
    assert.ok(resetCalls.length >= 3)
    assert.deepEqual(r.checks.find((item) => item.name === '初始可用按钮语义采样完成'), {
      kind: 'functional',
      name: '初始可用按钮语义采样完成',
      passed: true,
      details: {
        total: 2,
        manual: 1,
        sampled: 1,
        suppressed: 0,
        clicked: 1,
        skipped: 0,
        failures: [],
      },
    })
  })
})
