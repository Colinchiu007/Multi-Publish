// @ts-check
/**
 * 视频克隆运行记录存储（切片 4d）
 * 每 runId 一个 JSON 文件（runs/<runId>.json），支持保存/加载/列表。
 * baseDir 注入（生产为 app.getPath('userData')/video-clone，测试用临时目录）。
 */
const fs = require('node:fs')
const path = require('node:path')

function createVideoCloneStore({ baseDir }) {
  const runsDir = path.join(baseDir, 'runs')
  fs.mkdirSync(runsDir, { recursive: true })

  function saveRun(record) {
    if (!record || typeof record.runId !== 'string') throw new Error('record.runId 缺失')
    const file = path.join(runsDir, record.runId + '.json')
    fs.writeFileSync(file, JSON.stringify(record, null, 2))
    return record
  }

  function loadRun(runId) {
    try {
      return JSON.parse(fs.readFileSync(path.join(runsDir, runId + '.json'), 'utf8'))
    } catch { return null }
  }

  function listRuns() {
    let files = []
    try { files = fs.readdirSync(runsDir) } catch { return [] }
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(runsDir, f), 'utf8'))
          return { runId: r.runId, createdAt: r.createdAt, status: r.status, hasReport: !!r.report, hasSimilarity: !!r.similarity }
        } catch { return null }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  return { saveRun, loadRun, listRuns, runsDir }
}

module.exports = { createVideoCloneStore }
