// @ts-check
'use strict'
/**
 * film-engineering IPC handlers
 *
 * 通道（全部 withSenderCheck + 入参运行时校验）：
 *   film-engineering:status
 *   film-engineering:list-scenes
 *   film-engineering:list-shots          (sceneId)
 *   film-engineering:get-shot            (shotId)
 *   film-engineering:doctrine
 *   film-engineering:copy-text           (shotId, mode)
 *   film-engineering:copy-texts          (shotIds, mode)
 *   film-engineering:adapt-script        (script, characterMap, llmEnabled?)
 *   film-engineering:export              (selectedShots, format)
 *   film-engineering:generate-selected   (selectedShots, opts)
 */

const EC = require('../core/error-codes').ERROR
const { withSenderCheck } = require('./helpers')

const MAX_SCRIPT_LENGTH = 10000
const MAX_CHARACTER_MAP_KEYS = 10
const MAX_SHOTS_ARRAY = 50
const MAX_GENERATE_BATCH = 20

function registerHandlers (ipcMain, deps) {
  const log = deps.log || { info () {}, warn () {}, error () {} }
  const service = deps.filmEngineeringService

  function kitError (e) {
    const message = e instanceof Error ? e.message : String(e)
    return message.startsWith('FILM_KIT_UNAVAILABLE')
      ? { code: EC.REQUEST_ERROR, message }
      : null
  }

  function withKit (fn) {
    return (_event, ...args) => {
      try {
        return { code: 0, data: fn(...args) }
      } catch (e) {
        const kitErr = kitError(e)
        if (kitErr) return kitErr
        if (e && Number.isInteger(e.code)) {
          return { code: e.code, message: e instanceof Error ? e.message : String(e) }
        }
        log.warn('[film-engineering] error:', e instanceof Error ? e.message : String(e))
        return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  ipcMain.handle('film-engineering:status', withSenderCheck(withKit(() => service.getStatus())))

  ipcMain.handle('film-engineering:list-scenes', withSenderCheck(withKit(() => service.listScenes())))

  ipcMain.handle('film-engineering:list-shots', withSenderCheck(withKit((_e, sceneId) => {
    if (typeof sceneId !== 'string' || !sceneId.trim()) {
      throw Object.assign(new Error('sceneId 必须为非空字符串'), { code: EC.VALIDATION_ERROR })
    }
    return service.listShots(sceneId)
  })))

  ipcMain.handle('film-engineering:get-shot', withSenderCheck(withKit((_e, shotId) => {
    if (typeof shotId !== 'string' || !shotId.trim()) {
      throw Object.assign(new Error('shotId 必须为非空字符串'), { code: EC.VALIDATION_ERROR })
    }
    return service.getShot(shotId)
  })))

  ipcMain.handle('film-engineering:doctrine', withSenderCheck(withKit(() => service.getDoctrine())))

  ipcMain.handle('film-engineering:copy-text', withSenderCheck(withKit((_e, shotId, mode) => {
    if (typeof shotId !== 'string' || !shotId.trim()) {
      throw Object.assign(new Error('shotId 必须为非空字符串'), { code: EC.VALIDATION_ERROR })
    }
    const m = typeof mode === 'string' && mode.trim() ? mode.trim() : 'full'
    return { text: service.buildCopyText(shotId, m), mode: m }
  })))

  ipcMain.handle('film-engineering:copy-texts', withSenderCheck(withKit((_e, shotIds, mode) => {
    if (!Array.isArray(shotIds) || shotIds.length === 0 || shotIds.length > MAX_SHOTS_ARRAY) {
      throw Object.assign(new Error('shotIds 必须为 1-' + MAX_SHOTS_ARRAY + ' 项的数组'), { code: EC.VALIDATION_ERROR })
    }
    for (const id of shotIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw Object.assign(new Error('shotIds 含非法分镜 id'), { code: EC.VALIDATION_ERROR })
      }
    }
    const m = typeof mode === 'string' && mode.trim() ? mode.trim() : 'full'
    return { text: service.buildCopyTexts(shotIds, m), mode: m, count: shotIds.length }
  })))

  ipcMain.handle('film-engineering:adapt-script', withSenderCheck(async (_event, payload) => {
    const params = payload || {}
    const script = params.script
    const characterMap = params.characterMap
    if (typeof script !== 'string' || !script.trim()) {
      return { code: EC.VALIDATION_ERROR, message: '剧本不能为空' }
    }
    if (script.length > MAX_SCRIPT_LENGTH) {
      return { code: EC.VALIDATION_ERROR, message: '剧本不能超过 ' + MAX_SCRIPT_LENGTH + ' 字' }
    }
    if (!characterMap || typeof characterMap !== 'object' || Array.isArray(characterMap)) {
      return { code: EC.VALIDATION_ERROR, message: '角色映射必须为对象' }
    }
    const keys = Object.keys(characterMap)
    if (keys.length > MAX_CHARACTER_MAP_KEYS) {
      return { code: EC.VALIDATION_ERROR, message: '角色映射最多 ' + MAX_CHARACTER_MAP_KEYS + ' 个键' }
    }
    for (const k of keys) {
      if (typeof characterMap[k] !== 'string' || !characterMap[k].trim()) {
        return { code: EC.VALIDATION_ERROR, message: '角色映射[' + k + '] 必须为非空字符串' }
      }
    }
    try {
      const result = await service.adaptScript({
        script,
        characterMap,
        llmEnabled: params.llmEnabled === true,
      })
      if (!result.ok) {
        return { code: EC.REQUEST_ERROR, message: result.error }
      }
      return { code: 0, data: { adaptedShots: result.adaptedShots, llmEnhanced: result.llmEnhanced, warnings: result.warnings || [] } }
    } catch (e) {
      log.warn('[film-engineering] adapt-script error:', e instanceof Error ? e.message : String(e))
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('film-engineering:export', withSenderCheck(withKit((_e, selectedShots, format) => {
    if (!Array.isArray(selectedShots) || selectedShots.length === 0 || selectedShots.length > MAX_SHOTS_ARRAY) {
      throw Object.assign(new Error('selectedShots 必须为 1-' + MAX_SHOTS_ARRAY + ' 项的数组'), { code: EC.VALIDATION_ERROR })
    }
    for (const s of selectedShots) {
      if (!s || typeof s.prompt !== 'string' || !s.prompt.trim() || s.prompt.length > 50000) {
        throw Object.assign(new Error('selectedShots 每项必须含非空 prompt（<=50000 字符）'), { code: EC.VALIDATION_ERROR })
      }
    }
    const fmt = format === 'markdown' ? 'markdown' : 'json'
    return service.exportPrompts(selectedShots, fmt)
  })))

  ipcMain.handle('film-engineering:generate-selected', withSenderCheck(async (_event, selectedShots, opts) => {
    if (!Array.isArray(selectedShots) || selectedShots.length === 0 || selectedShots.length > MAX_GENERATE_BATCH) {
      return { code: EC.VALIDATION_ERROR, message: 'selectedShots 必须为 1-' + MAX_GENERATE_BATCH + ' 项的数组' }
    }
    for (const s of selectedShots) {
      if (!s || typeof s.prompt !== 'string' || !s.prompt.trim() || s.prompt.length > 50000) {
        return { code: EC.VALIDATION_ERROR, message: 'selectedShots 每项必须含非空 prompt（<=50000 字符）' }
      }
    }
    try {
      const result = await service.generateSelected(selectedShots, opts || {})
      if (!result.ok) {
        return { code: EC.REQUEST_ERROR, message: result.error, data: result.results ? { results: result.results } : undefined }
      }
      return { code: 0, data: { results: result.results, partialFailure: result.partialFailure } }
    } catch (e) {
      log.warn('[film-engineering] generate-selected error:', e instanceof Error ? e.message : String(e))
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))
}

module.exports = registerHandlers
