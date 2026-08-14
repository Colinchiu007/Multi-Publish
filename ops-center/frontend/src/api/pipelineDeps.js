import { createApiClient } from './http'

const api = createApiClient()

export function listPipelineDeps(params = {}) {
  return api.get('/pipeline-dependencies', { params }).then(r => r.data)
}

export function createPipelineDep(data) {
  return api.post('/pipeline-dependencies', data).then(r => r.data)
}

export function updatePipelineDep(id, data) {
  return api.put(`/pipeline-dependencies/${id}`, data).then(r => r.data)
}

export function deletePipelineDep(id) {
  return api.delete(`/pipeline-dependencies/${id}`).then(r => r.data)
}
