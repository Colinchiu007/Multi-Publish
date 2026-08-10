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

export function listPipelineDeps(params = {}) {
  return api.get('/pipeline-dependencies', { params }).then(r => r.data)
}

export function createPipelineDep(data) {
  return api.post('/pipeline-dependencies', data).then(r => r.data)
}

export function updatePipelineDep(id, data) {
  return api.put(`/pipeline-dependencies/${id}`, data).then(r => r.data)
}

export function deletePipelineDep(id) {
  return api.delete(`/pipeline-dependencies/${id}`).then(r => r.data)
}
