#!/bin/bash
# 验证 Nginx 路径前缀守卫修复（2026-07-25 QM-5）
set -e

echo "---reload nginx---"
systemctl reload nginx
sleep 1

echo "---check /api/v1/health (expect 200)---"
curl -s -o /dev/null -w "%{http_code}\n" https://auth.iart.work/api/v1/health

echo "---check /api/v1/ready (expect 200 or 503)---"
curl -s -o /dev/null -w "%{http_code}\n" https://auth.iart.work/api/v1/ready

echo "---check /api/users (expect Logto 4xx, NOT 401 'Valid API key required')---"
curl -s -o /tmp/api-users-resp -w "%{http_code}\n" https://auth.iart.work/api/users
echo "body:"
head -c 300 /tmp/api-users-resp
echo

echo "---check /api/forgot-password (expect Logto response, NOT 401 'Valid API key required')---"
curl -s -o /tmp/forgot-resp -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"phone":"13800138000"}' https://auth.iart.work/api/forgot-password
echo "body:"
head -c 300 /tmp/forgot-resp
echo

echo "---check root / (expect Logto UI 200/302)---"
curl -s -o /dev/null -w "%{http_code}\n" https://auth.iart.work/

echo "---all checks done---"
