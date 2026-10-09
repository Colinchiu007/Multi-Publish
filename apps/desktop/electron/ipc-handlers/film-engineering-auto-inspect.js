// @ts-check
'use strict'
/**
 * 影视工程「自动」模式的**检视与修订**通道（从 film-engineering-auto.js 拆出，逐字搬迁）
 *
 * 覆盖 4 条通道：auto-status（只读状态投影）、auto-update-shot（片段编辑的唯一写入口）、
 * auto-regenerate-shot（单镜重生成，需最新确认）、auto-compose（收口清单校验；合成 run 仍由
 * 渲染端经既有 pipeline 通道发起，见 design D31）。
 *
 * 与 film-engineering-auto.js 的分工：那边管**生命周期**（plan / start / stop，含单飞、成本门槛、
 * 停止标志），这边管**对既有任务的检视与修订**（不启动批次、不改批次编排）。
 * 拆分动因：.github/scripts/check-max-lines.js 禁止新代码引入 500 行以上文件。
 *
 * 依赖一律经 ctx 注入（不在此文件自行 require 业务模块），保证与主模块共用同一份状态与投影函数——
 * 尤其是 runningAutoTasks / projectView / providerOrError，各拿一份就会读出不一致的状态。
 */

function registerAutoInspectHandlers (ipcMain, ctx) {
  const {
    EC, path, withSenderCheck,
    home, mediaRoot, probe, log, aiGenerator, deps: o, runningAutoTasks,
    readProject, writeProject, loadLedger, projectDir, buildRenderManifest, projectView,
    validationFail, fail, providerOrError, buildPayloadHash, needsReconfirm, appendConfirmation,
    buildShotFingerprint, regenerateFn, updateShot, collectMissingShots,
  } = ctx || {}

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

  return [
    'film-engineering:auto-status', 'film-engineering:auto-update-shot',
    'film-engineering:auto-regenerate-shot', 'film-engineering:auto-compose',
  ]
}

module.exports = { registerAutoInspectHandlers }
