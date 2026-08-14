import { createApiClient } from './http'

const api = createApiClient()

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
