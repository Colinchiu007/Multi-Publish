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

var _counter = 0
function _uid() {
  _counter++
  return "tpl_" + Date.now() + "_" + _counter
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
      var dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this._dataPath, JSON.stringify(this._templates, null, 2), "utf-8")
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
    for (var i = 0; i < this._templates.length; i++) {
      if (this._templates[i].id === id) return this._templates[i]
    }
    return null
  }

  add(tpl) {
    if (!this._loaded) this.load()
    var template = {}
    var keys = Object.keys(tpl)
    for (var i = 0; i < keys.length; i++) {
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
    for (var i = 0; i < this._templates.length; i++) {
      if (this._templates[i].id === id) {
        var keys = Object.keys(updates)
        for (var j = 0; j < keys.length; j++) {
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
    var newList = []
    var found = false
    for (var i = 0; i < this._templates.length; i++) {
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
    var result = []
    for (var i = 0; i < this._templates.length; i++) {
      if (this._templates[i].category === category) result.push(this._templates[i])
    }
    return result
  }

  seedDefaults() {
    if (!this._loaded) this.load()
    if (this._templates.length > 0) return
    var presets = TemplateManager.getPresets()
    for (var i = 0; i < presets.length; i++) {
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

module.exports = TemplateManager
