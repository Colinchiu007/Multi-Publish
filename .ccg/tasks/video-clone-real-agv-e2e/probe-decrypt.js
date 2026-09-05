const { app, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  try {
    const ROOT = 'D:/Data/projects/mp-worktrees/mp-restart'
    const DB_PATH = 'D:/tmp/Multi-Publish-debug-profile/multi-publish.db'
    
    const initSqlJs = require(path.join(ROOT, 'node_modules/sql.js'))
    const SQL = await initSqlJs()
    const db = new SQL.Database(fs.readFileSync(DB_PATH))
    
    const stmt = db.prepare("SELECT id, api_key_enc, base_url FROM model_providers WHERE id = 'agnes-video'")
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    db.close()
    
    if (rows.length === 0) { console.log('NOT_FOUND'); app.quit(); return }
    const row = rows[0]
    console.log('ENC_TYPE:', typeof row.api_key_enc, row.api_key_enc && row.api_key_enc.constructor && row.api_key_enc.constructor.name)
    console.log('ENC_LEN:', row.api_key_enc ? (row.api_key_enc.length || row.api_key_enc.byteLength || 'N/A') : 0)
    
    // 尝试各种格式传给 decryptString
    let buf
    if (row.api_key_enc instanceof Uint8Array) {
      buf = Buffer.from(row.api_key_enc)
    } else if (Buffer.isBuffer(row.api_key_enc)) {
      buf = row.api_key_enc
    } else if (typeof row.api_key_enc === 'string') {
      buf = Buffer.from(row.api_key_enc, 'base64')
    } else {
      console.log('UNKNOWN_TYPE'); app.quit(); return
    }
    console.log('BUF_LEN:', buf.length)
    
    try {
      const decrypted = safeStorage.decryptString(buf)
      console.log('DECRYPTED_LEN:', decrypted.length)
      console.log('DECRYPTED_PREFIX:', decrypted.substring(0, 10) + '...')
      console.log('API_KEY_DECRYPTED_OK')
    } catch (e) {
      console.log('DECRYPT_FAILED:', e.message)
    }
  } catch (e) {
    console.error('ERR', e.message)
  }
  app.quit()
})
