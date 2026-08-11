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

export function listKeywordWatchlist() {
  return api.get('/keyword-watchlist').then(r => r.data)
}

export function createKeywordWatchlistEntry(data) {
  return api.post('/keyword-watchlist', data).then(r => r.data)
}

export function updateKeywordWatchlistEntry(id, data) {
  return api.put(`/keyword-watchlist/${id}`, data).then(r => r.data)
}

export function deleteKeywordWatchlistEntry(id) {
  return api.delete(`/keyword-watchlist/${id}`).then(r => r.data)
}
