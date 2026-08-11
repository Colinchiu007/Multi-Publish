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

export function listContentTemplates() {
  return api.get('/content-templates').then(r => r.data)
}

export function createContentTemplate(data) {
  return api.post('/content-templates', data).then(r => r.data)
}

export function updateContentTemplate(id, data) {
  return api.put(`/content-templates/${encodeURIComponent(id)}`, data).then(r => r.data)
}

export function deleteContentTemplate(id) {
  return api.delete(`/content-templates/${encodeURIComponent(id)}`).then(r => r.data)
}
