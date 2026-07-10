// @ts-check
/**
 * LicenseManager — 许可证管理器
 *
 * 管理：免费/试用/Pro 许可证状态
 * 存储：userData/license.json（加密存储防篡改）
 * Pro 功能门控依赖此模块
 */

const fs = require("fs")
const path = require("path")
const { app } = require("electron")
const log = require("./logger")

let _instance = null

const FREE_FEATURES = [
  "single-publish",
  "platform-basic",
]

const PRO_FEATURES = [
  "single-publish",
  "batch-publish",
  "scheduled-publish",
  "platform-all",
  "templates",
  "analytics",
  "content-intelligence",
  "api-access",
]

const TRIAL_DAYS = 7

function getDataPath(dataPath) {
  return dataPath || path.join(app.getPath("userData"), "license.json")
}

function obfuscate(str) {
  if (!str) return ""
  const buf = Buffer.from(str, "utf-8")
  const xor = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) {
    xor[i] = buf[i] ^ 0x4d
  }
  return xor.toString("base64")
}

function deobfuscate(encoded) {
  if (!encoded) return null
  try {
    const xor = Buffer.from(encoded, "base64")
    const buf = Buffer.alloc(xor.length)
    for (let i = 0; i < xor.length; i++) {
      buf[i] = xor[i] ^ 0x4d
    }
    return buf.toString("utf-8")
  // eslint-disable-next-line no-unused-vars
  } catch (e) {
    return null
  }
}

class LicenseManager {
  constructor(dataPath) {
    this._dataPath = getDataPath(dataPath)
    this._data = this._defaultData()
  }

  _defaultData() {
    return { type: "free", licenseKey: "", activatedAt: null, expiresAt: null, features: [] }
  }

  load() {
    try {
      if (fs.existsSync(this._dataPath)) {
        const raw = fs.readFileSync(this._dataPath, "utf-8").trim()
        if (!raw) return
        const decoded = deobfuscate(raw)
        if (decoded) {
          const parsed = JSON.parse(decoded)
          if (parsed && parsed.type) {
            this._data = parsed
            log.info("LicenseManager", "License loaded: " + this._data.type)
            return
          }
        }
      }
    } catch (e) {
      log.warn("LicenseManager", "Failed to load primary: " + e.message)
      // 修复 P6：损坏时先尝试 .bak 备份，避免静默降级为 free 丢失 Pro 许可
      try {
        const bakPath = this._dataPath + ".bak"
        if (fs.existsSync(bakPath)) {
          const rawBak = fs.readFileSync(bakPath, "utf-8").trim()
          const decodedBak = deobfuscate(rawBak)
          if (decodedBak) {
            const parsedBak = JSON.parse(decodedBak)
            if (parsedBak && parsedBak.type) {
              this._data = parsedBak
              log.info("LicenseManager", "License restored from backup: " + this._data.type)
              return
            }
          }
        }
      } catch (e2) {
        log.warn("LicenseManager", "Backup also failed: " + e2.message)
      }
      this._data = this._defaultData()
      log.warn("LicenseManager", "License corrupted, fell back to free. Please re-activate if you had Pro.")
    }
  }

  save() {
    try {
      const dir = path.dirname(this._dataPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const encoded = obfuscate(JSON.stringify(this._data))
      // 修复 P6：原子写（tmp + rename）+ 备份双副本
      const tmpPath = this._dataPath + ".tmp"
      fs.writeFileSync(tmpPath, encoded, "utf-8")
      fs.renameSync(tmpPath, this._dataPath)
      // 同步备份
      try {
        const bakPath = this._dataPath + ".bak"
        fs.writeFileSync(bakPath, encoded, "utf-8")
      } catch (e2) { /* best-effort backup */ }
    } catch (e) {
      log.warn("LicenseManager", "Failed to save: " + e.message)
    }
  }

  activate(licenseKey) {
    if (!licenseKey) return false
    // Don't re-activate if already activated with same or different key
    if (this._data.type === "pro" || this._data.type === "lifetime") return false
    const key = licenseKey.trim()
    this._data.type = "pro"
    this._data.licenseKey = key
    this._data.activatedAt = new Date().toISOString()
    this._data.expiresAt = null
    this._data.features = PRO_FEATURES.slice()
    this.save()
    log.info("LicenseManager", "Activated with key: " + key.slice(0, 8) + "...")
    return true
  }

  activateTrial() {
    if (this._data.type !== "free") return false
    this._data.type = "trial"
    this._data.activatedAt = new Date().toISOString()
    const expires = new Date()
    expires.setDate(expires.getDate() + TRIAL_DAYS)
    this._data.expiresAt = expires.toISOString()
    this._data.features = PRO_FEATURES.slice()
    this.save()
    log.info("LicenseManager", "Trial activated, expires: " + this._data.expiresAt)
    return true
  }

  deactivate() {
    this._data = this._defaultData()
    this.save()
    log.info("LicenseManager", "Deactivated")
  }

  isPro() {
    if (this._data.type === "pro" || this._data.type === "lifetime") return true
    if (this._data.type === "trial") {
      if (!this._data.expiresAt) return false
      const now = new Date()
      const expires = new Date(this._data.expiresAt)
      return now < expires
    }
    return false
  }

  isTrial() {
    return this._data.type === "trial" && this.isPro()
  }

  isTrialExpired() {
    if (this._data.type !== "trial") return false
    if (!this._data.expiresAt) return false
    return new Date() > new Date(this._data.expiresAt)
  }

  getInfo() {
    return {
      type: this._data.type,
      licenseKey: this._data.licenseKey || "",
      activatedAt: this._data.activatedAt,
      expiresAt: this._data.expiresAt,
      features: this._data.features || [],
      isPro: this.isPro(),
      isTrial: this.isTrial(),
      isTrialExpired: this.isTrialExpired(),
      daysRemaining: this._daysRemaining(),
    }
  }

  getFeatures() {
    if (this.isPro()) return PRO_FEATURES.slice()
    return FREE_FEATURES.slice()
  }

  hasFeature(featureName) {
    return this.getFeatures().indexOf(featureName) >= 0
  }

  _daysRemaining() {
    if (this._data.type !== "trial" || !this._data.expiresAt) return 0
    const now = new Date()
    const expires = new Date(this._data.expiresAt)
    const diff = expires.getTime() - now.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  static getInstance(dataPath) {
    if (!_instance) {
      _instance = new LicenseManager(dataPath)
      _instance.load()
    }
    return _instance
  }

  static get FREE_FEATURES() { return FREE_FEATURES.slice() }
  static get PRO_FEATURES() { return PRO_FEATURES.slice() }
  static get TRIAL_DAYS() { return TRIAL_DAYS }
}

module.exports = LicenseManager
