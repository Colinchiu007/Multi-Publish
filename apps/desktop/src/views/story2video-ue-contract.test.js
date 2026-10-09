import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'CreateView.vue')
const spFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'video-creation', 'StageProgress.vue')
// 2026-09-20 抽取：六个折叠区的模板已从 CreateView.vue 逐字节搬至 S2vConfigPanels.vue，
// 本契约描述的是「故事讲述页应有的 UI 结构」，与宿主文件无关，故一并纳入扫描范围。
const panelFilePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'video-creation', 'S2vConfigPanels.vue')
const createViewSource = fs.readFileSync(filePath, 'utf8')
const spSource = fs.readFileSync(spFilePath, 'utf8')
const panelSource = fs.readFileSync(panelFilePath, 'utf8')
const source = createViewSource + '\n' + spSource + '\n' + panelSource

describe('Story2Video fast-mode UI contract', () => {
  it('uses progressive-disclosure sections（2026-08-11 新增 videoEnhance）', () => {
    for (const section of ['basic', 'appearance', 'videoEnhance', 'voice', 'advanced', 'publish']) {
      expect(source).toContain(`data-testid="s2v-section-${section}"`)
    }
    expect(source).toContain('s2vOpenSections: { basic: true, appearance: false, videoEnhance: false, voice: false, advanced: false, publish: false }')
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
    // 2026-10-09 参数化：StageProgress 的 testid 改为经 tid(suffix) 前缀化（影视工程自动模式复用同一组件），
    // 本锁随之改为「默认前缀 + 可组合后缀」两段断言——默认值锁死 story2video，行为等价性另有挂载级用例
    // （src/views/video-creation/StageProgress.testid.test.js 断言默认渲染出 story2video-* 节点）。
    expect(spSource).toContain("testidPrefix: { type: String, default: 'story2video' }")
    expect(spSource).toContain("tid('stage-list')")
    expect(spSource).toContain('tid(`stage-${stage.name || index}`)')
    expect(source).toContain("!isOrchestratedPipeline(selectedPipeline?.name) && pipelineProgressStages.length === 0 && pipelineRunStatus && pipelineRunStatus.progress")
  })

  it('阶段迷你进度条通用渲染（任意阶段带合法 percent；compose 保留既有 testid 语义）', () => {
    expect(spSource).toContain("tid('stage-compose-progress')")
    expect(spSource).toContain('stageProgressPercent(stage) !== null')
    expect(spSource).toContain("tid('stage-sub-fill')")
    expect(source).toContain("stageProgressPercent(stage)")
    // compose 旧快照降级路径保留（无 stage.progress 时读 context.compose_progress）
    expect(source).toContain('ctx.compose_progress')
    // 统一契约：stage.progress.message / stage.summary 优先渲染
    expect(source).toContain('stage.progress.message')
    expect(source).toContain('stage.summary')
    // 禁止回退为裸 testid 字面量（那会让自动模式复用再次破锁）
    expect(spSource).not.toContain('data-testid="story2video-')
  })

  it('合成时间说明块由父组件按 story2video 门控（2026-08-17）', () => {
    expect(source).toContain(':show-time-guidance="isOrchestratedPipeline(selectedPipeline?.name)"')
    expect(source).toContain('v-if="showTimeGuidance"')
  })
})
