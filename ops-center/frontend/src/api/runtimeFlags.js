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

export function listRuntimeFlags() {
  return api.get('/feature-flags').then(r => r.data)
}

export function createRuntimeFlag(data) {
  return api.post('/feature-flags', data).then(r => r.data)
}

export function updateRuntimeFlag(key, data) {
  return api.put(`/feature-flags/${encodeURIComponent(key)}`, data).then(r => r.data)
}

export function deleteRuntimeFlag(key) {
  return api.delete(`/feature-flags/${encodeURIComponent(key)}`).then(r => r.data)
}
