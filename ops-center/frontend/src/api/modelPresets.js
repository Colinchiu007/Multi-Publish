import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

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

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ops_token')
    }
    return Promise.reject(err)
  }
)

export function listModelPresets(params = {}) {
  return api.get('/model-presets', { params }).then(r => r.data)
}

export function getModelPreset(id) {
  return api.get(`/model-presets/${id}`).then(r => r.data)
}

export function createModelPreset(data) {
  return api.post('/model-presets', data).then(r => r.data)
}

export function updateModelPreset(id, data) {
  return api.put(`/model-presets/${id}`, data).then(r => r.data)
}

export function deleteModelPreset(id) {
  return api.delete(`/model-presets/${id}`).then(r => r.data)
}

export function fetchModelIds(id, data) {
  return api.post(`/model-presets/${id}/fetch-models`, data).then(r => r.data)
}
