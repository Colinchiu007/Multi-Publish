import { createApiClient } from './http'

const api = createApiClient()

export function getPublishSummary(days = 30) {
  return api.get('/publish/summary', { params: { days } }).then(r => r.data)
}
