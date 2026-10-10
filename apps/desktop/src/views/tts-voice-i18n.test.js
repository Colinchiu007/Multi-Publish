/**
 * TTS 音色域 i18n 迁移回归锁（tts-i18n-migrate，2026-10-10）
 *
 * 背景：CreateView.vue 的 TTS 方法块原有 51 个硬编码中文字面量（56 处），
 * 使该域无法拆成 composable（新文件会撞 CI Gate 7 的 CJK 基线，见
 * 01-docs/FRONTEND-FILE-SPLIT-PLAN-2026-10.md §2.6 发现 T1）。
 * 本次把它们迁入 create.story2video.voice.* 键，本锁固定三件事：
 *   ① 新增键在 zh / en 均存在且非空（迁移不能只加一边）；
 *   ② voice 块 zh / en 键结构完全对称（Gate 7 成对校验的快速本地反馈）；
 *   ③ 迁移后的取值确实由 locale 驱动（同一输入在 zh / en 下输出不同）。
 *
 * 说明：不重复实现「源码不得含 CJK 字面量」的扫描——那是
 * .github/scripts/check-locale-sync.js --cjk 的单一职责（基线按 file:line 记账）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zhCreate from '@/locales/create/zh'
import enCreate from '@/locales/create/en'

const here = dirname(fileURLToPath(import.meta.url))

// 本次迁移新增的键（缺一即迁移不完整）
const MIGRATED_KEYS = [
  'catalogFetchFailed',
  'cloneInfoUnavailable',
  'defaultVoiceRestoreFailed',
  'selectionNotInCatalog',
  'selectionSaveFailed',
  'cloneSamplePickFailed',
  'cloneAddFailed',
  'cloneDeleteFailed',
  'cloneRenameFailed',
  'cloneNamePrefix',
  'kindImage',
  'kindAudio',
  'kindBgm',
  'kindVideo',
  'cloneHintFormat',
  'cloneHintMinDuration',
  'cloneHintMaxDuration',
  'cloneHintMaxSize',
  'durationMinutesSeconds',
  'durationMinutes',
  'durationSeconds',
]

// CreateView 里以 $t 直接引用的既有键（迁移后被复用）
const REFERENCED_KEYS = ['cloneSuccessToast', 'cloneStatusPending', 'catalogLoadFailed']

const zhVoice = zhCreate.story2video.voice
const enVoice = enCreate.story2video.voice

describe('TTS 音色域 i18n 迁移（tts-i18n-migrate）', () => {
  it('迁移新增键在 zh / en 均存在且为非空字符串', () => {
    const missing = []
    for (const key of MIGRATED_KEYS) {
      if (typeof zhVoice[key] !== 'string' || zhVoice[key].length === 0) missing.push(`zh.${key}`)
      if (typeof enVoice[key] !== 'string' || enVoice[key].length === 0) missing.push(`en.${key}`)
    }
    expect(missing).toEqual([])
  })

  it('迁移新增键不含未翻译的原样中文（en 侧不得整串复用 zh）', () => {
    const untranslated = MIGRATED_KEYS.filter((key) => enVoice[key] === zhVoice[key])
    expect(untranslated).toEqual([])
  })

  it('voice 块 zh / en 键结构完全对称', () => {
    const zhKeys = Object.keys(zhVoice).sort()
    const enKeys = Object.keys(enVoice).sort()
    expect(enKeys).toEqual(zhKeys)
  })

  it('被 $t 直接引用的键存在', () => {
    const missing = REFERENCED_KEYS.filter(
      (key) => typeof zhVoice[key] !== 'string' || typeof enVoice[key] !== 'string'
    )
    expect(missing).toEqual([])
  })

  it('占位符在 zh / en 两侧同名同数（插值不会静默失效）', () => {
    const holders = (s) => (s.match(/\{[a-zA-Z]+\}/g) || []).sort()
    const mismatch = MIGRATED_KEYS.filter(
      (key) => JSON.stringify(holders(zhVoice[key])) !== JSON.stringify(holders(enVoice[key]))
    )
    expect(mismatch).toEqual([])
  })

  it('TTS 取值确实由 locale 驱动（不再写死中文）——迁出前在 CreateView、迁出后在 TTS 模块族', () => {
    const view = readFileSync(resolve(here, 'CreateView.vue'), 'utf8')
    // TTS 模块族（按子域拆分：state / shared / clone / 门面）——键位归属断言须扫全族
    const family = ['tts-voices-state.js', 'tts-voices-shared.js', 'tts-voices-clone.js', 'useTtsVoices.js']
      .map((f) => readFileSync(resolve(here, 'video-creation/composables', f), 'utf8'))
      .join('\n')
    // 迁走的代表性命中不应再以字面量出现在壳或模块族中
    const gone = [
      "'图片'",
      "'旁白音频'",
      "'背景音乐'",
      "'视频素材'",
      "'所选音色不在当前目录中。'",
      "'无法添加克隆音色。'",
      "'已添加克隆音色「'",
      "'音色' + String(nextIndex)",
      '上传的音频文件格式需为：',
      "'自动 Edge TTS'",
      "'（多模态）'",
    ]
    expect(gone.filter((lit) => view.includes(lit))).toEqual([])
    expect(gone.filter((lit) => family.includes(lit))).toEqual([])
    // 键位归属：TTS 域方法迁出后，其 locale 键出现在模块族
    for (const key of [
      'create.story2video.voice.cloneNamePrefix',
      'create.story2video.voice.cloneHintFormat',
      'create.story2video.voice.durationMinutesSeconds',
      'create.story2video.voice.autoEdgeProvider',
    ]) {
      expect(family).toContain(key)
    }
    // kind 标签走 `create.story2video.voice.${labelKey}` 模板串，故断言其 map 值（仍在壳：被 BGM 依赖注入复用）
    expect(view).toContain("image: 'kindImage'")
    expect(view).toContain("bgm: 'kindBgm'")
  })
})
