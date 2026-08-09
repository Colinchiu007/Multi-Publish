import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'CreateView.vue')
const source = fs.readFileSync(filePath, 'utf8')

describe('Story2Video fast-mode UI contract', () => {
  it('uses five progressive-disclosure sections', () => {
    for (const section of ['basic', 'appearance', 'voice', 'advanced', 'publish']) {
      expect(source).toContain(`data-testid="s2v-section-${section}"`)
    }
    expect(source).toContain('s2vOpenSections: { basic: true, appearance: false, voice: false, advanced: false, publish: false }')
  })

  it('keeps controlled defaults hidden and starts the autonomous run', () => {
    expect(source).toContain("checkpointPolicy: 'none'")
    expect(source).toContain('autoAdvance: true')
    expect(source).toContain('background: true')
    expect(source).toContain('data-testid="start-story2video"')
    expect(source).toContain('<option value="auto">自动识别</option>')
    expect(source).toContain("create.story2video.startPipeline")
    expect(source).toContain("s2vSectionLabel('basic')")
    // 参数治理（7.1.19）：系统管理参数字段不得在 s2vConfig 默认对象中声明（精确匹配声明块，
    // 避免误伤注释中提及字段名的合法维护文本）。
    const s2vConfigBlock = source.match(/s2vConfig:\s*\{[\s\S]*?\n\s*\},\n?\s*orchestrationRunId/)?.[0] || ''
    expect(s2vConfigBlock).toContain('voiceSpeed')
    expect(s2vConfigBlock).not.toContain('voicePitch:')
    expect(s2vConfigBlock).not.toContain('creativeLevel:')
    expect(s2vConfigBlock).not.toContain('splitBaseWordsPerSecond:')
    // R2：splitSpeechRate/concurrency/autoAdvance 亦不得在 s2vConfig 默认对象声明（autoAdvance 由 params 字面量提供）
    expect(s2vConfigBlock).not.toContain('splitSpeechRate:')
    expect(s2vConfigBlock).not.toContain('concurrency:')
    expect(s2vConfigBlock).not.toContain('autoAdvance:')
    expect(source).not.toContain('v-model.number="s2vConfig.voicePitch"')
    expect(source).not.toContain('v-model.number="s2vConfig.concurrency"')
    expect(source).not.toContain('v-model.number="s2vConfig.creativeLevel"')
  })

  it('renders stage checklist instead of Story2Video percentage progress', () => {
    expect(source).toContain('data-testid="story2video-stage-list"')
    expect(source).toContain('story2video-stage-${stage.name || i}')
    expect(source).toContain("!isOrchestratedPipeline(selectedPipeline?.name) && pipelineRunStatus && pipelineRunStatus.progress")
  })

  it('compose 阶段渲染子进度条（story2video-stage-compose-progress）', () => {
    expect(source).toContain('story2video-stage-compose-progress')
    expect(source).toContain("stage.name === 'compose' && stage.status === 'running' && composeSubProgressPercent(stage) !== null")
    expect(source).toContain('stage-sub-fill')
    expect(source).toContain("composeSubProgressPercent(stage)")
    expect(source).toContain("ctx.compose_progress")
  })
})
