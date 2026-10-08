/**
 * Renderer ↔ preload 的 TTS 音色克隆 API。
 *
 * M-9 收敛：删掉本地 getTtsVoiceCloneApi / toPlainIpcValue 副本，改走
 * electron-bridge 的 invokeNamespace（ns=ttsVoiceClone）。每个导出直接
 * 写 ns/method 字面量（不经参数转发），让契约测试的对账看得见每条路径。
 *
 * 行为对齐：旧实现方法缺失 / 主进程拒绝时回 TTS_VOICE_CLONE_API_UNAVAILABLE
 * 信封 —— invokeNamespace 缺方法时返回 undefined，这里补上同一信封，语义一致。
 */
import { invokeNamespace } from './electron-bridge'

const NS = 'ttsVoiceClone'

function unavailable (data = undefined) {
  return data === undefined
    ? { code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE' }
    : { code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE', data }
}

export async function getTtsVoiceCloneRequirements (input) {
  const r = await invokeNamespace(NS, 'requirements', input)
  return r === undefined ? unavailable(null) : r
}

export async function chooseTtsVoiceCloneSamples (input) {
  const r = await invokeNamespace(NS, 'chooseSamples', input)
  return r === undefined ? unavailable({ paths: [] }) : r
}

export async function listTtsVoiceClones (input) {
  const r = await invokeNamespace(NS, 'list', input)
  return r === undefined ? unavailable({ voices: [] }) : r
}

export async function addTtsVoiceClone (input) {
  const r = await invokeNamespace(NS, 'add', input)
  return r === undefined ? unavailable(null) : r
}

export async function deleteTtsVoiceClone (input) {
  const r = await invokeNamespace(NS, 'deleteClone', input)
  return r === undefined ? unavailable(null) : r
}

export async function renameTtsVoiceClone (input) {
  const r = await invokeNamespace(NS, 'rename', input)
  return r === undefined ? unavailable(null) : r
}
