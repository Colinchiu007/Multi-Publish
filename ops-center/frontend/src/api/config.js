import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

// Attach auth token from store
api.interceptors.request.use(config => {
  const saved = localStorage.getItem('ops_token')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      if (data.token) {
        config.headers.Authorization = `Bearer ${data.token}`
      }
    } catch {}
  }
  return config
})

// Handle 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ops_token')
    }
    return Promise.reject(err)
  }
)

export function getProjects() {
  return api.get('/config/projects').then(r => r.data)
}

export function getProjectConfig(projectCode, category) {
  return api.get(`/config/${projectCode}`, { params: { category } }).then(r => r.data)
}

export function updateConfigItem(projectCode, category, key, data) {
  return api.put(`/config/${projectCode}/${category}/${key}`, data).then(r => r.data)
}

export function batchUpdateConfig(items) {
  return api.put('/config/batch', { items }).then(r => r.data)
}

export function getAuditLog(params) {
  return api.get('/config/audit-log', { params }).then(r => r.data)
}

export function syncFeatureGates() {
  return api.post('/sync/feature-gates').then(r => r.data)
}

export function getSyncStatus() {
  return api.get('/sync/status').then(r => r.data)
}
