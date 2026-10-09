/**
 * podcast-channel.js — 播客 RSS 频道（小宇宙收录）IPC 桥接层
 *
 * 为什么单独一层：desktop-ui-consistency「IPC 渲染端访问单轨制」要求渲染层
 * （views/components/composables/stores）一律不直接触碰桌面端暴露面，
 * 命名空间形态的通道只能通过 electron-bridge 的 invokeNamespace 走。
 * 计数判据由 .github/scripts/check-frontend-consistency.js 钉 0（只降不升），
 * 所以新增播客相关调用必须加在本文件，不得在 composable 里另开第二处取用点。
 *
 * 为什么每个导出直接写方法名字面量，而不是一个 callPodcastIpc(method, …) 转发：
 * electron/tests/ipc-exposure-contract.test.js 的静态判据是**从调用点抽首参字面量**
 * 与 preload 暴露面对账；method 经辅助函数参数转发就变成「生产侧动态取名」，
 * 那条路径会从账上消失（同文件 C-1 与 src/api/tts-voice-catalog.js 头部注释记录的
 * 是同一个形态）。所以这里 8 个导出各自把字面量写在自己那一行，让每条路径都在账上。
 *
 * 合同（与 apps/desktop/electron/ipc-handlers/podcast.js 的 8 个 handle 一一对应）：
 *   channelGet / channelSave / episodeList / episodeSave / episodeRemove
 *   / feedBuild / feedVerify / endpointList
 * 返回值形状由主进程持有，本层不剥壳、不改写、不补默认值——
 * 错误码到文案的映射只在 usePodcastChannel.js 一份，禁止在此另写。
 *
 * 「不可用」与「调用失败」的区分口径：invokeNamespace 只在「无 API / 命名空间缺失 /
 * 方法不存在」时返回 undefined；handler 自身抛错会原样向上抛。两种情况在界面上
 * 语义不同（前者是环境问题、后者是本轮调用失败），所以这里用 available 标志把
 * 这个区分**显式带出去**，而不是压成一个 undefined 让调用方猜；也不在这里 try/catch
 * 吞异常（与 tts-voice-catalog 的「两种失败同一信封」有意不同，本功能的 PRD §9.1
 * 要求界面能区分「播客模块不可用」与「这一轮没成功」）。
 */
import { invokeNamespace } from './electron-bridge'

/** preload 暴露面上的命名空间键名（见 apps/desktop/electron/preload/index.js） */
const NS = 'podcast'

/** 把 invokeNamespace 的三态（undefined / 原值 / 抛错）中的前两态收成信封；抛错原样上抛 */
function toEnvelope (result) {
  return result === undefined ? { available: false } : { available: true, result }
}

export async function channelGet () {
  return toEnvelope(await invokeNamespace(NS, 'channelGet'))
}

export async function channelSave (payload) {
  return toEnvelope(await invokeNamespace(NS, 'channelSave', payload))
}

export async function episodeList () {
  return toEnvelope(await invokeNamespace(NS, 'episodeList'))
}

export async function episodeSave (payload) {
  return toEnvelope(await invokeNamespace(NS, 'episodeSave', payload))
}

export async function episodeRemove (id) {
  return toEnvelope(await invokeNamespace(NS, 'episodeRemove', id))
}

export async function feedBuild () {
  return toEnvelope(await invokeNamespace(NS, 'feedBuild'))
}

export async function feedVerify () {
  return toEnvelope(await invokeNamespace(NS, 'feedVerify'))
}

export async function endpointList () {
  return toEnvelope(await invokeNamespace(NS, 'endpointList'))
}
