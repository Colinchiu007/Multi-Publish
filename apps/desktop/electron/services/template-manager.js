// @ts-check
/**
 * TemplateManager - Content Template Manager
 *
 * Manages preset templates and user-defined templates
 * Storage: JSON file (userData/templates.json)
 */

const fs = require("fs")
const path = require("path")
const { app } = require("electron")
const log = require("./logger")

let _counter = 0
function _uid() {
  _counter++
  return "tpl_" + Date.now() + "_" + _counter
}

const MAX_REMOTE_TEMPLATES = 200

/** 远程官方模板类型自防御：类型不符/超限条目返回 null（跳过），否则返回安全字段子集 */
function sanitizeRemoteTemplate (t) {
  const out = {}
  const strField = (k, maxLen, required) => {
    const v = t[k]
    if (v === undefined || v === null) return required ? null : undefined
    if (typeof v !== 'string') return null
    const s = v.trim()
    if (s.length > maxLen) return null
    return s
  }
  const name = strField('name', 100, true)
  if (name === null) return null
  out.name = name
  const category = strField('category', 40, false)
  if (category === null) return null
  if (category !== undefined) out.category = category
  const title = strField('title', 200, false)
  if (title === null) return null
  if (title !== undefined) out.title = title
  const content = strField('content', 20000, false)
  if (content === null) return null
  if (content !== undefined) out.content = content
  const strArray = (k, maxLen) => {
    const v = t[k]
    if (v === undefined || v === null) return undefined
    if (!Array.isArray(v) || v.length > 50) return null
    const arr = []
    for (const item of v) {
      if (typeof item !== 'string' || !item.trim()) return null
      const s = item.trim()
      if (s.length > maxLen) return null
      arr.push(s)
    }
    return arr
  }
  const platforms = strArray('platforms', 200)
  const tags = strArray('tags', 200)
  if (platforms === null || tags === null) return null
  if (platforms !== undefined) out.platforms = platforms
  if (tags !== undefined) out.tags = tags
  if (t.sort_order !== undefined && t.sort_order !== null) {
    if (!Number.isInteger(t.sort_order) || t.sort_order < 0) return null
    out.sort_order = t.sort_order
  }
  if (t.enabled === true || t.enabled === false) out.enabled = t.enabled
  return out
}

class TemplateManager {
  constructor(dataPath) {
    this._dataPath = dataPath || path.join(app.getPath("userData"), "templates.json")
    this._templates = []
    this._loaded = false
  }

  load() {
    try {
      if (fs.existsSync(this._dataPath)) {
        this._templates = JSON.parse(fs.readFileSync(this._dataPath, "utf-8"))
      }
    } catch (e) {
      log.warn("TemplateManager", "Failed to load: " + e.message)
    }
    this._loaded = true
  }

  save() {
    try {
      const dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmpPath = this._dataPath + ".tmp"
      fs.writeFileSync(tmpPath, JSON.stringify(this._templates, null, 2), "utf-8")
      fs.renameSync(tmpPath, this._dataPath)
    } catch (e) {
      log.warn("TemplateManager", "Failed to save: " + e.message)
    }
  }

  list() {
    if (!this._loaded) this.load()
    return this._templates
  }

  get(id) {
    if (!this._loaded) this.load()
    for (let i = 0; i < this._templates.length; i++) {
      if (this._templates[i].id === id) return this._templates[i]
    }
    return null
  }

  add(tpl) {
    if (!this._loaded) this.load()
    const template = {}
    const keys = Object.keys(tpl)
    for (let i = 0; i < keys.length; i++) {
      template[keys[i]] = tpl[keys[i]]
    }
    if (!template.id) template.id = _uid()
    if (!template.createdAt) template.createdAt = new Date().toISOString()
    template.updatedAt = new Date().toISOString()
    this._templates.push(template)
    this.save()
    return template
  }

  update(id, updates) {
    if (!this._loaded) this.load()
    for (let i = 0; i < this._templates.length; i++) {
      if (this._templates[i].id === id) {
        const keys = Object.keys(updates)
        for (let j = 0; j < keys.length; j++) {
          this._templates[i][keys[j]] = updates[keys[j]]
        }
        this._templates[i].updatedAt = new Date().toISOString()
        this.save()
        return this._templates[i]
      }
    }
    return null
  }

  remove(id) {
    if (!this._loaded) this.load()
    const newList = []
    let found = false
    for (let i = 0; i < this._templates.length; i++) {
      if (this._templates[i].id === id) {
        found = true
      } else {
        newList.push(this._templates[i])
      }
    }
    if (found) {
      this._templates = newList
      this.save()
    }
    return found
  }

  delete(id) {
    return this.remove(id)
  }

  listByCategory(category) {
    if (!this._loaded) this.load()
    const result = []
    for (let i = 0; i < this._templates.length; i++) {
      if (this._templates[i].category === category) result.push(this._templates[i])
    }
    return result
  }

  /**
   * 应用运营后台下发的官方内容模板（运行时下发，合并进本地 templates.json）
   * 契约（ops-center content-templates）：按 id upsert；官方模板标记 builtin=true；
   * 用户自建模板（不同 id）保留；缺席即移除——本次下发未包含的内置模板视为已停用/删除；
   * 数组超上限 fail-closed 整批拒绝；远程值做类型自防御（非法条目跳过）。
   * @param {Array<object>|null|undefined} templates - 远程官方模板列表
   * @returns {number} 实际更新/新增/移除数
   */
  applyRemote (templates) {
    if (!Array.isArray(templates)) return 0
    if (templates.length > TemplateManager.MAX_REMOTE_TEMPLATES) return 0
    if (!this._loaded) this.load()
    const remoteKeys = ['name', 'category', 'title', 'content', 'platforms', 'tags', 'sort_order', 'enabled']
    const remoteIds = new Set()
    const seen = new Set()
    let updated = 0
    for (const t of templates) {
      if (!t || typeof t !== 'object') continue
      const id = String(t.id || '').trim()
      if (!id || seen.has(id)) continue // 批内同 id 去重（后者保留已由首个生效）
      seen.add(id)
      const safe = sanitizeRemoteTemplate(t)
      if (!safe) continue
      remoteIds.add(id)
      const existing = this._templates.find((x) => x.id === id)
      if (existing) {
        let changed = false
        for (const k of remoteKeys) {
          const v = safe[k]
          if (v === undefined) continue
          const same = Array.isArray(existing[k]) && Array.isArray(v)
            ? JSON.stringify(existing[k]) === JSON.stringify(v)
            : existing[k] === v
          if (!same) {
            existing[k] = v
            changed = true
          }
        }
        if (changed) {
          existing.updatedAt = new Date().toISOString()
          updated++
        }
      } else {
        const copy = {}
        for (const k of remoteKeys) {
          if (safe[k] !== undefined) copy[k] = safe[k]
        }
        copy.id = id
        copy.builtin = true
        copy.createdAt = new Date().toISOString()
        copy.updatedAt = new Date().toISOString()
        this._templates.push(copy)
        updated++
      }
    }
    // 缺席即移除：下发成功且非空时，本地内置模板不在下发集合内视为已停用/删除
    if (templates.length > 0 && remoteIds.size > 0) {
      const before = this._templates.length
      this._templates = this._templates.filter((x) => !(x.builtin && !remoteIds.has(x.id)))
      if (this._templates.length !== before) updated++
    }
    if (updated > 0) this.save()
    return updated
  }

  seedDefaults() {
    if (!this._loaded) this.load()
    if (this._templates.length > 0) return
    const presets = TemplateManager.getPresets()
    for (let i = 0; i < presets.length; i++) {
      this.add(presets[i])
    }
    this.save()
  }

  static getPresets() {
    return [
  {
    "id": "preset-weekly",
    "name": "Weekly Report",
    "category": "report",
    "builtin": true,
    "title": "Weekly Work Report",
    "content": "# Weekly Report\n\n## Tasks Completed\n- \n- \n\n## Next Week Plan\n- \n- \n\n## Issues\n- ",
    "platforms": [
      "wechat_mp",
      "zhihu"
    ],
    "tags": [
      "report"
    ]
  },
  {
    "id": "preset-product",
    "name": "Product Launch",
    "category": "marketing",
    "builtin": true,
    "title": "New Product Launch",
    "content": "# New Product Launch\n\nDear users,\n\nWe are excited to announce the launch of [Product Name]!\n\n## Highlights\n- \n- \n\n## How to Get\n- \n",
    "platforms": [
      "wechat_mp",
      "weibo",
      "xiaohongshu"
    ],
    "tags": [
      "product",
      "announcement"
    ]
  },
  {
    "id": "preset-tutorial",
    "name": "Tutorial",
    "category": "education",
    "builtin": true,
    "title": "Tutorial: ",
    "content": "# Tutorial\n\n## Introduction\n\n## Steps\n1. \n2. \n3. \n\n## Summary\n",
    "platforms": [
      "zhihu",
      "wechat_mp",
      "toutiao"
    ],
    "tags": [
      "tutorial"
    ]
  },
  {
    "id": "preset-event",
    "name": "Event Notice",
    "category": "marketing",
    "builtin": true,
    "title": "Event: ",
    "content": "# Event Notice\n\nDate: \nLocation: \n\n## Content\n\n## How to Join\n",
    "platforms": [
      "wechat_mp",
      "weibo"
    ],
    "tags": [
      "event"
    ]
  },
  {
    "id": "preset-daily",
    "name": "Daily Share",
    "category": "social",
    "builtin": true,
    "title": "",
    "content": "Today I want to share...\n\n#multipublish #daily",
    "platforms": [
      "weibo",
      "xiaohongshu",
      "douyin"
    ],
    "tags": [
      "daily"
    ]
  }
]
  }
}

TemplateManager.MAX_REMOTE_TEMPLATES = MAX_REMOTE_TEMPLATES

module.exports = TemplateManager
