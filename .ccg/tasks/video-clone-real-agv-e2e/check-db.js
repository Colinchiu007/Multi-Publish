const initSqlJs = require('D:/Data/projects/mp-worktrees/mp-restart/node_modules/sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();

  // Check all possible DB locations
  const paths = [
    'D:/tmp/Multi-Publish-debug-profile/multi-publish.db',
    'D:/Data/projects/Multi-Publish/Files/Git/cmd/git.exe/20260903-123414622-shared-user-data_multi-publish.db',
    // Standard Electron userData paths
    process.env.APPDATA + '/multi-publish/multi-publish.db',
    process.env.LOCALAPPDATA + '/multi-publish/multi-publish.db',
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`\n=== ${p} (${fs.statSync(p).size} bytes) ===`);
      const db = new SQL.Database(fs.readFileSync(p));
      const stmt = db.prepare("SELECT id, config FROM model_providers WHERE id = 'agnes-video'");
      while (stmt.step()) {
        const r = stmt.getAsObject();
        const cfg = JSON.parse(r.config || '{}');
        console.log(`  id=${r.id} has_key=${!!cfg.api_key_enc} has_models=${!!cfg.models} enabled=${cfg.enabled} base_url=${cfg.base_url || 'default'}`);
        if (cfg.api_key_enc) console.log('  KEY_FOUND length=' + cfg.api_key_enc.length);
        if (cfg.models) console.log('  MODELS=' + cfg.models);
      }
      stmt.free();
      db.close();
    } else {
      console.log(`\n=== ${p} NOT FOUND ===`);
    }
  }
})();