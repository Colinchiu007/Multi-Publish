// @ts-check
/**
 * pipeline-model-preflight.test.js — 流水线启动前模型能力前置校验
 *
 * 覆盖 openspec/specs/pipeline-model-preflight 的每个 Scenario：
 * 静态映射 / story2video 动态规则 / 默认与显式 provider 校验语义 / fail-open 边界。
 */
import { describe, it, expect, vi } from 'vitest'
const {
  checkPipelineModelRequirements,
  resolvePipelineModelRequirements,
  STATIC_PIPELINE_REQUIREMENTS,
  PIPELINE_MODEL_REQUIREMENTS_MISSING,
} = require('../services/pipeline-model-preflight')

const noopLog = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }

/**
 * 构造可控的 ModelProviderManager mock（_ready=true，行为与真实管理器一致）：
 * defaults[capability] 存在 → getDefault 返回 provider；否则 null。
 * providers[id] 存在 → getProviderWithKey 返回 { id, base_url, api_key }；否则 null。
 */
function makeManager ({ defaults = {}, providers = {} } = {}) {
  return {
    _ready: true,
    getDefault: vi.fn((capability) => {
      if (defaults[capability]) return { id: 'default-' + capability, category: capability }
      return null
    }),
    getProviderWithKey: vi.fn((id) => {
      if (!providers[id]) return null
      return {
        id,
        base_url: providers[id].base_url || '',
        api_key: providers[id].api_key || '',
      }
    }),
  }
}

describe('resolvePipelineModelRequirements 静态映射', () => {
  it('animated-explainer → llm + image', () => {
    const { capabilities } = resolvePipelineModelRequirements('animated-explainer', {})
    expect(capabilities).toEqual(['llm', 'image'])
  })

  it('animation / avatar-spokesperson / character-animation / hybrid → llm + video', () => {
    for (const name of ['animation', 'avatar-spokesperson', 'character-animation', 'hybrid']) {
      const { capabilities } = resolvePipelineModelRequirements(name, {})
      expect(capabilities, name).toEqual(['llm', 'video'])
    }
  })

  it('documentary-montage → llm + image', () => {
    expect(resolvePipelineModelRequirements('documentary-montage', {}).capabilities).toEqual(['llm', 'image'])
  })

  it('localization-dub → llm；显式 voiceProvider 时 +tts', () => {
    expect(resolvePipelineModelRequirements('localization-dub', {}).capabilities).toEqual(['llm'])
    const withVoice = resolvePipelineModelRequirements('localization-dub', { voiceProvider: 'minimax-tts' })
    expect(withVoice.capabilities).toEqual(['llm', 'tts'])
    expect(withVoice.providers).toEqual({ tts: 'minimax-tts' })
  })

  it('podcast-repurpose → image；无 transcript 时 +speech_recognition', () => {
    const withoutTranscript = resolvePipelineModelRequirements('podcast-repurpose', {})
    expect(withoutTranscript.capabilities).toEqual(['image', 'speech_recognition'])
    const withTranscript = resolvePipelineModelRequirements('podcast-repurpose', { transcript: '已有文案' })
    expect(withTranscript.capabilities).toEqual(['image'])
  })

  it('纯本地流水线（talking-head/cinematic/clip-factory/framework-smoke/screen-demo）不要求任何模型', () => {
    for (const name of ['talking-head', 'cinematic', 'clip-factory', 'framework-smoke', 'screen-demo']) {
      expect(resolvePipelineModelRequirements(name, {}).capabilities, name).toEqual([])
    }
  })

  it('film-engineering 默认无要求；llmEnabled 开启时 +llm', () => {
    expect(resolvePipelineModelRequirements('film-engineering', {}).capabilities).toEqual([])
    expect(resolvePipelineModelRequirements('film-engineering', { llmEnabled: true }).capabilities).toEqual(['llm'])
  })
})

describe('resolvePipelineModelRequirements story2video-compose 动态规则', () => {
  const baseConfig = (video = {}) => ({
    story2videoTextConfig: {
      version: 1,
      mode: 'text',
      prompt: '测试文案',
      split: { language: 'zh' },
      image: { provider: '' },
      voice: { provider: '' },
      video,
    },
  })

  it('video.mode=off（纯图片轮播）→ 仅 image', () => {
    const { capabilities } = resolvePipelineModelRequirements('story2video-compose', baseConfig({ mode: 'off' }))
    expect(capabilities).toEqual(['image'])
  })

  it('video.mode=fixed → image + video', () => {
    const { capabilities } = resolvePipelineModelRequirements('story2video-compose', baseConfig({ mode: 'fixed' }))
    expect(capabilities).toEqual(['image', 'video'])
  })

  it('video.mode=ai-judged → image + video + llm', () => {
    const { capabilities } = resolvePipelineModelRequirements('story2video-compose', baseConfig({ mode: 'ai-judged' }))
    expect(capabilities).toEqual(['image', 'video', 'llm'])
  })

  it('video 段缺失按 off 处理，不要求视频模型', () => {
    const { capabilities } = resolvePipelineModelRequirements('story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' } },
    })
    expect(capabilities).toEqual(['image'])
  })

  it('兼容扁平旧参数 videoMode/videoProvider/voiceProvider/imageProvider', () => {
    const r = resolvePipelineModelRequirements('story2video-compose', {
      videoMode: 'fixed',
      videoProvider: 'kling',
      voiceProvider: 'minimax-tts',
      imageProvider: 'dashscope-image',
    })
    expect(r.capabilities).toEqual(['image', 'video', 'tts'])
    expect(r.providers).toEqual({ image: 'dashscope-image', video: 'kling', tts: 'minimax-tts' })
  })

  it('voiceProvider 为空（内置 Edge TTS）→ 不要求 tts', () => {
    const { capabilities } = resolvePipelineModelRequirements('story2video-compose', baseConfig({ mode: 'off' }))
    expect(capabilities).not.toContain('tts')
  })

  it('voiceProvider 非空 → 要求 tts 且记录 provider', () => {
    const config = baseConfig({ mode: 'off' })
    config.story2videoTextConfig.voice.provider = 'openai-tts'
    const r = resolvePipelineModelRequirements('story2video-compose', config)
    expect(r.capabilities).toEqual(['image', 'tts'])
    expect(r.providers).toEqual({ tts: 'openai-tts' })
  })
})

describe('checkPipelineModelRequirements 校验语义', () => {
  it('默认解析通过：getDefault 返回可用 provider', () => {
    const manager = makeManager({ defaults: { image: true, llm: true } })
    const result = checkPipelineModelRequirements(manager, 'animated-explainer', {}, noopLog)
    expect(result).toEqual({ success: true, checked: true })
    expect(manager.getDefault).toHaveBeenCalledWith('llm')
    expect(manager.getDefault).toHaveBeenCalledWith('image')
  })

  it('默认解析缺失被拦截：missing 数组包含缺失能力，错误契约完整', () => {
    const manager = makeManager({ defaults: { llm: true } })
    const result = checkPipelineModelRequirements(manager, 'animation', {}, noopLog)
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe(PIPELINE_MODEL_REQUIREMENTS_MISSING)
    expect(result.errorParams).toEqual({ missing: ['video'], providers: {} })
    expect(result.error).toContain('视频')
  })

  it('多能力缺失全部列出（ai-judged：llm 与 video 均缺）', () => {
    const manager = makeManager({ defaults: {} })
    const result = checkPipelineModelRequirements(manager, 'story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' }, video: { mode: 'ai-judged' } },
    }, noopLog)
    expect(result.errorParams.missing).toEqual(['image', 'video', 'llm'])
  })

  it('显式 provider 凭据可用通过（解密 Key 非空）', () => {
    const manager = makeManager({
      defaults: { image: true },
      providers: { kling: { api_key: 'sk-test', base_url: 'https://api.kling.example' } },
    })
    const result = checkPipelineModelRequirements(manager, 'story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' }, video: { mode: 'fixed', provider: 'kling' } },
    }, noopLog)
    expect(result.success).toBe(true)
    expect(manager.getProviderWithKey).toHaveBeenCalledWith('kling')
  })

  it('显式 provider 无凭据被拦截：missing 含能力并附 provider 标识', () => {
    const manager = makeManager({ providers: { kling: { api_key: '', base_url: 'https://api.kling.example' } } })
    const result = checkPipelineModelRequirements(manager, 'story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' }, video: { mode: 'fixed', provider: 'kling' } },
    }, noopLog)
    expect(result.success).toBe(false)
    expect(result.errorParams.missing).toEqual(['image', 'video'])
    expect(result.errorParams.providers).toEqual({ video: 'kling' })
  })

  it('显式 provider 不存在被拦截', () => {
    const manager = makeManager({ providers: {} })
    const result = checkPipelineModelRequirements(manager, 'story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' }, video: { mode: 'fixed', provider: 'ghost' } },
    }, noopLog)
    expect(result.success).toBe(false)
    expect(result.errorParams.providers).toEqual({ video: 'ghost' })
  })

  it('本地免 Key provider（piper + loopback）显式时通过', () => {
    const manager = makeManager({
      defaults: { llm: true },
      providers: { piper: { api_key: '', base_url: 'http://127.0.0.1:5000' } },
    })
    const result = checkPipelineModelRequirements(manager, 'localization-dub', { voiceProvider: 'piper' }, noopLog)
    expect(result.success).toBe(true)
  })

  it('非 loopback 的免 Key provider 视为无凭据', () => {
    const manager = makeManager({
      defaults: { llm: true },
      providers: { piper: { api_key: '', base_url: 'https://piper.example.com' } },
    })
    const result = checkPipelineModelRequirements(manager, 'localization-dub', { voiceProvider: 'piper' }, noopLog)
    expect(result.success).toBe(false)
    expect(result.errorParams.providers).toEqual({ tts: 'piper' })
  })

  it('Edge TTS 免配置：无显式 voiceProvider 时不要求 tts', () => {
    const manager = makeManager({ defaults: { image: true } })
    const result = checkPipelineModelRequirements(manager, 'story2video-compose', {
      story2videoTextConfig: { version: 1, mode: 'text', prompt: 'x', split: { language: 'zh' }, video: { mode: 'off' } },
    }, noopLog)
    expect(result.success).toBe(true)
    expect(manager.getDefault).not.toHaveBeenCalledWith('tts')
  })
})

describe('checkPipelineModelRequirements fail-open 边界', () => {
  it('管理器缺失 → 跳过校验（checked=false）并告警', () => {
    const warn = vi.fn()
    const result = checkPipelineModelRequirements(null, 'animation', {}, { warn })
    expect(result).toEqual({ success: true, checked: false })
    expect(warn).toHaveBeenCalled()
  })

  it('管理器未初始化（_ready=false）→ 跳过校验', () => {
    const manager = makeManager()
    manager._ready = false
    const result = checkPipelineModelRequirements(manager, 'animation', {}, noopLog)
    expect(result.success).toBe(true)
    expect(result.checked).toBe(false)
  })

  it('未知流水线 → fail-open 放行（unmapped=true）并告警', () => {
    const warn = vi.fn()
    const manager = makeManager()
    const result = checkPipelineModelRequirements(manager, 'future-pipeline', {}, { warn })
    expect(result).toEqual({ success: true, checked: true, unmapped: true })
    expect(warn).toHaveBeenCalled()
  })

  it('全部能力齐备 → success', () => {
    const manager = makeManager({ defaults: { llm: true, image: true } })
    expect(checkPipelineModelRequirements(manager, 'documentary-montage', {}, noopLog).success).toBe(true)
  })
})

describe('STATIC_PIPELINE_REQUIREMENTS 注册表完整性', () => {
  it('覆盖全部已实现编排流水线（含 story2video-compose 动态规则另表）', () => {
    const keys = Object.keys(STATIC_PIPELINE_REQUIREMENTS)
    expect(keys).toEqual([
      'animated-explainer',
      'animation',
      'avatar-spokesperson',
      'character-animation',
      'hybrid',
      'documentary-montage',
      'localization-dub',
      'podcast-repurpose',
      'talking-head',
      'cinematic',
      'clip-factory',
      'framework-smoke',
      'screen-demo',
      'film-engineering',
    ])
    expect(keys).not.toContain('story2video-compose')
  })
})
