import { createApiClient } from './http'

const api = createApiClient()

export function getDiagnosticsSummary (days = 30) {
  return api.get('/diagnostics/summary', { params: { days } }).then(r => r.data)
}

export function getDiagnosticsSamples (params = {}) {
  return api.get('/diagnostics/samples', { params }).then(r => r.data)
}
