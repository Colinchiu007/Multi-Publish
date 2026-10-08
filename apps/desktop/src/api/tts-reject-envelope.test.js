// CCG 评审 i1 回归锁：tts 包装层在「主进程 reject」时必须回 UNAVAILABLE 信封。
//
// 为什么有这条：invokeNamespace 只在缺方法时返回 undefined；主进程 handler
// reject 会**冒泡**。首版包装层漏了 catch，把旧实现「拒绝也回信封」的语义
// 弄丢了——"模型未就绪时查询目录"会变成调用侧 unhandled rejection（CCG 抓到）。
//
//   pnpm exec vitest run src/api/tts-reject-envelope.test.js

import { describe, it, expect, vi } from 'vitest'

const rejectError = new Error('handler boom')
vi.mock('./electron-bridge', () => ({
  invokeNamespace: vi.fn(async () => { throw rejectError }),
}))

import { getTtsVoiceCatalog } from './tts-voice-catalog'
import { getTtsVoiceCloneRequirements } from './tts-voice-clone'

describe('CCG i1：tts 包装层的主进程拒绝必须转信封', () => {
  it('catalog reject ⇒ UNAVAILABLE 信封（不 unhandled rejection）', async () => {
    const r = await getTtsVoiceCatalog({})
    expect(r).toEqual({ code: -1, message: 'TTS_VOICE_API_UNAVAILABLE', data: { voices: [] } })
  })

  it('clone reject ⇒ CLONE 信封（data:null 与旧实现 unavailable(null) 一致）', async () => {
    const r = await getTtsVoiceCloneRequirements({})
    expect(r).toEqual({ code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE', data: null })
  })

  it('信封字段断言（防有人把 fallback 改成裸 undefined）', async () => {
    const r = await getTtsVoiceCatalog({})
    expect(r.code).toBe(-1)
    expect(r.message).toBe('TTS_VOICE_API_UNAVAILABLE')
  })
})
