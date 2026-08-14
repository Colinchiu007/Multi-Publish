import { createApiClient } from './http'

const api = createApiClient()

export function getUsageSummary(days = 30) {
  return api.get('/usage/summary', { params: { days } }).then(r => r.data)
}
