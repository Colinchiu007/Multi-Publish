const initSqlJs = require('D:/Data/projects/mp-worktrees/mp-restart/node_modules/sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('D:/tmp/Multi-Publish-debug-profile/multi-publish.db'));
  const stmt = db.prepare("SELECT id, config FROM model_providers WHERE id = 'agnes-video'");
  while (stmt.step()) {
    const r = stmt.getAsObject();
    console.log('id:', r.id);
    console.log('config raw:', r.config);
    if (r.config) {
      const cfg = JSON.parse(r.config);
      console.log('parsed keys:', Object.keys(cfg).join(', '));
      console.log('api_key_enc:', cfg.api_key_enc ? 'present (len=' + cfg.api_key_enc.length + ')' : 'MISSING');
      console.log('enabled:', cfg.enabled);
      console.log('models:', cfg.models);
      console.log('base_url:', cfg.base_url || 'default');
    }
  }
  stmt.free();
  db.close();
})();