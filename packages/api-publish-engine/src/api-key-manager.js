/**
 * API Key Manager — 多 Key 管理 + 权限 + 用量追踪
 * 存储: JSON 文件 (config/api-keys.json)
 * 支持 create/revoke/list/validate
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class ApiKeyManager {
  /**
   * @param {string} [keysPath]  — JSON 文件路径，默认 config/api-keys.json
   */
  constructor(keysPath) {
    this._keysPath = keysPath || path.join(__dirname, "..", "config", "api-keys.json");
    this._keys = [];   // [{ key, name, scopes[], createdAt, revokedAt, lastUsed }]
    this._loaded = false;
  }

  get loaded() { return this._loaded; }

  /** 从文件加载 */
  load() {
    try {
      if (fs.existsSync(this._keysPath)) {
        const raw = fs.readFileSync(this._keysPath, "utf-8");
        this._keys = JSON.parse(raw);
        if (!Array.isArray(this._keys)) this._keys = [];
      } else {
        this._keys = [];
      }
    } catch (e) {
      this._keys = [];
    }
    this._loaded = true;
  }

  /** 持久化到文件（原子写：tmp + rename）— API Key 以 SHA-256 哈希存储 */
  _save() {
    const dir = path.dirname(this._keysPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // 安全修复：API Key 以 SHA-256 哈希存储，不明文保存
    const hashed = this._keys.map(k => {
      const h = { name: k.name, scopes: k.scopes, createdAt: k.createdAt, keyHash: k.keyHash || crypto.createHash('sha256').update(k.key).digest('hex') }
      if (k.revokedAt) h.revokedAt = k.revokedAt
      if (k.lastUsed) h.lastUsed = k.lastUsed
      return h
    })
    const tmpPath = this._keysPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(hashed, null, 2), "utf-8");
    fs.renameSync(tmpPath, this._keysPath);
  }

  /** 生成随机 API Key */
  _generateKey() {
    return "mp_" + crypto.randomBytes(24).toString("hex");
  }

  /**
   * 创建新 API Key
   * @param {string}  name       — 标识名称
   * @param {string[]} [scopes]  — 权限范围, 默认 ["*"]
   * @returns {{ key: string, name: string, scopes: string[], createdAt: string }}
   */
  createKey(name, scopes) {
    if (!this._loaded) this.load();
    if (!name || typeof name !== "string") throw new Error("name is required");
    const entry = {
      key: this._generateKey(),
      name,
      scopes: Array.isArray(scopes) && scopes.length > 0 ? scopes : ["*"],
      createdAt: new Date().toISOString(),
      revokedAt: null,
      lastUsed: null,
    };
    this._keys.push(entry);
    this._save();
    // 返回时不包含完整 key 列表
    return { key: entry.key, name: entry.name, scopes: entry.scopes, createdAt: entry.createdAt };
  }

  /**
   * 吊销 API Key
   * @param {string} key — 要吊销的 key
   * @returns {boolean} 是否找到并吊销
   */
  revokeKey(key) {
    if (!this._loaded) this.load();
    const entry = this._keys.find((k) => k.key === key && !k.revokedAt);
    if (!entry) return false;
    entry.revokedAt = new Date().toISOString();
    this._save();
    return true;
  }

  /**
   * 列出所有 Key（不含 key 值本身，除非 includeKeys=true）
   * @param {boolean} [includeRevoked=false]
   * @param {boolean} [includeKeys=false]
   */
  listKeys(includeRevoked, includeKeys) {
    if (!this._loaded) this.load();
    return this._keys
      .filter((k) => includeRevoked || !k.revokedAt)
      .map((k) => {
        const entry = { name: k.name, scopes: k.scopes, createdAt: k.createdAt };
        if (k.revokedAt) entry.revokedAt = k.revokedAt;
        if (k.lastUsed) entry.lastUsed = k.lastUsed;
        if (includeKeys) entry.key = k.key;
        return entry;
      });
  }

  /**
   * 验证 API Key 是否有效
   * @param {string} key
   * @param {string} [requiredScope] — 可选：检查特定 scope
   * @returns {{ valid: boolean, name?: string, scopes?: string[], error?: string }}
   */
  validateKey(key, requiredScope) {
    if (!this._loaded) this.load();
    if (!key) return { valid: false, error: "No API key provided" };
    // 安全修复：用 SHA-256 哈希比较，不明文匹配
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')
    const entry = this._keys.find(k => (k.keyHash || crypto.createHash('sha256').update(k.key).digest('hex')) === keyHash);
    if (!entry) return { valid: false, error: "API key not found" };
    if (entry.revokedAt) return { valid: false, error: "API key has been revoked" };
    // 更新 lastUsed（不阻塞）
    entry.lastUsed = new Date().toISOString();
    this._save();
    // 检查 scope
    if (requiredScope && !entry.scopes.includes("*") && !entry.scopes.includes(requiredScope)) {
      return { valid: false, error: `Scope '${requiredScope}' not allowed for this key` };
    }
    return { valid: true, name: entry.name, scopes: entry.scopes };
  }
}

module.exports = ApiKeyManager;
