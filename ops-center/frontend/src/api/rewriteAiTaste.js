import { createApiClient } from './http'

const api = createApiClient()

export function listAiTasteEntries() {
  return api.get('/rewrite-ai-taste').then(r => r.data)
}

export function createAiTasteEntry(data) {
  return api.post('/rewrite-ai-taste', data).then(r => r.data)
}

export function updateAiTasteEntry(word, data) {
  return api.put(`/rewrite-ai-taste/${encodeURIComponent(word)}`, data).then(r => r.data)
}

export function deleteAiTasteEntry(word) {
  return api.delete(`/rewrite-ai-taste/${encodeURIComponent(word)}`).then(r => r.data)
}

export function toggleAiTasteEntry(word) {
  return api.post(`/rewrite-ai-taste/${encodeURIComponent(word)}/toggle`).then(r => r.data)
}

export function importAiTasteEntries(entries) {
  return api.post('/rewrite-ai-taste/import', { entries }).then(r => r.data)
}
