import { createApiClient } from './http'

const api = createApiClient()

export function listPipelineOptions() {
  return api.get('/pipeline-options').then(r => r.data)
}

export function savePipelineOptions(items) {
  return api.put('/pipeline-options', { items }).then(r => r.data)
}