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

export function listPlatformDefs() {
  return api.get('/platform-defs').then(r => r.data)
}

export function createPlatformDef(data) {
  return api.post('/platform-defs', data).then(r => r.data)
}

export function updatePlatformDef(id, data) {
  return api.put(`/platform-defs/${id}`, data).then(r => r.data)
}

export function deletePlatformDef(id) {
  return api.delete(`/platform-defs/${id}`).then(r => r.data)
}
