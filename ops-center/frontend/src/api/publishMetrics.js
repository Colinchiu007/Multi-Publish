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

export function getPublishSummary(days = 30) {
  return api.get('/publish/summary', { params: { days } }).then(r => r.data)
}
