/**
 * Knowledge Evolution — 知识库自我进化纯函数
 *
 * 提供：decayCheck / consolidate / scoreQuality / batchScoreQuality / feedbackBoost
 * 参考：LLM Wiki v2 的 confidence.py + quality.py + consolidate_ops.py
 * 设计：days_since 在 JS 层计算（纯函数可测试，不依赖 SQL 的 julianday）
 */

const DAY_MS = 86400000

function daysSince(iso) {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, (Date.now() - t) / DAY_MS)
}

/**
 * 推进生命周期状态：active→stale(>90d)→deprecated(>180d)→archived(access<3)
 */
function decayCheck(store) {
  if (!store || !store.db) return []
  const now = new Date().toISOString()
  const changes = []

  for (const table of ['viral_library', 'personal_knowledge']) {
    const rows = store.db.prepare(
      'SELECT id, status, access_count, COALESCE(last_accessed, created_at) AS last_accessed FROM ' + table +
      " WHERE status IN ('active', 'stale')"
    ).all()

    for (const row of rows) {
      const days = daysSince(row.last_accessed)
      let newStatus = row.status
      if (row.status === 'active' && days > 90) {
        newStatus = 'stale'
      } else if (row.status === 'stale' && days > 180) {
        newStatus = row.access_count < 3 ? 'archived' : 'deprecated'
      }
      if (newStatus !== row.status) {
        store.db.prepare('UPDATE ' + table + ' SET status = ? WHERE id = ?').run(newStatus, row.id)
        store.db.prepare(
          'INSERT INTO knowledge_audit_log ' +
          '(target_table, target_id, event, old_status, new_status, actor, created_at) ' +
          "VALUES (?, ?, 'status_change', ?, ?, 'system', ?)"
        ).run(table, row.id, row.status, newStatus, now)
        changes.push({ table, id: row.id, oldStatus: row.status, newStatus, daysSince: Math.floor(days) })
      }
    }
  }
  return changes
}

/**
 * 每周知识巩固：强化高置信度 + 归档低频
 */
function consolidate(store) {
  if (!store || !store.db) return { reinforced: 0, archived: 0 }
  const now = new Date().toISOString()
  let reinforced = 0
  let archived = 0

  for (const table of ['viral_library', 'personal_knowledge']) {
    const highRows = store.db.prepare(
      'SELECT id FROM ' + table + " WHERE confidence >= 0.7 AND status = 'active'"
    ).all()
    for (const row of highRows) {
      store.db.prepare(
        'UPDATE ' + table + ' SET access_count = access_count + 1, last_accessed = ?, ' +
        'confidence = MIN(0.99, confidence + 0.05) WHERE id = ?'
      ).run(now, row.id)
      store.db.prepare(
        "INSERT INTO knowledge_audit_log (target_table, target_id, event, actor, created_at) " +
        "VALUES (?, ?, 'reinforce', 'system', ?)"
      ).run(table, row.id, now)
      reinforced++
    }

    const lowRows = store.db.prepare(
      'SELECT id FROM ' + table + " WHERE status = 'deprecated' AND access_count < 3"
    ).all()
    for (const row of lowRows) {
      store.db.prepare('UPDATE ' + table + " SET status = 'archived' WHERE id = ?").run(row.id)
      store.db.prepare(
        'INSERT INTO knowledge_audit_log ' +
        '(target_table, target_id, event, old_status, new_status, actor, created_at) ' +
        "VALUES (?, ?, 'archive', 'deprecated', 'archived', 'system', ?)"
      ).run(table, row.id, now)
      archived++
    }
  }
  return { reinforced, archived }
}

/**
 * 单条内容质量评分（结构 0.3 / 引用 0.4 / 可读性 0.3）
 */
function scoreQuality(content, sourceFile) {
  let structure = 0
  if (/^#\s/m.test(content)) structure += 0.3
  const paragraphs = content.split(/\n\s*\n/).filter(function (p) { return p.trim() })
  if (paragraphs.length >= 2) structure += 0.3
  else if (paragraphs.length >= 1) structure += 0.15
  if (/^[-*]\s/m.test(content)) structure += 0.2
  if (/^>\s/m.test(content) || /```/.test(content)) structure += 0.2
  structure = Math.min(structure, 1.0)

  let citation = 0.1
  if (sourceFile) citation = 0.4
  const wikilinks = (content.match(/\[\[[^\]]+\]\]/g) || []).length
  if (wikilinks >= 3) citation = Math.max(citation, 0.5)
  else if (wikilinks >= 1) citation = Math.max(citation, 0.3)

  let readability = 0.3
  if (paragraphs.length > 0) {
    const avgLen = content.length / paragraphs.length
    if (avgLen >= 100 && avgLen <= 300) readability = 0.9
    else if (avgLen >= 50 && avgLen <= 500) readability = 0.6
  }

  return {
    structure: Math.round(structure * 100) / 100,
    citation: Math.round(citation * 100) / 100,
    readability: Math.round(readability * 100) / 100,
    quality: Math.round((structure * 0.3 + citation * 0.4 + readability * 0.3) * 100) / 100,
  }
}

/**
 * 批量重算个人知识库质量分
 */
function batchScoreQuality(store) {
  if (!store || !store.db) return []
  const rows = store.db.prepare('SELECT id, content, source_file FROM personal_knowledge').all()
  const lowQuality = []
  for (const row of rows) {
    const s = scoreQuality(row.content, row.source_file)
    store.db.prepare('UPDATE personal_knowledge SET quality = ? WHERE id = ?').run(s.quality, row.id)
    if (s.quality < 0.4) lowQuality.push({ id: row.id, structure: s.structure, citation: s.citation, readability: s.readability, quality: s.quality })
  }
  return lowQuality
}

/**
 * 用户反馈驱动的置信度更新
 */
function feedbackBoost(store, adoptedRefs, rejectedRefs) {
  if (!store || !store.db) return
  const now = new Date().toISOString()
  if (Array.isArray(adoptedRefs)) {
    for (const ref of adoptedRefs) {
      if (!ref || !ref.table || !ref.id) continue
      store.db.prepare(
        'UPDATE ' + ref.table + ' SET confidence = MIN(0.99, confidence + 0.1), last_accessed = ? WHERE id = ?'
      ).run(now, ref.id)
    }
  }
  if (Array.isArray(rejectedRefs)) {
    for (const ref of rejectedRefs) {
      if (!ref || !ref.table || !ref.id) continue
      store.db.prepare(
        'UPDATE ' + ref.table + ' SET confidence = MAX(0.01, confidence - 0.05), last_accessed = ? WHERE id = ?'
      ).run(now, ref.id)
    }
  }
}

module.exports = { decayCheck, consolidate, scoreQuality, batchScoreQuality, feedbackBoost, daysSince }
