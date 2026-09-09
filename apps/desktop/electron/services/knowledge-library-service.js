// @ts-check
/**
 * KnowledgeLibraryService — 知识库业务服务
 *
 * 暴露给 IPC handler 的统一入口，封装参数校验与 store 调用。
 * 依赖：store（含 knowledge-library-store mixin 方法）
 */
const { ERROR } = require('../core/error-codes')

const PERSONAL_CATEGORIES = new Set([
  'personal_ip_persona', 'personal_background', 'personal_stories',
  'growth_experience', 'emotional_experience', 'work_experience',
  'project_experience', 'personal_opinions', 'family_stories',
])

class KnowledgeLibraryService {
  constructor (opts) {
    this._store = opts.store || null
  }

  _requireStore () {
    if (!this._store || typeof this._store.addViralItem !== 'function') {
      return { code: ERROR.REQUEST_ERROR, message: '知识库存储未就绪' }
    }
    return null
  }

  // ===================== 爆款库 =====================

  addToViral (item) {
    const err = this._requireStore()
    if (err) return err
    if (!item || typeof item !== 'object') return { code: ERROR.VALIDATION_ERROR, message: '参数无效' }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      return { code: ERROR.VALIDATION_ERROR, message: '正文内容不能为空' }
    }
    const id = String(item.id || '') || this._genId()
    const resultId = this._store.addViralItem({ ...item, id })
    if (!resultId) return { code: ERROR.REQUEST_ERROR, message: '保存失败' }
    return { code: ERROR.SUCCESS, data: { id: resultId } }
  }

  addViralBatch (items) {
    const err = this._requireStore()
    if (err) return err
    if (!Array.isArray(items) || items.length === 0) return { code: ERROR.VALIDATION_ERROR, message: '至少需要一条内容' }
    let count = 0
    for (const item of items) {
      const id = String(item.id || '') || this._genId()
      if (this._store.addViralItem({ ...item, id })) count++
    }
    return { code: ERROR.SUCCESS, data: { count } }
  }

  listViral (params = {}) {
    const err = this._requireStore()
    if (err) return err
    const result = this._store.listViralItems(params)
    return { code: ERROR.SUCCESS, data: result }
  }

  getViral (id) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    const item = this._store.getViralItem(id)
    if (!item) return { code: ERROR.NOT_FOUND, message: '条目不存在' }
    return { code: ERROR.SUCCESS, data: item }
  }

  updateViral (id, updates) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    if (!updates || typeof updates !== 'object') return { code: ERROR.VALIDATION_ERROR, message: '缺少更新数据' }
    const ok = this._store.updateViralItem(id, updates)
    if (!ok) return { code: ERROR.REQUEST_ERROR, message: '更新失败' }
    return { code: ERROR.SUCCESS, data: null }
  }

  deleteViral (id) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    const ok = this._store.deleteViralItem(id)
    if (!ok) return { code: ERROR.REQUEST_ERROR, message: '删除失败' }
    return { code: ERROR.SUCCESS, data: null }
  }

  searchViral (query, limit) {
    const err = this._requireStore()
    if (err) return err
    const items = this._store.searchViralItems(query, limit)
    return { code: ERROR.SUCCESS, data: items }
  }

  // ===================== 个人知识库 =====================

  addPersonal (item) {
    const err = this._requireStore()
    if (err) return err
    if (!item || typeof item !== 'object') return { code: ERROR.VALIDATION_ERROR, message: '参数无效' }
    if (typeof item.content !== 'string' || !item.content.trim()) {
      return { code: ERROR.VALIDATION_ERROR, message: '正文内容不能为空' }
    }
    if (!PERSONAL_CATEGORIES.has(String(item.category || ''))) {
      return { code: ERROR.VALIDATION_ERROR, message: '请选择有效的知识类别' }
    }
    const id = String(item.id || '') || this._genId()
    const resultId = this._store.addPersonalItem({ ...item, id })
    if (!resultId) return { code: ERROR.REQUEST_ERROR, message: '保存失败' }
    return { code: ERROR.SUCCESS, data: { id: resultId } }
  }

  addPersonalBatch (items) {
    const err = this._requireStore()
    if (err) return err
    if (!Array.isArray(items) || items.length === 0) return { code: ERROR.VALIDATION_ERROR, message: '至少需要一条内容' }
    let count = 0
    for (const item of items) {
      if (!item.content || !PERSONAL_CATEGORIES.has(String(item.category || ''))) continue
      const id = String(item.id || '') || this._genId()
      if (this._store.addPersonalItem({ ...item, id })) count++
    }
    return { code: ERROR.SUCCESS, data: { count } }
  }

  listPersonal (params = {}) {
    const err = this._requireStore()
    if (err) return err
    const result = this._store.listPersonalItems(params)
    return { code: ERROR.SUCCESS, data: result }
  }

  getPersonal (id) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    const item = this._store.getPersonalItem(id)
    if (!item) return { code: ERROR.NOT_FOUND, message: '条目不存在' }
    return { code: ERROR.SUCCESS, data: item }
  }

  updatePersonal (id, updates) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    if (!updates || typeof updates !== 'object') return { code: ERROR.VALIDATION_ERROR, message: '缺少更新数据' }
    const ok = this._store.updatePersonalItem(id, updates)
    if (!ok) return { code: ERROR.REQUEST_ERROR, message: '更新失败' }
    return { code: ERROR.SUCCESS, data: null }
  }

  deletePersonal (id) {
    const err = this._requireStore()
    if (err) return err
    if (!id) return { code: ERROR.VALIDATION_ERROR, message: '缺少 id' }
    const ok = this._store.deletePersonalItem(id)
    if (!ok) return { code: ERROR.REQUEST_ERROR, message: '删除失败' }
    return { code: ERROR.SUCCESS, data: null }
  }

  searchPersonal (query, limit) {
    const err = this._requireStore()
    if (err) return err
    const items = this._store.searchPersonalItems(query, limit)
    return { code: ERROR.SUCCESS, data: items }
  }

  _genId () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }
}

module.exports = KnowledgeLibraryService

