import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use(config => {
  const saved = localStorage.getItem('ops_token')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      if (data.token) config.headers.Authorization = `Bearer ${data.token}`
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) localStorage.removeItem('ops_token')
    return Promise.reject(err)
  }
)

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
