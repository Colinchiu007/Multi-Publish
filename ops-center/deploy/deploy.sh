#!/bin/bash
set -e
echo "=== OpsCenter Deploy ==="

# 1. Sync code from GitHub
cd /root/ops-center
git pull origin main 2>/dev/null || git clone https://github.com/Colinchiu007/ops-center.git /root/ops-center

# 2. Install backend deps
cd /root/ops-center/backend
pip install -r requirements.txt --break-system-packages -q

# 3. Seed DB (idempotent)
python3 -c "
import asyncio, sys
sys.path.insert(0, '.')
from database import init_db
from scripts.seed import seed_projects, seed_feature_gates
async def main():
    await init_db()
    await seed_projects()
    await seed_feature_gates('/root/platform-orchestrator/feature_gates.yaml')
asyncio.run(main())
"

# 4. Build frontend
cd /root/ops-center/frontend
npm install --silent
npm run build

# 5. Copy frontend static files to nginx path
mkdir -p /var/www/ops-center
cp -r dist/* /var/www/ops-center/

# 6. Update nginx config
if [ -f /tmp/nginx-ops.conf ]; then
    cp /tmp/nginx-ops.conf /etc/nginx/conf.d/ops-center.conf
    nginx -t && systemctl reload nginx
fi

# 7. Restart service
cp /tmp/ops-center.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable ops-center
systemctl restart ops-center

echo "=== OpsCenter deployed ==="
curl -s http://127.0.0.1:8010/health
