import { createApiClient } from './http'

const api = createApiClient()

export function getProjects() {
  return api.get('/config/projects').then(r => r.data)
}

export function getProjectConfig(projectCode, category) {
  return api.get(`/config/${projectCode}`, { params: { category } }).then(r => r.data)
}

export function updateConfigItem(projectCode, category, key, data) {
  return api.put(`/config/${projectCode}/${category}/${key}`, data).then(r => r.data)
}

export function batchUpdateConfig(items) {
  return api.put('/config/batch', { items }).then(r => r.data)
}

export function getAuditLog(params) {
  return api.get('/config/audit-log', { params }).then(r => r.data)
}

export function syncFeatureGates() {
  return api.post('/sync/feature-gates').then(r => r.data)
}

export function getSyncStatus() {
  return api.get('/sync/status').then(r => r.data)
}
