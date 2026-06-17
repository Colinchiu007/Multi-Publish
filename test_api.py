import httpx

BASE = 'http://127.0.0.1:8082'

# Test 1: Health check
r = httpx.get(BASE + '/api/health')
print('GET /api/health:', r.status_code)

# Test 2: Publish with ASCII
r = httpx.post(BASE + '/api/publish', json={
    'title': 'Test Article',
    'content': 'Test content for multi-publish',
    'platforms': ['wechat_mp']
})
print('POST /api/publish (ASCII):', r.status_code)
print('  Response:', r.text[:300])

# Test 3: Publish with Chinese
r = httpx.post(BASE + '/api/publish', json={
    'title': '测试文章',
    'content': '这是测试内容',
    'platforms': ['wechat_mp']
})
print('POST /api/publish (Chinese):', r.status_code)
print('  Response:', r.text[:300])

# Test 4: List tasks
r = httpx.get(BASE + '/api/tasks')
print('GET /api/tasks:', r.status_code)
print('  Response:', r.text[:200])

# Test 5: Get schedules
r = httpx.get(BASE + '/api/schedules')
print('GET /api/schedules:', r.status_code)
print('  Response:', r.text[:200])
