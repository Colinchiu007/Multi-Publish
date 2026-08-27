// @vitest-environment node
/**
 * resolveProviderDefaultModel — 模型默认值「双默认语义」纯函数测试（2026-08-27）。
 * 优先级：① config.user_default_model（用户级，∈models 才生效）② config.default_model（运营预设）
 * ③ capability_models[type]（声明即有效）④ 单能力 models[0]；多模态无声明返回 ''（fail-closed）。
 */
const { resolveProviderDefaultModel } = require('./model-provider-manager')

const MM = {
  id: 'minimax-multimodal',
  category: 'multimodal',
  models: ['speech-2.8-turbo', 'image-01', 'MiniMax-Hailuo-2.3', 'MiniMax-M2.7'],
  capability_models: { llm: 'MiniMax-M2.7', tts: 'speech-2.8-turbo', image: 'image-01', video: 'MiniMax-Hailuo-2.3' },
}

describe('resolveProviderDefaultModel（双默认语义）', () => {
  it('1. 用户默认优先于运营预设与能力路由', () => {
    expect(resolveProviderDefaultModel({ ...MM, config: { user_default_model: 'MiniMax-M2.7', default_model: 'MiniMax-Hailuo-2.3' } }, 'llm')).toBe('MiniMax-M2.7')
  })

  it('2. 用户未设置时使用运营预设默认', () => {
    expect(resolveProviderDefaultModel({ ...MM, config: { default_model: 'MiniMax-Hailuo-2.3' } }, 'llm')).toBe('MiniMax-Hailuo-2.3')
  })

  it('3. 用户默认不在 models 视为失效并回退（不污染配置）', () => {
    expect(resolveProviderDefaultModel({ ...MM, config: { user_default_model: 'expired-model', default_model: 'MiniMax-M2.7' } }, 'llm')).toBe('MiniMax-M2.7')
  })

  it('4. 运营预设不在 models 也失效回退能力路由', () => {
    expect(resolveProviderDefaultModel({ ...MM, config: { default_model: 'expired-ops' } }, 'llm')).toBe('MiniMax-M2.7')
  })

  it('5. 多模态按能力路由（声明即有效，不要求 ∈ models）', () => {
    expect(resolveProviderDefaultModel({ ...MM, config: {} }, 'tts')).toBe('speech-2.8-turbo')
  })

  it('6. 多模态无任何声明时返回空（fail-closed，不猜测）', () => {
    const bare = { id: 'x', category: 'multimodal', models: ['a', 'b'] }
    expect(resolveProviderDefaultModel(bare, 'llm')).toBe('')
    expect(resolveProviderDefaultModel(bare, 'video')).toBe('')
  })

  it('7. 单能力 provider 回退 models[0]', () => {
    expect(resolveProviderDefaultModel({ id: 'flux', category: 'image', models: ['flux-pro', 'flux-dev'] }, 'image')).toBe('flux-pro')
  })

  it('8. 单能力 provider 用户默认生效', () => {
    expect(resolveProviderDefaultModel({ id: 'flux', category: 'image', models: ['flux-pro', 'flux-dev'], config: { user_default_model: 'flux-dev' } }, 'image')).toBe('flux-dev')
  })

  it('9. 非法输入返回空字符串，不抛错', () => {
    expect(resolveProviderDefaultModel(null, 'llm')).toBe('')
    expect(resolveProviderDefaultModel(undefined, 'llm')).toBe('')
    expect(resolveProviderDefaultModel('str', 'llm')).toBe('')
    expect(resolveProviderDefaultModel({}, 'llm')).toBe('')
  })

  it('10. models 中空白/非字符串项被忽略', () => {
    const dirty = { id: 'x', category: 'llm', models: ['', '  ', null, 42, 'valid'] }
    expect(resolveProviderDefaultModel(dirty, 'llm')).toBe('valid')
  })

  it('11. 用户默认 trim 后匹配 models', () => {
    expect(resolveProviderDefaultModel({ id: 'x', category: 'llm', models: ['gpt-4o'], config: { user_default_model: '  gpt-4o  ' } }, 'llm')).toBe('gpt-4o')
  })

  it('12. capability_models 为字符串（异常构造）时安全降级', () => {
    expect(resolveProviderDefaultModel({ id: 'x', category: 'llm', models: ['a'], capability_models: 'oops' }, 'llm')).toBe('a')
  })
})
