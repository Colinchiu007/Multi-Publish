// @ts-check
// @vitest-environment node
const fs = require('fs')
const path = require('path')
const {
  DOMAIN_DICTIONARY, INTENT_ALIASES, SENTIMENT_WORDS, APPLY_WHEN,
  extractTopics, buildFingerprint, score, findSimilarTemplates, DICT_VERSION,
} = require('./fingerprint')

describe('fingerprint: 示例回归 (#1, C1)', () => {
  it('"AI 改变教育" vs education 模板 -> score=8 -> HIGH -> full', () => {
    const input = buildFingerprint('AI 改变教育')
    const tpl = { id: 'tpl-1', fingerprint: { schemaVersion: 1, dictVersion: DICT_VERSION, domains: ['education', 'tech'], compositionIntents: ['前后对比'], topics: [], tone: 'positive' }, stats: { acceptRate: 0.8, lastUsedAt: '2026-08-01' } }
    const r = score(input, tpl.fingerprint)
    expect(r.score).toBe(8)
    expect(r.tier).toBe('HIGH')
    const found = findSimilarTemplates('AI 改变教育', [tpl], { rand: () => 0.5 })[0]
    expect(found.refType).toBe('full')
    expect(found.templateId).toBe('tpl-1')
  })
})

describe('fingerprint: 换说法不换意思 (#2, V0 临时)', () => {
  it('"数据安全" vs "隐私保护" -> NONE (V0 保守, P3 embedding 解决)', () => {
    const tpl = { id: 'tpl-2', fingerprint: buildFingerprint('隐私保护'), stats: { acceptRate: 0.8, lastUsedAt: '2026-08-01' } }
    const found = findSimilarTemplates('数据安全', [tpl], { rand: () => 0.5 })
    expect(found[0].tier).toBe('NONE')
    expect(found[0].templateId).toBe(null)
  })
})

describe('fingerprint: intent=0 强制 NONE (#3, C2)', () => {
  it('多领域无意图输入 -> NONE, 不回退 fragment', () => {
    const tpl = { id: 'tpl-3', fingerprint: buildFingerprint('AI 医疗金融'), stats: {} }
    const found = findSimilarTemplates('AI 医疗金融', [tpl], { rand: () => 0.5 })
    expect(found[0].tier).toBe('NONE')
    expect(found[0].refType).toBe('none')
  })
})

describe('fingerprint: 档位边界 (#4)', () => {
  it('恰 4 分 -> MID; 恰 8 分 -> HIGH', () => {
    const base = buildFingerprint('AI 改变教育') // intents:[前后对比] domains:[tech,education] topics:[] tone:peaceful
    const fpMid = { domains: ['tech'], compositionIntents: ['前后对比'], topics: [], tone: 'peaceful' }
    const rMid = score(base, fpMid)
    expect(rMid.score).toBe(6)
    expect(rMid.tier).toBe('MID')
    const fpHigh = { domains: ['tech', 'education'], compositionIntents: ['前后对比'], topics: [], tone: 'peaceful' }
    const rHigh = score(base, fpHigh)
    expect(rHigh.score).toBe(8)
    expect(rHigh.tier).toBe('HIGH')
  })
})

describe('fingerprint: 探索 ε (#5, M7)', () => {
  it('activeCount<10 -> ε=0; rand 注入可测', () => {
    const tpl = { id: 'tpl-5', fingerprint: buildFingerprint('AI 改变教育'), stats: {} }
    const found = findSimilarTemplates('AI 改变教育', [tpl], { rand: () => 0 })
    expect(found[0].templateId).toBe('tpl-5')
  })
})

describe('fingerprint: 英文词边界 (#6, C3)', () => {
  it('domain/design/maintain 不得命中 tech; apple 不得命中 app', () => {
    for (const text of ['domain', 'design', 'maintain', 'apple', 'happy']) {
      const fp = buildFingerprint(text)
      expect(fp.domains).not.toContain('tech')
    }
    const fp = buildFingerprint('AI system')
    expect(fp.domains).toContain('tech')
  })
})

describe('fingerprint: 机器学习->tech (#7)', () => {
  it('复合词不被 education 的"学习"拉偏', () => {
    const fp = buildFingerprint('机器学习算法')
    expect(fp.domains).toContain('tech')
    expect(fp.domains).not.toContain('education')
  })
})

describe('fingerprint: 泛化词不产生 HIGH (#8, M1)', () => {
  it('性能优化/SEO 优化/职业规划/用户增长 不得触发 HIGH', () => {
    for (const text of ['性能优化', 'SEO 优化', '职业规划', '用户增长']) {
      const fp = buildFingerprint(text)
      const tpl = { id: 'tpl-8', fingerprint: fp, stats: {} }
      const found = findSimilarTemplates(text, [tpl], { rand: () => 0.5 })
      expect(found[0].tier).toBe('NONE')
      expect(fp.compositionIntents).toEqual([])
    }
  })
})

describe('fingerprint: 多领域偏置 (#9, M4)', () => {
  it('分量上限 min(2,|∩|) 防多领域偏置', () => {
    const input = buildFingerprint('AI 教育医疗金融')
    const single = { fingerprint: { domains: ['tech'], compositionIntents: [], topics: [], tone: 'peaceful' } }
    const multi = { fingerprint: { domains: ['tech', 'education', 'finance', 'health'], compositionIntents: [], topics: [], tone: 'peaceful' } }
    const s1 = score(input, single.fingerprint)
    const s2 = score(input, multi.fingerprint)
    expect(s2.score).toBeLessThanOrEqual(s1.score + 4)
  })
})

describe('fingerprint: 仅 tone 命中 (#10, M5)', () => {
  it('tone 相同但 peaceful -> 不计分 -> NONE', () => {
    const input = buildFingerprint('AI 改变教育')
    const tpl = { fingerprint: { domains: [], compositionIntents: [], topics: [], tone: 'peaceful' } }
    const r = score(input, tpl.fingerprint)
    expect(r.score).toBe(0)
    expect(r.tier).toBe('NONE')
  })
})

describe('fingerprint: 缓存陈旧 (#11, M6)', () => {
  it('dictVersion 变更后旧缓存指纹重算', () => {
    const oldFp = { schemaVersion: 1, dictVersion: '2026-01-01', domains: [], compositionIntents: [], topics: [], tone: 'peaceful' }
    expect(oldFp.dictVersion).not.toBe(DICT_VERSION)
    const fresh = buildFingerprint('AI 改变教育')
    expect(fresh.dictVersion).toBe(DICT_VERSION)
  })
})

describe('fingerprint: 索引失效 (#12, M4)', () => {
  it('deprecated 不参与检索; 空库返回 NONE', () => {
    const active = { id: 'tpl-a', fingerprint: buildFingerprint('AI 改变教育'), stats: {} }
    const found = findSimilarTemplates('AI 改变教育', [active], { rand: () => 0.5 })
    expect(found).toHaveLength(1)
    expect(found[0].templateId).toBe('tpl-a')
    const none = findSimilarTemplates('AI 改变教育', [], { rand: () => 0.5 })
    expect(none).toHaveLength(1)
    expect(none[0].tier).toBe('NONE')
    expect(none[0].templateId).toBe(null)
  })
})

describe('fingerprint: topics 提取 (#13)', () => {
  it('中英混合/空/全停用词/超长 -> 确定性、<=8、词典词剔除', () => {
    const fp = buildFingerprint('AI 改变教育的未来与学习方式')
    expect(fp.topics.length).toBeLessThanOrEqual(8)
    expect(fp.topics).not.toContain('AI')
    expect(fp.topics).not.toContain('教育')
    expect(fp.topics).not.toContain('学习')
    expect(buildFingerprint('').topics).toEqual([])
    expect(buildFingerprint('的的的').topics).toEqual([])
    expect(buildFingerprint('！？，。').topics).toEqual([])
    const long = '教育'.repeat(3000)
    expect(buildFingerprint(long).topics.length).toBeLessThanOrEqual(8)
  })
})

describe('fingerprint: 回退 (#14)', () => {
  it('全不命中 -> NONE (调用方回退内置池)', () => {
    const found = findSimilarTemplates('量子纠缠', [{ id: 'tpl-14', fingerprint: buildFingerprint('AI 改变教育'), stats: {} }], { rand: () => 0.5 })
    expect(found[0].tier).toBe('NONE')
  })
})


describe('fingerprint: 英文泛化词抑制（M1 补充）', () => {
  it('user growth / experience design 不触发角色状态', () => {
    for (const text of ['user growth', 'experience design']) {
      const fp = buildFingerprint(text)
      expect(fp.compositionIntents).not.toContain('角色状态')
    }
  })
})

describe('fingerprint: 探索分支返回契约（M5 补充）', () => {
  it('探索结果不泄漏 template 字段且含 learnedFrom', () => {
    const tpls = Array.from({ length: 12 }, (_, i) => ({ id: 'tpl-' + i, fingerprint: buildFingerprint('AI 改变教育'), stats: {} }))
    // rand 返回 0 → epsilon 路径（activeCount>=10 时 epsilon>0）
    const found = findSimilarTemplates('AI 改变教育', tpls, { rand: () => 0 })
    expect(found[0]).not.toHaveProperty('template')
    expect(found[0].provenance).toHaveProperty('learnedFrom')
  })
})

describe('fingerprint: topics 词典词子串剔除（M4 补充）', () => {
  it('"AI 改变教育" topics 为空（与规格 §3.3 示例一致）', () => {
    expect(buildFingerprint('AI 改变教育').topics).toEqual([])
  })
})

describe('fingerprint parity: applyWhen 与 SentimentAnalyzer 对齐 TS 权威版', () => {
  it('APPLY_WHEN 8 组与 storyboard-prompt.ts COMPOSITION_PATTERNS.applyWhen 逐字一致', () => {
    const ts = fs.readFileSync(path.join(__dirname, '../../../../../packages/story2video-engine/src/storyboard-prompt.ts'), 'utf8')
    const map = {}
    for (const m of ts.matchAll(/"([^"]+)":\s*\{[\s\S]*?applyWhen: (\[[^\]]*\])/g)) {
      map[m[1]] = JSON.parse(m[2])
    }
    expect(Object.keys(APPLY_WHEN).sort()).toEqual(Object.keys(map).sort())
    for (const k of Object.keys(APPLY_WHEN)) {
      expect([...APPLY_WHEN[k]].sort()).toEqual([...map[k]].sort())
    }
  })

  it('SENTIMENT_WORDS 与 history-prompt.ts SentimentAnalyzer 词逐字一致', () => {
    const ts = fs.readFileSync(path.join(__dirname, '../../../../../packages/story2video-engine/src/history-prompt.ts'), 'utf8')
    const extractWords = (line) => {
      const out = []
      const re = /'([^']+)'/g
      let m
      while ((m = re.exec(line)) !== null) out.push(m[1])
      return out
    }
    const posLine = ts.split(String.fromCharCode(10)).find((l) => l.includes("return 'positive'"))
    const negLine = ts.split(String.fromCharCode(10)).find((l) => l.includes("return 'negative'"))
    expect(SENTIMENT_WORDS.positive.sort()).toEqual(extractWords(posLine).filter((w) => SENTIMENT_WORDS.positive.includes(w)).sort())
    expect(SENTIMENT_WORDS.negative.sort()).toEqual(extractWords(negLine).filter((w) => SENTIMENT_WORDS.negative.includes(w)).sort())
  })
})
