import { createApiClient } from './http'

const api = createApiClient()

export function createRedemptionBatch(data) {
  return api.post('/redemption-codes/batch', data).then(r => r.data)
}

export function listRedemptionCodes(params = {}) {
  return api.get('/redemption-codes', { params }).then(r => r.data)
}

export function revokeRedemptionCode(code) {
  return api.put(`/redemption-codes/${encodeURIComponent(code)}/revoke`).then(r => r.data)
}

export function deleteRedemptionCode(code) {
  return api.delete(`/redemption-codes/${encodeURIComponent(code)}`).then(r => r.data)
}
