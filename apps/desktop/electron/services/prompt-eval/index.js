// @ts-check
/**
 * PromptEval 门面：createPromptEvalService
 * 组装 store + engine + report/aggregate，供 IPC / main.js 使用。
 */
const { createPromptEvalStore } = require('./store')
const { createPromptEvalEngine } = require('./engine')
const { aggregate } = require('./report')
const { IMAGE_DIMENSIONS, VIDEO_DIMENSIONS, resolveDimensionWeights, gradeForScore } = require('./dimensions')

function createPromptEvalService ({ userDataDir, evaluator, log, fsImpl }) {
  const store = createPromptEvalStore({ userDataDir, log, fsImpl })
  const engine = createPromptEvalEngine({ store, log })

  async function run (request) {
    return engine.evaluateImages(request, { evaluator })
  }

  function list () {
    return store.listRecords()
  }

  function get (id) {
    const record = store.getRecord(String(id))
    if (!record) {
      const e = new Error('评估记录不存在: ' + id)
      e.code = 'EVAL_RECORD_NOT_FOUND'
      throw e
    }
    return record
  }

  function remove (id) {
    return store.deleteRecord(String(id))
  }

  function analyze () {
    return aggregate(store.listRecords().map(r => {
      const full = store.getRecord(r.id)
      return full || r
    }).filter(Boolean))
  }

  function dimensions () {
    return {
      image: IMAGE_DIMENSIONS,
      video: VIDEO_DIMENSIONS,
      weightResolver: { singleImage: resolveDimensionWeights(1), multiImage: resolveDimensionWeights(2) },
      grades: { excellent: '优秀', good: '良好', fair: '一般', poor: '差' },
    }
  }

  return { run, list, get, remove, analyze, dimensions, store }
}

module.exports = { createPromptEvalService }

