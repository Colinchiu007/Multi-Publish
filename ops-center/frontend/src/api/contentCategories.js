import { createApiClient } from './http'

const api = createApiClient()

/** 统一内容类别：列出全部（含禁用）；返回 { items, count, max_items, preset_keys } */
export function listContentCategories() {
  return api.get('/content-categories').then(r => r.data)
}

export function createContentCategory(data) {
  return api.post('/content-categories', data).then(r => r.data)
}

export function updateContentCategory(key, data) {
  return api.put(`/content-categories/${encodeURIComponent(key)}`, data).then(r => r.data)
}

export function deleteContentCategory(key) {
  return api.delete(`/content-categories/${encodeURIComponent(key)}`).then(r => r.data)
}

/** 排序：action ∈ top/up/down/bottom；返回 { items, count, result } */
export function reorderContentCategory(key, action) {
  return api.post(`/content-categories/${encodeURIComponent(key)}/reorder`, { action }).then(r => r.data)
}

/** 恢复内置目录默认（自定义类别保留） */
export function resetContentCategories() {
  return api.post('/content-categories/reset').then(r => r.data)
}
