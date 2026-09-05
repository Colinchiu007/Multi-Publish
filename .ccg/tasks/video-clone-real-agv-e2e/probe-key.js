const path = require('path')
const fs = require('fs')
const ROOT = 'D:/Data/projects/mp-worktrees/mp-restart'
const DB_PATH = 'D:/tmp/Multi-Publish-debug-profile/multi-publish.db'
const { app, safeStorage } = require('electron')

app.whenReady().then(async () => {
  try {
    const initSqlJs = require(path.join(ROOT, 'node_modules/sql.js'))
    const SQL = await initSqlJs()
    const db = new SQL.Database(fs.readFileSync(DB_PATH))
    
    const stmt = db.prepare("SELECT id, api_key, api_key_enc, models, base_url FROM model_providers WHERE id = 'agnes-video'")
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    
    if (rows.length === 0) { console.log('NOT_FOUND'); db.close(); app.quit(); return }
    const row = rows[0]
    console.log('ID:', row.id)
    console.log('API_KEY_LEN:', (row.api_key || '').length)
    console.log('API_KEY_ENC_LEN:', row.api_key_enc ? row.api_key_enc.length : 0)
    console.log('BASE_URL:', row.base_url)
    console.log('MODELS:', row.models)
    
    let apiKey = ''
    if (row.api_key_enc && row.api_key_enc.length > 0 && safeStorage.isEncryptionAvailable()) {
      try {
        apiKey = safeStorage.decryptString(Buffer.from(row.api_key_enc))
        console.log('DECRYPTED_KEY_LEN:', apiKey.length)
      } catch (e) {
        console.log('DECRYPT_FAILED:', e.message)
      }
    } else if (row.api_key) {
      apiKey = row.api_key
      console.log('PLAIN_KEY_LEN:', apiKey.length)
    }
    
    if (!apiKey) { console.log('NO_API_KEY'); db.close(); app.quit(); return }
    console.log('API_KEY_READY:', apiKey.substring(0, 8) + '...')
    db.close()
  } catch (e) {
    console.error('ERR', e.message, e.stack)
  }
  app.quit()
})
