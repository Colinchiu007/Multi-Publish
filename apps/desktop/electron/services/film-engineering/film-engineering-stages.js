// @ts-check
'use strict'
/**
 * film-engineering-stages - film-engineering（影视工程）流水线的自定义阶段执行器
 *
 * 阶段链（与 PIPELINES 注册的 film-engineering 流水线配套）：
 *   - film_load_template:   加载 film-kit 模板（fail-closed）
 *   - film_adapt_script:    剧本套用（分场 → Hell Grind 模板映射 → adaptedShots）
 *   - film_select_shots:    分镜选择过滤（kit shotId 或 adapt-*）
 *   - film_export_prompts:  导出选中分镜提示词（JSON/Markdown）
 *
 * 注册方式：container.setup.js 中调用 registerFilmEngineeringStages(pipelineEngine)
 */

const { loadFilmKit } = require('./kit-loader')
const { ShotLibrary } = require('./shot-library')
const { ScriptAdapter } = require('./script-adapt')

const FILM_STAGE_TYPES = {
  LOAD_TEMPLATE: 'film_load_template',
  ADAPT_SCRIPT: 'film_adapt_script',
  SELECT_SHOTS: 'film_select_shots',
  EXPORT_PROMPTS: 'film_export_prompts',
}

/**
 * 注册 film-engineering 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerFilmEngineeringStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []
  const log = pipelineEngine.log && typeof pipelineEngine.log.warn === 'function'
    ? pipelineEngine.log
    : { info () {}, warn () {}, error () {} }

  pipelineEngine.registerStageExecutor(
    FILM_STAGE_TYPES.LOAD_TEMPLATE,
    async ({ params, context }) => {
      const existing = context && context.template
      if (existing && existing.manifest && existing.shots) {
        return { success: true, output: { template: existing } }
      }
      const kitDir = params && params.kitDir
      if (typeof kitDir !== 'string' || !kitDir) {
        return { success: false, error: 'film_load_template 需要 params.kitDir' }
      }
      const loaded = loadFilmKit({ kitDir })
      if (!loaded.ok) {
        return { success: false, error: 'FILM_KIT_UNAVAILABLE: ' + loaded.error }
      }
      return {
        success: true,
        output: {
          template: {
            manifest: loaded.kit.manifest,
            shots: loaded.kit.shots,
            references: loaded.kit.references,
            doctrine: loaded.kit.doctrine,
          },
        },
      }
    },
  )
  registered.push(FILM_STAGE_TYPES.LOAD_TEMPLATE)

  pipelineEngine.registerStageExecutor(
    FILM_STAGE_TYPES.ADAPT_SCRIPT,
    async ({ params, context }) => {
      const template = context && context.template
      if (!template || !template.shots || template.shots.length === 0) {
        return { success: false, error: 'film_adapt_script 需要 context.template（先执行 film_load_template）' }
      }
      const script = params && params.script
      const characterMap = params && params.characterMap
      const llmEnabled = !!(params && params.llmEnabled)
      const adapter = new ScriptAdapter({
        kit: {
          manifest: template.manifest,
          shots: template.shots,
          references: template.references || {},
          doctrine: template.doctrine || { blocks: [], rules: [], glossary: [] },
        },
        llm: null,
        log,
      })
      const result = await adapter.adaptScript({
        script,
        characterMap,
        templateShots: template.shots,
        llmEnabled: false,
      })
      if (!result.ok) {
        return { success: false, error: 'film_adapt_script 失败: ' + result.error }
      }
      return {
        success: true,
        output: {
          adaptedShots: result.adaptedShots,
          llmEnhanced: llmEnabled ? result.llmEnhanced : false,
          warnings: result.warnings || [],
        },
      }
    },
  )
  registered.push(FILM_STAGE_TYPES.ADAPT_SCRIPT)

  pipelineEngine.registerStageExecutor(
    FILM_STAGE_TYPES.SELECT_SHOTS,
    async ({ params, context }) => {
      const template = context && context.template
      const adaptedShots = (context && Array.isArray(context.adaptedShots)) ? context.adaptedShots : []
      if (!template || !template.shots) {
        return { success: false, error: 'film_select_shots 需要 context.template' }
      }
      const ids = params && params.selectedShotIds
      if (!Array.isArray(ids) || ids.length === 0) {
        return { success: false, error: 'film_select_shots 需要非空 params.selectedShotIds' }
      }
      if (ids.length > 50) {
        return { success: false, error: 'film_select_shots 一次最多选择 50 个分镜' }
      }
      const byId = new Map()
      for (const s of template.shots) byId.set(s.shotId, s)
      for (const a of adaptedShots) byId.set(a.shotId, a)
      const selected = []
      for (const id of ids) {
        if (typeof id !== 'string' || !id.trim()) {
          return { success: false, error: 'film_select_shots 含非法分镜 id' }
        }
        const shot = byId.get(id)
        if (!shot) return { success: false, error: 'film_select_shots 分镜不存在: ' + id }
        selected.push(shot)
      }
      return { success: true, output: { selectedShots: selected } }
    },
  )
  registered.push(FILM_STAGE_TYPES.SELECT_SHOTS)

  pipelineEngine.registerStageExecutor(
    FILM_STAGE_TYPES.EXPORT_PROMPTS,
    async ({ params, context }) => {
      const selectedShots = context && Array.isArray(context.selectedShots) ? context.selectedShots : []
      if (selectedShots.length === 0) {
        return { success: false, error: 'film_export_prompts 需要 context.selectedShots（先执行 film_select_shots）' }
      }
      const format = (params && params.format) || 'json'
      const json = JSON.stringify(selectedShots.map((s) => ({
        shotId: s.shotId,
        sceneId: s.sceneId,
        prompt: s.prompt,
        model: s.model,
        refTokens: s.refTokens || [],
      })), null, 2)
      const markdown = selectedShots.map((s, i) => {
        const header = '## [' + (i + 1) + '] ' + s.sceneId + ' · ' + s.model
        return header + '\n\n' + s.prompt
      }).join('\n\n---\n\n')
      const out = { json, markdown }
      if (format !== 'json' && format !== 'markdown') {
        return { success: false, error: 'film_export_prompts 未知格式: ' + format }
      }
      return {
        success: true,
        output: {
          export: out,
          fileName: 'film-engineering-prompts-' + new Date().toISOString().slice(0, 10) + '.' + format,
        },
      }
    },
  )
  registered.push(FILM_STAGE_TYPES.EXPORT_PROMPTS)

  return { success: true, registered }
}

module.exports = {
  FILM_STAGE_TYPES,
  registerFilmEngineeringStages,
}
