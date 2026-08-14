// @ts-check
'use strict'
/**
 * shot-library - 分镜库查询与一键复制文本组装
 *
 * 基于 film-kit（loadFilmKit 结果）提供：
 *   - listScenes(): 场景树（含素材计数与每场景分镜数）
 *   - listShots(sceneId): 分镜列表
 *   - getShot(shotId): 分镜详情 + ref 引用解析
 *   - buildCopyText(shotId, mode): 一键复制文本（full/blocks/characters/geo）
 *   - buildCopyTexts(shotIds, mode): 多分镜合并复制
 *
 * 复制文本由后端组装（跨平台一致），前端只负责写入剪贴板。
 */

const BLOCK_HEADINGS = [
  'GEO SPATIAL LAYOUT',
  'ACTION TIMING',
  'AUDIO',
  'CHARACTER ACTING',
  'POSITIVE CONSTRAINTS',
]

const COPY_MODES = new Set(['full', 'blocks', 'characters', 'geo'])

function extractBlocks (prompt) {
  /** @type {Array<{heading: string, content: string}>} */
  const blocks = []
  const lines = String(prompt || '').split(/\r?\n/)
  let current = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (BLOCK_HEADINGS.includes(line.toUpperCase())) {
      if (current) blocks.push(current)
      current = { heading: line.toUpperCase(), content: [] }
      continue
    }
    if (current) current.content.push(rawLine)
  }
  if (current) blocks.push(current)
  return blocks
}

function extractCharacterLines (prompt) {
  const lines = String(prompt || '').split(/\r?\n/)
  return lines.filter((l) => /\[CHARACTER:/.test(l)).map((l) => l.trim()).filter(Boolean)
}

function extractGeoBlock (prompt) {
  const blocks = extractBlocks(prompt)
  const geo = blocks.find((b) => b.heading === 'GEO SPATIAL LAYOUT')
  if (!geo) return ''
  return geo.content.join('\n').trim()
}

function buildBlocksText (prompt) {
  const blocks = extractBlocks(prompt)
  if (blocks.length === 0) {
    return prompt.trim() || ''
  }
  const parts = blocks.map((b) => {
    const content = b.content.join('\n').trim()
    return '[ ' + b.heading + ' ]\n' + (content || '（无）')
  })
  return parts.join('\n\n')
}

class ShotLibrary {
  /**
   * @param {object} opts
   * @param {object} opts.kit - loadFilmKit 返回的 kit
   * @param {object} [opts.log]
   */
  constructor (opts) {
    opts = opts || {}
    if (!opts.kit) throw new Error('ShotLibrary 需要 kit（loadFilmKit 结果）')
    this.kit = opts.kit
    this.log = opts.log || null
  }

  /** 场景树（含每场景分镜数） */
  listScenes () {
    return this.kit.manifest.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.count,
      parentId: s.parentId === undefined ? null : s.parentId,
      level: s.level,
      shotCount: (this.kit.shotSceneIndex.get(s.id) || []).length,
    }))
  }

  /** 分镜列表（按 sceneId） */
  listShots (sceneId) {
    if (typeof sceneId !== 'string' || !sceneId.trim()) {
      throw new Error('sceneId 必须为非空字符串')
    }
    if (!this.kit.sceneIndex.has(sceneId)) {
      throw new Error('场景不存在: ' + sceneId)
    }
    return (this.kit.shotSceneIndex.get(sceneId) || []).map((s) => this._toPublic(s))
  }

  /** 分镜详情 + ref 解析 */
  getShot (shotId) {
    const shot = this._findShot(shotId)
    return {
      ...this._toPublic(shot),
      resolvedRefs: (shot.refTokens || []).map((token) => ({
        token,
        entry: this.resolveRef(token),
      })),
    }
  }

  /** 引用解析（token → 注册表条目；未知返回 { kind: 'unknown' }） */
  resolveRef (token) {
    if (typeof token !== 'string') return { kind: 'unknown' }
    const entry = this.kit.references[token]
    return entry || { kind: 'unknown' }
  }

  /** 一键复制文本（mode: full/blocks/characters/geo） */
  buildCopyText (shotId, mode) {
    const shot = this._findShot(shotId)
    const m = String(mode || 'full')
    if (!COPY_MODES.has(m)) {
      throw new Error('未知复制模式: ' + m + '（支持 full/blocks/characters/geo）')
    }
    if (m === 'full') return shot.prompt
    if (m === 'blocks') return buildBlocksText(shot.prompt)
    if (m === 'characters') {
      const chars = extractCharacterLines(shot.prompt)
      return chars.length > 0 ? chars.join('\n') : '（无角色行）'
    }
    if (m === 'geo') {
      const geo = extractGeoBlock(shot.prompt)
      return geo || '（无 GEO SPATIAL LAYOUT 块）'
    }
    return shot.prompt
  }

  /** 多分镜合并复制文本 */
  buildCopyTexts (shotIds, mode) {
    if (!Array.isArray(shotIds) || shotIds.length === 0) {
      throw new Error('shotIds 必须为非空数组')
    }
    if (shotIds.length > 50) {
      throw new Error('一次最多复制 50 个分镜')
    }
    const m = String(mode || 'full')
    return shotIds.map((id, i) => {
      const shot = this._findShot(id)
      const text = this.buildCopyText(id, m)
      return '===== [' + (i + 1) + '/' + shotIds.length + '] ' + shot.sceneId + ' · ' + shot.model + ' =====\n' + text
    }).join('\n\n')
  }

  _findShot (shotId) {
    if (typeof shotId !== 'string' || !shotId.trim()) {
      throw new Error('shotId 必须为非空字符串')
    }
    const shot = this.kit.shotById.get(shotId)
    if (!shot) throw new Error('分镜不存在: ' + shotId)
    return shot
  }

  _toPublic (shot) {
    return {
      shotId: shot.shotId,
      sceneId: shot.sceneId,
      prompt: shot.prompt,
      model: shot.model,
      refTokens: shot.refTokens || [],
      resultUrl: shot.resultUrl || null,
      width: shot.width === undefined ? null : shot.width,
      height: shot.height === undefined ? null : shot.height,
    }
  }
}

module.exports = {
  BLOCK_HEADINGS,
  COPY_MODES,
  ShotLibrary,
  extractBlocks,
  buildBlocksText,
}
