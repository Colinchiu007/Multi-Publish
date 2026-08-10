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

// ─── 公告 ─────────────────────────────
export function listAnnouncements() {
  return api.get('/announcements').then(r => r.data)
}
export function createAnnouncement(data) {
  return api.post('/announcements', data).then(r => r.data)
}
export function updateAnnouncement(id, data) {
  return api.put(`/announcements/${id}`, data).then(r => r.data)
}
export function deleteAnnouncement(id) {
  return api.delete(`/announcements/${id}`).then(r => r.data)
}

// ─── 版本发布策略 ─────────────────────
export function getUpdatePolicy() {
  return api.get('/update-policy').then(r => r.data)
}
export function putUpdatePolicy(data) {
  return api.put('/update-policy', data).then(r => r.data)
}

// ─── 内容安全策略 ─────────────────────
export function getContentPolicy() {
  return api.get('/content-policy').then(r => r.data)
}
export function putContentPolicy(data) {
  return api.put('/content-policy', data).then(r => r.data)
}
