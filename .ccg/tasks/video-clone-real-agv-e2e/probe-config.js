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
    
    const stmt = db.prepare("SELECT id, config FROM model_providers WHERE id = 'agnes-video'")
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    
    if (rows.length === 0) { console.log('NOT_FOUND'); db.close(); app.quit(); return }
    const config = JSON.parse(rows[0].config || '{}')
    console.log('CONFIG_KEYS:', Object.keys(config))
    console.log('CONFIG:', JSON.stringify(config, null, 2).substring(0, 500))
    console.log('---')
    
    // 也查一下所有 video provider 的 basic info
    const stmt2 = db.prepare("SELECT id, category, models FROM model_providers WHERE category = 'video'")
    const all = []
    while (stmt2.step()) all.push(stmt2.getAsObject())
    stmt2.free()
    for (const r of all) {
      console.log('VIDEO_PROVIDER:', r.id, '| models:', r.models, '| category:', r.category)
    }
    db.close()
  } catch (e) {
    console.error('ERR', e.message)
  }
  app.quit()
})
