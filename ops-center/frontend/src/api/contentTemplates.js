import { createApiClient } from './http'

const api = createApiClient()

export function listContentTemplates() {
  return api.get('/content-templates').then(r => r.data)
}

export function createContentTemplate(data) {
  return api.post('/content-templates', data).then(r => r.data)
}

export function updateContentTemplate(id, data) {
  return api.put(`/content-templates/${encodeURIComponent(id)}`, data).then(r => r.data)
}

export function deleteContentTemplate(id) {
  return api.delete(`/content-templates/${encodeURIComponent(id)}`).then(r => r.data)
}
