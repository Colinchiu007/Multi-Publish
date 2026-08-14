import { createApiClient } from './http'

const api = createApiClient()

export function listRuntimeFlags() {
  return api.get('/feature-flags').then(r => r.data)
}

export function createRuntimeFlag(data) {
  return api.post('/feature-flags', data).then(r => r.data)
}

export function updateRuntimeFlag(key, data) {
  return api.put(`/feature-flags/${encodeURIComponent(key)}`, data).then(r => r.data)
}

export function deleteRuntimeFlag(key) {
  return api.delete(`/feature-flags/${encodeURIComponent(key)}`).then(r => r.data)
}
