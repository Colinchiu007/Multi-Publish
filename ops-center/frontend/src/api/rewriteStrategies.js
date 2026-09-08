import { createApiClient } from './http'

const api = createApiClient()

export function listRewriteStrategies() {
  return api.get('/rewrite-strategies').then(r => r.data)
}

export function createRewriteStrategy(data) {
  return api.post('/rewrite-strategies', data).then(r => r.data)
}

export function updateRewriteStrategy(id, data) {
  return api.put(`/rewrite-strategies/${encodeURIComponent(id)}`, data).then(r => r.data)
}

export function deleteRewriteStrategy(id) {
  return api.delete(`/rewrite-strategies/${encodeURIComponent(id)}`).then(r => r.data)
}

export function toggleRewriteStrategy(id, enabled) {
  return api.post(`/rewrite-strategies/${encodeURIComponent(id)}/toggle`, { enabled }).then(r => r.data)
}
