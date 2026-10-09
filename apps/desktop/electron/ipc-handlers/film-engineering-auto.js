// @ts-check
'use strict'
/**
 * film-engineering 自动模式 IPC handlers（openspec change: film-auto-mode）
 *
 * 通道（全部 withSenderCheck + 入参校验）：
 *   film-engineering:auto-plan           → 规划并落盘计划（零 provider 调用）
 *   film-engineering:auto-start          → 确认/续跑并执行（服务端重建 shots，客户端不得传 plan）
 *   film-engineering:auto-status         → 只读：项目 + 台账 + 磁盘 + 收口清单 + 计数对账
 *   film-engineering:auto-update-shot    → 片段编辑（唯一内容真源写入入口）
 *   film-engineering:auto-regenerate-shot→ 单镜重生成（原子覆盖；需最新确认）
 *   film-engineering:auto-compose        → 收口清单校验（合成 run 由渲染端经既有 pipeline 通道发起）
 *   事件 film-engineering:auto-update    → 批次/逐镜进度（driver 已节流，负载只带计数）
 *
 * 关键合同（design D3/D4/D5/D17/D25/D28/D31）：
 *   - 客户端**不得**回传分镜或参考图路径：auto-start 只收 {planId, taskId, confirmed, overwrite?}，
 *     分镜一律由服务端读自己落盘的计划重建，并对 refPaths 逐项重校验受控媒体根；
 *   - 确认门槛绑定**所有产生 provider 调用的通道**（auto-start 与 auto-regenerate-shot）；
 *   - 单飞：同一时刻只允许一个自动任务在跑（AUTO_TASK_BUSY）；
 *   - 执行不经 pipeline 引擎（直连 production-driver + auto-runner）；合成仍走既有 manifest 直通 run。
 */

const EC = require('../core/error-codes').ERROR
const { withSenderCheck } = require('./helpers')
const path = require('path')

const {
  validateAutoInputs, planAutoShots, buildPlanId, buildPayloadHash, buildShotFingerprint,
  MAX_AUTO_SHOTS, PRODUCTION_BATCH_SIZE,
} = require('../services/film-engineering/auto-plan')
const {
  writePlan, readPlan, markPlanConsumed, createProject, writeProject, readProject,
  readProjectFile, updateShot, appendConfirmation, latestConfirmation, needsReconfirm,
  incrementProviderCalls, reconcileCounters, projectDir, projectFilePath, ledgerFilePath,
  resolveTaskId, mediaRootOf, isWithinRoot,
} = require('../services/film-engineering/auto-project')
const {
  runAutoBatch, regenerateOneShot, collectMissingShots, autoRunIdFor, shotFileName,
} = require('../services/film-engineering/auto-runner')
const {
  runProduction, loadLedger, resolveResumePlan, buildRenderManifest, PRODUCTION_BATCH_SIZE: DRIVER_BATCH_SIZE,
} = require('../services/film-engineering/production-driver')
const { getFilmMediaRoot } = require('../services/film-engineering/film-render')
const { resolveFilmVideoProvider, FILM_ASPECTS, FILM_DURATIONS } = require('../services/film-engineering/video-gen')

/** 单飞注册表（D28）：同一时刻只允许一个自动模式任务在跑 */
const runningAutoTasks = new Set()

const PROMPT_PREVIEW_LENGTH = 200

function nowStamp () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return 'auto-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
}

function defaultProbe (runId, count) {
  const fs = require('fs')
  const { getFilmRunDir } = require('../services/film-engineering/video-gen')
  const dir = getFilmRunDir(runId)
  const missing = []
  for (let i = 0; i < count; i++) {
    if (!fs.existsSync(path.join(dir, shotFileName(i)))) missing.push(i)
  }
  return { missing }
}

function shotPreview (shot) {
  const prompt = typeof shot.prompt === 'string' ? shot.prompt : ''
  return {
    index: shot.index,
    shotId: shot.shotId,
    title: shot.title || '',
    seconds: shot.seconds,
    characterNames: Array.isArray(shot.characterNames) ? shot.characterNames : [],
    refPaths: Array.isArray(shot.refPaths) ? shot.refPaths : [],
    promptLength: prompt.length,
    promptPreview: prompt.length > PROMPT_PREVIEW_LENGTH ? prompt.slice(0, PROMPT_PREVIEW_LENGTH) + ' …' : prompt,
  }
}

function registerAutoHandlers (ipcMain, deps) {
  const o = deps || {}
  const log = o.log || { info () {}, warn () {}, error () {} }
  const service = o.filmEngineeringService
  const aiGenerator = o.aiGenerator
  const home = o.home
  const mediaRoot = mediaRootOf(home)
  const probe = o._testProbe || defaultProbe
  const driver = o._testRunProduction || runProduction
  const runBatchFn = o._testRunAutoBatch || runAutoBatch
  const regenerateFn = o._testRegenerateOneShot || regenerateOneShot

  /** 失败信封（带 errorCode，供渲染端做本地化映射） */
  function fail (code, errorCode, message) {
    return { code, errorCode, message }
  }

  function validationFail (errorCode, message) {
    return fail(EC.VALIDATION_ERROR, errorCode, message)
  }

  function providerOrError () {
    const provider = resolveFilmVideoProvider(aiGenerator)
    if (!provider) {
      return {
        error: fail(EC.REQUEST_ERROR, 'VIDEO_MODEL_NOT_CONFIGURED',
          '自动模式需要视频模型（如 Seedance / Kling / Veo 等），请在模型设置中配置并设为默认视频 Provider 后重试'),
      }
    }
    return { provider }
  }

  /** 项目文件 → 渲染端投影（含可编辑字段；供片段编辑使用） */
  function projectView (project, ledger, extra) {
    const shots = Array.isArray(project.shots) ? project.shots : []
    const done = shots.filter((s) => s.status === 'done').length
    const rec = reconcileCounters(project, { doneCount: done, totalCount: shots.length })
    return {
      taskId: project.taskId,
      runSeq: project.runSeq || 1,
      planId: project.planId,
      aspect: project.aspect,
      seconds: project.seconds,
      targetDurationSec: project.targetDurationSec,
      plannedDurationSec: project.plannedDurationSec,
      providerId: project.providerId,
      createdAt: project.createdAt,
      editedAt: project.editedAt,
      lastConfirmedAt: (latestConfirmation(project) || {}).at || null,
      shots,
      warnings: Array.isArray(project.warnings) ? project.warnings : [],
      counters: rec,
      doneCount: done,
      totalCount: shots.length,
      ledgerPresent: Boolean(ledger),
      ...(extra || {}),
    }
  }

  // ── 规划（零 provider 调用）────────────────────────────────────────────
  ipcMain.handle('film-engineering:auto-plan', withSenderCheck(async (_e, payload) => {
    const params = payload || {}
    const pre = providerOrError()
    if (pre.error) return pre.error
    const valid = validateAutoInputs(params)
    if (!valid.ok) return validationFail(valid.errorCode, valid.message)
    const taskIdRes = resolveTaskId(params.taskId === undefined || params.taskId === null || params.taskId === '' ? nowStamp() : params.taskId)
    if (!taskIdRes.ok) return validationFail(taskIdRes.errorCode, taskIdRes.message)
    const taskId = taskIdRes.taskId

    let templates
    try {
      templates = service.listTemplateShots()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return message.startsWith('FILM_KIT_UNAVAILABLE')
        ? fail(EC.REQUEST_ERROR, 'FILM_KIT_UNAVAILABLE', message)
        : fail(EC.REQUEST_ERROR, 'AUTO_TEMPLATE_UNAVAILABLE', message)
    }

    const planned = planAutoShots({
      script: params.script,
      characterRefs: params.characterRefs || [],
      sceneRefs: params.sceneRefs || [],
      aspect: params.aspect,
      seconds: Number(params.seconds),
      targetDurationSec: Number(params.targetDurationSec),
      templateShots: templates,
      providerId: pre.provider.providerId,
      mediaRoot,
    })
    if (!planned.ok) return validationFail(planned.errorCode, planned.message)

    const scriptHash = planned.scriptHash
    const planId = buildPlanId({
      taskId,
      scriptHash,
      refsFingerprint: planned.refsFingerprint,
      aspect: params.aspect,
      seconds: Number(params.seconds),
      targetDurationSec: Number(params.targetDurationSec),
      providerId: pre.provider.providerId,
    })
    const plan = {
      planId,
      taskId,
      scriptHash,
      refsFingerprint: planned.refsFingerprint,
      aspect: params.aspect,
      seconds: Number(params.seconds),
      targetDurationSec: Number(params.targetDurationSec),
      plannedDurationSec: planned.plannedDurationSec,
      providerId: pre.provider.providerId,
      providerModel: pre.provider.model || '',
      characterMap: planned.characterMap,
      characterRefs: (params.characterRefs || []).map((r) => ({ name: r.name, path: r.path })),
      sceneRefs: (params.sceneRefs || []).slice(),
      shots: planned.shots,
      warnings: planned.warnings,
    }
    const written = writePlan({ home, plan, taskId })
    if (!written.ok) return fail(EC.REQUEST_ERROR, written.errorCode, written.message)
    const payloadHash = buildPayloadHash({
      shots: plan.shots, aspect: plan.aspect, seconds: plan.seconds, providerId: plan.providerId,
    })
    return {
      code: 0,
      data: {
        planId,
        taskId,
        planExpiresAt: written.expiresAt,
        payloadHash,
        aspect: plan.aspect,
        seconds: plan.seconds,
        targetDurationSec: plan.targetDurationSec,
        plannedDurationSec: plan.plannedDurationSec,
        shotCount: plan.shots.length,
        batchCount: planned.estimates.batchCount,
        shotsWithReferences: planned.shotsWithReferences,
        characterMap: plan.characterMap,
        warnings: plan.warnings,
        estimates: planned.estimates,
        provider: { id: plan.providerId, model: plan.providerModel },
        shots: plan.shots.map(shotPreview),
      },
    }
  }))

  // ── 启动 / 续跑 ────────────────────────────────────────────────────────
  ipcMain.handle('film-engineering:auto-start', withSenderCheck(async (event, payload) => {
    const params = payload || {}
    const pre = providerOrError()
    if (pre.error) return pre.error
    const planRes = readPlan({ home, planId: params.planId, taskId: params.taskId })
    if (!planRes.ok) return validationFail(planRes.errorCode, planRes.message)
    const plan = planRes.plan
    const taskId = plan.taskId
    // 纵深防御（评审 i6）：计划虽由服务端生成且不可变，但它是磁盘文件——
    // 启动前对每一条 refPaths 重校验受控媒体根，越界即 fail-closed（不静默丢弃后继续跑）。
    const badRefs = (Array.isArray(plan.shots) ? plan.shots : [])
      .flatMap((s) => (Array.isArray(s && s.refPaths) ? s.refPaths : []))
      .filter((p) => typeof p !== 'string' || !isWithinRoot(mediaRoot, p))
    if (badRefs.length > 0) {
      return validationFail('AUTO_BAD_PARAM',
        '计划内含越出受控媒体根的参考图路径（' + badRefs.length + ' 条），已拒绝启动；请重新生成预览')
    }
    const payloadHash = buildPayloadHash({
      shots: plan.shots, aspect: plan.aspect, seconds: plan.seconds, providerId: plan.providerId,
    })

    // 续跑判定（D5）：同 taskId + 同 planId 视为续跑；否则需显式 overwrite（D4）
    const existing = readProject({ home, taskId })
    let project = null
    let resumed = false
    if (existing.ok) {
      const samePlanPlan = existing.project.planId === plan.planId
      if (!samePlanPlan && params.overwrite !== true) {
        return validationFail('AUTO_TASK_EXISTS', '同名任务已存在且不是同一份计划；如需覆盖请显式确认（旧一轮将归档保留）')
      }
      if (samePlanPlan && params.overwrite !== true) {
        project = existing.project
        resumed = true
      } else {
        project = createProject({ plan, taskId, home, overwrite: true })
      }
    } else {
      project = createProject({ plan, taskId, home })
    }
    if (!project || project.errorCode) {
      return validationFail((project && project.errorCode) || 'AUTO_START_FAILED', (project && project.message) || '无法创建任务')
    }

    // 确认门槛（D25）：无确认 / 载荷哈希变化 / 编辑晚于确认 → 必须重新确认
    const needs = needsReconfirm(project, { payloadHash })
    if (needs && params.confirmed !== true) {
      return {
        code: 0,
        data: { started: false, needsReconfirm: true, taskId, planId: plan.planId, payloadHash, resumed },
      }
    }
    if (needs) {
      appendConfirmation(project, {
        payloadHash,
        shotsFingerprint: buildShotFingerprint(project.shots),
        planVersion: project.runSeq || 1,
      })
    }

    // 单飞（D28）
    if (runningAutoTasks.size > 0) {
      return fail(EC.REQUEST_ERROR, 'AUTO_TASK_BUSY', '已有自动模式任务在运行，请等待其完成或停止后重试')
    }

    const writeNow = () => { try { writeProject({ home, project }) } catch { /* 持久化失败不改变执行结果 */ } }
    writeNow()
    markPlanConsumed({ home, planId: plan.planId })
    runningAutoTasks.add(taskId)
    try {
      const shotIds = project.shots.map((s) => s.shotId)
      const r = await driver({
        taskId,
        shotIds,
        ledgerDir: projectDir(home, taskId),
        mediaRoot,
        runIdFor: (t, batchIndex) => autoRunIdFor(t, batchIndex),
        probe,
        runOnlyBatch: null,
        emit: (evt) => {
          try {
            if (event && event.sender && typeof event.sender.send === 'function') {
              event.sender.send('film-engineering:auto-update', evt)
            }
          } catch { /* 窗口已销毁：事件推送失败不影响执行 */ }
        },
        runBatch: (batch, ctx) => runBatchFn({
          batch,
          project,
          aiGenerator,
          log,
          deps: o,
          onShotProgress: ctx.onShotProgress,
          onDispatched: () => incrementProviderCalls(project),
          persist: writeNow,
        }),
      })
      writeNow()
      return {
        code: 0,
        data: {
          started: true,
          resumed,
          taskId,
          planId: plan.planId,
          ok: Boolean(r && r.ok),
          doneCount: (r && r.ledger ? countDone(r.ledger) : 0),
          totalCount: shotIds.length,
          failedBatches: (r && r.failedBatches) || [],
          renderManifest: r && r.renderManifest ? r.renderManifest.entries : null,
          manifestError: (r && r.manifestError) || null,
          counters: reconcileCounters(project, { doneCount: countDone(r && r.ledger), totalCount: shotIds.length }),
        },
      }
    } catch (e) {
      writeNow()
      const message = e instanceof Error ? e.message : String(e)
      log.warn('[film-engineering] auto-start error:', message)
      return message.startsWith('VIDEO_MODEL_NOT_CONFIGURED')
        ? fail(EC.REQUEST_ERROR, 'VIDEO_MODEL_NOT_CONFIGURED', message)
        : fail(EC.REQUEST_ERROR, 'AUTO_START_FAILED', message)
    } finally {
      runningAutoTasks.delete(taskId)
    }
  }))

  // ── 只读状态 ───────────────────────────────────────────────────────────
  ipcMain.handle('film-engineering:auto-status', withSenderCheck((_e, payload) => {
    const params = payload || {}
    const projectRes = readProject({ home, taskId: params.taskId })
    if (!projectRes.ok) return { code: 0, data: { exists: false, taskId: params.taskId || null } }
    const project = projectRes.project
    const ledger = loadLedger(projectDir(home, project.taskId))
    let manifest = null
    let manifestError = null
    if (ledger) {
      const built = buildRenderManifest(ledger, { mediaRoot, probe })
      if (built.ok) manifest = built.entries
      else manifestError = built.error
    }
    const finalPath = manifest && manifest.length > 0
      ? path.join(mediaRoot, 'auto', project.taskId, 'final.mp4')
      : null
    return {
      code: 0,
      data: projectView(project, ledger, {
        exists: true,
        renderManifest: manifest,
        manifestError,
        finalPath,
        running: runningAutoTasks.has(project.taskId),
      }),
    }
  }))

  // ── 片段编辑（内容真源唯一写入口）─────────────────────────────────────
  ipcMain.handle('film-engineering:auto-update-shot', withSenderCheck((_e, payload) => {
    const params = payload || {}
    const projectRes = readProject({ home, taskId: params.taskId })
    if (!projectRes.ok) return validationFail(projectRes.errorCode, projectRes.message)
    const project = projectRes.project
    const r = updateShot(project, { shotIndex: params.shotIndex, patch: params.patch || {}, mediaRoot })
    if (!r.ok) return validationFail(r.errorCode, r.message)
    const written = writeProject({ home, project })
    if (!written.ok) return fail(EC.REQUEST_ERROR, written.errorCode, written.message)
    return { code: 0, data: { ok: true, shot: r.shot, editedAt: project.editedAt } }
  }))

  // ── 单镜重生成（原子覆盖；需最新确认）─────────────────────────────────
  ipcMain.handle('film-engineering:auto-regenerate-shot', withSenderCheck(async (_e, payload) => {
    const params = payload || {}
    const pre = providerOrError()
    if (pre.error) return pre.error
    const projectRes = readProject({ home, taskId: params.taskId })
    if (!projectRes.ok) return validationFail(projectRes.errorCode, projectRes.message)
    const project = projectRes.project
    const payloadHash = buildPayloadHash({
      shots: project.shots, aspect: project.aspect, seconds: project.seconds, providerId: project.providerId,
    })
    if (needsReconfirm(project, { payloadHash }) && params.confirmed !== true) {
      return { code: 0, data: { ok: false, needsReconfirm: true, payloadHash, taskId: project.taskId } }
    }
    if (needsReconfirm(project, { payloadHash })) {
      appendConfirmation(project, {
        payloadHash,
        shotsFingerprint: buildShotFingerprint(project.shots),
        planVersion: project.runSeq || 1,
      })
    }
    const r = await regenerateFn({
      project,
      shotIndex: params.shotIndex,
      aiGenerator,
      log,
      deps: o,
    })
    try { writeProject({ home, project }) } catch { /* 忽略 */ }
    if (!r.ok) return fail(EC.REQUEST_ERROR, r.errorCode || 'AUTO_REGENERATE_FAILED', r.message || '重生成失败')
    return { code: 0, data: { ok: true, path: r.path, shotIndex: params.shotIndex, shot: project.shots[params.shotIndex] } }
  }))

  // ── 收口清单校验（合成 run 仍由渲染端经既有 pipeline 通道发起，D31）──
  ipcMain.handle('film-engineering:auto-compose', withSenderCheck((_e, payload) => {
    const params = payload || {}
    const projectRes = readProject({ home, taskId: params.taskId })
    if (!projectRes.ok) return validationFail(projectRes.errorCode, projectRes.message)
    const project = projectRes.project
    const ledger = loadLedger(projectDir(home, project.taskId))
    if (!ledger) {
      return validationFail('AUTO_MANIFEST_INCOMPLETE', '尚未产生出片台账，无法收口合成')
    }
    const built = buildRenderManifest(ledger, { mediaRoot, probe })
    if (!built.ok) {
      const missing = collectMissingShots({ project, probe })
      return validationFail('AUTO_MANIFEST_INCOMPLETE',
        '渲染清单未收口（' + (built.error || '存在缺镜') + '）' + (missing.length > 0 ? '，缺失镜：' + missing.map((m) => m.shotId || ('#' + m.shotIndex)).join(', ') : ''))
    }
    return {
      code: 0,
      data: {
        ok: true,
        taskId: project.taskId,
        aspect: project.aspect,
        seconds: project.seconds,
        renderManifest: built.entries,
        clipCount: built.entries.length,
      },
    }
  }))

  return {
    registered: [
      'film-engineering:auto-plan', 'film-engineering:auto-start', 'film-engineering:auto-status',
      'film-engineering:auto-update-shot', 'film-engineering:auto-regenerate-shot',
      'film-engineering:auto-compose',
    ],
    event: 'film-engineering:auto-update',
  }
}

/** 台账里已完成镜数（批状态非 done 的镜不计） */
function countDone (ledger) {
  if (!ledger || !Array.isArray(ledger.batches)) return 0
  let n = 0
  for (const b of ledger.batches) {
    for (const s of b.shots || []) if (s.status === 'done') n += 1
  }
  return n
}

module.exports = registerAutoHandlers
module.exports.registerAutoHandlers = registerAutoHandlers
module.exports.runningAutoTasks = runningAutoTasks
module.exports.nowStamp = nowStamp
module.exports.MAX_AUTO_SHOTS = MAX_AUTO_SHOTS
module.exports.DRIVER_BATCH_SIZE = DRIVER_BATCH_SIZE
