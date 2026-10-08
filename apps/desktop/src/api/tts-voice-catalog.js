/**
 * Renderer ↔ preload 的 TTS 音色目录 API。
 * 该模块不直接触碰 Electron IPC，只调用固定的 contextBridge 表面。
 *
 * M-9 收敛：删掉本地 getTtsVoiceApi / toPlainIpcValue 副本，改走
 * electron-bridge 的 invokeNamespace（ns=ttsVoice）——脱壳与命名空间对账
 * 由契约测试 ipc-exposure-contract 统一守。
 *
 * 为什么每个导出直接写字面量而不经内部辅助函数转发：契约测试的静态判据
 * 从调用点抽首参字面量做对账，`method` 经辅助函数参数转发会变成"动态取名"，
 * 对账就看不见这条路径了（C-1 正是这形态）。直接写字面量让每条路径都在账上。
 *
 * 行为对齐：旧实现方法缺失 / 主进程拒绝时回 TTS_VOICE_API_UNAVAILABLE 信封 ——
 * invokeNamespace 缺方法时返回 undefined，这里补上同一信封，语义一致。
 */
import { invokeNamespace } from './electron-bridge'

const NS = 'ttsVoice'

function unavailable (data = undefined) {
  return data === undefined
    ? { code: -1, message: 'TTS_VOICE_API_UNAVAILABLE' }
    : { code: -1, message: 'TTS_VOICE_API_UNAVAILABLE', data }
}

export async function getTtsVoiceCatalog (input) {
  const r = await invokeNamespace(NS, 'catalog', input)
  return r === undefined ? unavailable({ voices: [] }) : r
}

export async function getTtsVoiceCapability (input) {
  const r = await invokeNamespace(NS, 'capability', input)
  return r === undefined ? unavailable(null) : r
}

export async function selectTtsVoice (input) {
  const r = await invokeNamespace(NS, 'select', input)
  return r === undefined ? unavailable(null) : r
}

export async function clearTtsVoicePreference (input) {
  const r = await invokeNamespace(NS, 'clearPreference', input)
  return r === undefined ? unavailable(null) : r
}
