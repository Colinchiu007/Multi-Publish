// @ts-check
'use strict'
/**
 * auto-plan 的指纹与哈希子模块（从 auto-plan.js 拆出，仅搬迁不改语义）
 *
 * 职责：sha256、分镜指纹（身份 + 顺序 + 提示词 + 秒数 + 参考路径）、确认载荷哈希（+画幅 +秒数 +provider）、
 *       planId（+taskId +参考图指纹 +时长 +provider）、参考图集合指纹。
 * 这些值是「某次调用对应哪次确认」「计划归属哪个任务」的机械判据（design D17/D26）。
 * 拆分动因：.github/scripts/check-max-lines.js 禁止新代码引入 500 行以上文件。
 */
const crypto = require('crypto')

function sha256 (text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex')
}


/** 分镜指纹（含身份、顺序、提示词、秒数与参考路径）——顺序敏感 */
function buildShotFingerprint (shots) {
  const list = (Array.isArray(shots) ? shots : []).map((s) => ({
    shotId: String(s && s.shotId ? s.shotId : ''),
    prompt: String(s && s.prompt ? s.prompt : ''),
    seconds: Number(s && s.seconds) || 0,
    refPaths: Array.isArray(s && s.refPaths) ? s.refPaths.map(String) : [],
  }))
  return sha256(JSON.stringify(list))
}

/** 确认载荷哈希（分镜指纹 + 画幅 + 单镜秒数 + provider）——用于「某次调用对应哪次确认」的审计 */
function buildPayloadHash (opts) {
  const o = opts || {}
  return sha256([
    buildShotFingerprint(o.shots),
    String(o.aspect || ''),
    String(o.seconds == null ? '' : o.seconds),
    String(o.providerId || ''),
  ].join('|'))
}

/** planId：服务端派生并内嵌归属（taskId）与配置指纹（参考图/provider 参与，变更即换 key） */
function buildPlanId (opts) {
  const o = opts || {}
  const material = [
    String(o.taskId || ''),
    String(o.scriptHash || ''),
    String(o.refsFingerprint || ''),
    String(o.aspect || ''),
    String(o.seconds == null ? '' : o.seconds),
    String(o.targetDurationSec == null ? '' : o.targetDurationSec),
    String(o.providerId || ''),
  ].join('|')
  return 'plan-' + sha256(material).slice(0, 16)
}

/** 参考图集合指纹（供 planId 参与位；顺序敏感） */
function buildRefsFingerprint (characterRefs, sceneRefs) {
  const chars = (Array.isArray(characterRefs) ? characterRefs : []).map((r) => String(r && r.name) + ':' + String(r && r.path))
  const scenes = (Array.isArray(sceneRefs) ? sceneRefs : []).map(String)
  return sha256(JSON.stringify({ characters: chars, scenes }))
}

module.exports = {
  sha256,
  buildShotFingerprint,
  buildPayloadHash,
  buildPlanId,
  buildRefsFingerprint,
}
