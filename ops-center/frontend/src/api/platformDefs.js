import { createApiClient } from './http'

const api = createApiClient()

export function listPlatformDefs() {
  return api.get('/platform-defs').then(r => r.data)
}

export function createPlatformDef(data) {
  return api.post('/platform-defs', data).then(r => r.data)
}

export function updatePlatformDef(id, data) {
  return api.put(`/platform-defs/${id}`, data).then(r => r.data)
}

export function deletePlatformDef(id) {
  return api.delete(`/platform-defs/${id}`).then(r => r.data)
}
