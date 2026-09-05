const path = require('path')
const fs = require('fs')
const ROOT = 'D:/Data/projects/mp-worktrees/mp-restart'
const DB_PATH = 'D:/tmp/Multi-Publish-debug-profile/multi-publish.db'
const { app } = require('electron')

app.whenReady().then(async () => {
  try {
    const initSqlJs = require(path.join(ROOT, 'node_modules/sql.js'))
    const SQL = await initSqlJs()
    const db = new SQL.Database(fs.readFileSync(DB_PATH))
    
    // 查看表结构
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").getAsObject()
    console.log('TABLE:', tables)

    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table'")
    const all = []
    while (stmt.step()) all.push(stmt.getAsObject())
    stmt.free()
    for (const r of all) {
      if (String(r.sql).includes('model_providers') || String(r.sql).includes('provider') || String(r.sql).includes('api_key') || String(r.sql).includes('credential')) {
        console.log('---')
        console.log(r.sql.substring(0, 300))
      }
    }
    db.close()
  } catch (e) {
    console.error('ERR', e.message)
  }
  app.quit()
})
