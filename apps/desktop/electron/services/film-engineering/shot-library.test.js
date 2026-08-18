// @ts-check
'use strict'
/**
 * shot-library 契约测试
 * 覆盖：listScenes / listShots / getShot / 非法 id / buildCopyText 四种模式
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const { loadFilmKit } = require('./kit-loader')
const { ShotLibrary } = require('./shot-library')

const UUID_A = '3caa2f3a-52b5-4293-9237-0c8f76c7158a'
const UUID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const PROMPT_FULL = [
  'EXT. CITY STREET - NIGHT',
  '',
  '[CHARACTER: ROKO] Roko charges forward, fist glowing red.',
  '[CHARACTER: JAXX] Jaxx covers from the alley. [REFERENCE: ' + UUID_B + ']',
  '',
  'GEO SPATIAL LAYOUT',
  'Roko center frame, robot army left, alley right.',
  '',
  'ACTION TIMING',
  '0-2s: Roko runs; 2-4s: fist strikes.',
  '',
  'AUDIO',
  'Heavy footsteps, metal screech.',
  '',
  'CHARACTER ACTING',
  'Roko: desperate but determined.',
  '',
  'POSITIVE CONSTRAINTS',
  'Cinematic lighting, 4k detail.',
].join('\n')

function makeKitData () {
  return {
    manifest: {
      schemaVersion: 1,
      filmMeta: {
        title: 'Hell Grind',
        durationSec: 5706,
        logline: 'logline',
        characters: [
          { name: 'ROKO', descriptor: 'Determined street kid' },
          { name: 'JAXX', descriptor: 'Reckless street kid' },
          { name: 'LULU', descriptor: 'Clever street kid' },
          { name: 'REIN', descriptor: 'Mysterious street kid' },
        ],
      },
      scenes: [
        { id: 'cold-open', name: '1. COLD OPEN', count: 12, parentId: null, level: 0 },
        { id: 'scene-25', name: 'Scene 25 Roko vs Robots', count: 4555, parentId: null, level: 0 },
        { id: 'scene-25a', name: 'Scene 25A', count: 5, parentId: 'scene-25', level: 1 },
      ],
    },
    shots: [
      {
        shotId: UUID_A,
        sceneId: 'scene-25',
        prompt: PROMPT_FULL,
        model: 'seedance_2_0',
        refTokens: [UUID_B],
        resultUrl: 'https://cdn.example.com/raw/abc.mp4',
        width: 1920,
        height: 1080,
      },
      {
        shotId: UUID_B,
        sceneId: 'scene-25a',
        prompt: 'Close-up of JAXX hiding. GEO SPATIAL LAYOUT\nJaxx in shadow, right third.',
        model: 'nano_banana_2',
        refTokens: [],
      },
    ],
    references: {
      [UUID_B]: { kind: 'character', name: 'JAXX', imageUrls: ['https://cdn.example.com/jaxx.png'] },
    },
    doctrine: {
      blocks: [{ key: 'geo_spatial_layout', label: 'GEO SPATIAL LAYOUT', zh: '地理空间布局', en: 'Geo spatial layout' }],
      rules: [{ key: 'batch-10-15', title: 'Batch iteration', zh: '批量迭代法则', en: 'Batch rule' }],
      glossary: [{ term: 'seedance', zh: '种子舞', en: 'Seedance' }],
    },
  }
}

function makeLibrary () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-lib-test-'))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'film-manifest.json'), JSON.stringify(makeKitData().manifest))
  fs.writeFileSync(path.join(dir, 'shot-library.json'), JSON.stringify(makeKitData().shots))
  fs.writeFileSync(path.join(dir, 'reference-registry.json'), JSON.stringify(makeKitData().references))
  fs.writeFileSync(path.join(dir, 'prompt-doctrine.json'), JSON.stringify(makeKitData().doctrine))
  const loaded = loadFilmKit({ kitDir: dir })
  expect(loaded.ok).toBe(true)
  return new ShotLibrary({ kit: loaded.kit })
}

it('shot-library: listScenes 返回场景树与计数', () => {
  const lib = makeLibrary()
  const scenes = lib.listScenes()
  expect(scenes.length).toBe(3)
  const s25 = scenes.find((s) => s.id === 'scene-25')
  expect(s25).toBeTruthy()
  expect(s25.count).toBe(4555)
  expect(s25.shotCount).toBe(1)
})

it('shot-library: listShots 按 sceneId 过滤', () => {
  const lib = makeLibrary()
  const shots = lib.listShots('scene-25')
  expect(shots.length).toBe(1)
  expect(shots[0].shotId).toBe(UUID_A)
  expect(shots[0].prompt).toBe(PROMPT_FULL)
  expect(shots[0].model).toBe('seedance_2_0')
})

it('shot-library: listShots 未知 sceneId 报错', () => {
  const lib = makeLibrary()
  expect(() => lib.listShots('nope')).toThrow(/nope/)
})

it('shot-library: getShot 返回分镜与 ref 解析', () => {
  const lib = makeLibrary()
  const shot = lib.getShot(UUID_A)
  expect(shot.shotId).toBe(UUID_A)
  expect(Array.isArray(shot.resolvedRefs)).toBeTruthy()
  const jaxx = shot.resolvedRefs.find((r) => r.token === UUID_B)
  expect(jaxx).toBeTruthy()
  expect(jaxx.entry.kind).toBe('character')
  expect(jaxx.entry.name).toBe('JAXX')
})

it('shot-library: getShot 未知 shotId 报错', () => {
  const lib = makeLibrary()
  expect(() => lib.getShot('nope')).toThrow(/nope/)
})

it('shot-library: buildCopyText full 返回原文', () => {
  const lib = makeLibrary()
  const text = lib.buildCopyText(UUID_A, 'full')
  expect(text).toBe(PROMPT_FULL)
})

it('shot-library: buildCopyText blocks 提取块并标注空块', () => {
  const lib = makeLibrary()
  const text = lib.buildCopyText(UUID_A, 'blocks')
  expect(text).toMatch(/GEO SPATIAL LAYOUT/)
  expect(text).toMatch(/Roko center frame/)
  expect(text).toMatch(/ACTION TIMING/)
  expect(text).toMatch(/AUDIO/)
  expect(text).toMatch(/CHARACTER ACTING/)
  expect(text).toMatch(/POSITIVE CONSTRAINTS/)
})

it('shot-library: buildCopyText characters 提取角色行', () => {
  const lib = makeLibrary()
  const text = lib.buildCopyText(UUID_A, 'characters')
  expect(text).toMatch(/\[CHARACTER: ROKO\]/)
  expect(text).toMatch(/\[CHARACTER: JAXX\]/)
  expect(text).not.toMatch(/GEO SPATIAL LAYOUT/)
})

it('shot-library: buildCopyText geo 仅提取 GEO 块', () => {
  const lib = makeLibrary()
  const text = lib.buildCopyText(UUID_A, 'geo')
  expect(text).toMatch(/Roko center frame/)
  expect(text).not.toMatch(/ACTION TIMING/)
})

it('shot-library: buildCopyText 未知模式报错', () => {
  const lib = makeLibrary()
  expect(() => lib.buildCopyText(UUID_A).toThrow('bogus'), /模式/)
})

it('shot-library: buildCopyTexts 合并多个分镜', () => {
  const lib = makeLibrary()
  const text = lib.buildCopyTexts([UUID_A, UUID_B], 'full')
  expect(text).toMatch(/EXT\. CITY STREET/)
  expect(text).toMatch(/Close-up of JAXX hiding/)
})

it('shot-library: resolveRef 未知 token 返回 unknown', () => {
  const lib = makeLibrary()
  const r = lib.resolveRef('ffffffff-0000-4000-8000-000000000000')
  expect(r.kind).toBe('unknown')
})
