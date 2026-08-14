// @vitest-environment node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  Story2VideoBgmLibrary,
  normalizeDisplayName,
  isSafeLibraryId,
  isSafeFileName,
} = require('./story2video-bgm-library')

describe('Story2Video BGM 素材库', () => {
  let root
  let sourceDir
  let library

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-bgm-lib-'))
    sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-bgm-src-'))
    library = new Story2VideoBgmLibrary({
      libraryDir: path.join(root, 'library'),
      now: () => 1000,
      idFactory: () => 'item-00000000000000000001',
    })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(sourceDir, { recursive: true, force: true })
  })

  function makeAudio (name = 'song.mp3', size = 100) {
    const file = path.join(sourceDir, name)
    fs.writeFileSync(file, Buffer.alloc(size))
    return file
  }

  it('空库返回空列表，缺失索引按空库降级', () => {
    expect(library.list()).toEqual([])
  })

  it('添加音乐：复制入库并写索引，默认名取主文件名，无临时文件残留', () => {
    const item = library.add(makeAudio('my song.mp3'))
    expect(item.id).toBeTruthy()
    expect(item.name).toBe('my song')
    expect(path.dirname(item.path)).toBe(library.libraryDir)
    expect(fs.existsSync(item.path)).toBe(true)
    expect(fs.readFileSync(path.join(library.libraryDir, 'library.json'), 'utf8')).toContain('my song')
    expect(fs.readdirSync(library.libraryDir).some(name => name.endsWith('.tmp'))).toBe(false)
    const listed = library.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].path).toBe(item.path)
  })

  it('支持自定义展示名（trim 后生效）', () => {
    const item = library.add(makeAudio('song.mp3'), { name: '  开场音乐  ' })
    expect(item.name).toBe('开场音乐')
  })

  it('拒绝不支持的格式', () => {
    expect(() => library.add(makeAudio('song.flac'))).toThrow(/不支持的媒体格式/)
  })

  it('拒绝超大文件（>15MB）', () => {
    expect(() => library.add(makeAudio('big.mp3', 16 * 1024 * 1024 + 1))).toThrow(/超过大小上限/)
  })

  it('拒绝符号链接源文件', () => {
    const target = path.join(sourceDir, 'real.mp3')
    fs.writeFileSync(target, 'audio')
    const link = path.join(sourceDir, 'link.mp3')
    try { fs.symlinkSync(target, link, 'file') } catch { return }
    expect(() => library.add(link)).toThrow(/类型无效/)
  })

  it('重命名展示名：磁盘文件名与引用路径不变', () => {
    const item = library.add(makeAudio('song.mp3'))
    const renamed = library.rename(item.id, '  新名字  ')
    expect(renamed.name).toBe('新名字')
    expect(renamed.path).toBe(item.path)
    expect(fs.existsSync(item.path)).toBe(true)
    expect(library.list()[0].name).toBe('新名字')
  })

  it('重命名拒绝空名/超长名/不存在 id/非法 id', () => {
    const item = library.add(makeAudio('song.mp3'))
    expect(() => library.rename(item.id, '   ')).toThrow(/1-60/)
    expect(() => library.rename(item.id, 'x'.repeat(61))).toThrow(/1-60/)
    expect(() => library.rename('missing-id-0000000001', 'ok')).toThrow(/不存在/)
    expect(() => library.rename('../evil', 'ok')).toThrow(/条目无效/)
  })

  it('删除：文件与索引一并移除', () => {
    const item = library.add(makeAudio('song.mp3'))
    library.delete(item.id)
    expect(library.list()).toEqual([])
    expect(fs.existsSync(item.path)).toBe(false)
    expect(fs.readFileSync(path.join(library.libraryDir, 'library.json'), 'utf8')).not.toContain(item.id)
  })

  it('删除：文件已缺失时仍清理索引', () => {
    const item = library.add(makeAudio('song.mp3'))
    fs.unlinkSync(item.path)
    expect(() => library.delete(item.id)).not.toThrow()
    expect(library.list()).toEqual([])
  })

  it('删除拒绝不存在条目', () => {
    expect(() => library.delete('missing-id-0000000001')).toThrow(/不存在/)
  })

  it('损坏索引按空库降级', () => {
    fs.mkdirSync(library.libraryDir, { recursive: true })
    fs.writeFileSync(path.join(library.libraryDir, 'library.json'), '{broken')
    expect(library.list()).toEqual([])
  })

  it('索引读取过滤路径穿越条目', () => {
    const real = library.add(makeAudio('song.mp3'))
    const indexPath = path.join(library.libraryDir, 'library.json')
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
    idx.items.push({ id: 'evil-00000000000000000001', name: 'evil', fileName: '../outside.mp3', size: 1, createdAt: 1, updatedAt: 1 })
    fs.writeFileSync(indexPath, JSON.stringify(idx))
    const listed = library.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(real.id)
  })

  it('list 自愈：清理文件已缺失条目', () => {
    const item = library.add(makeAudio('song.mp3'))
    fs.unlinkSync(item.path)
    expect(library.list()).toEqual([])
    const idx = JSON.parse(fs.readFileSync(path.join(library.libraryDir, 'library.json'), 'utf8'))
    expect(idx.items).toHaveLength(0)
  })

  it('多条目：互不覆盖且按添加顺序返回', () => {
    library.idFactory = () => 'item-00000000000000000002'
    const first = library.add(makeAudio('a.mp3'))
    library.idFactory = () => 'item-00000000000000000003'
    const second = library.add(makeAudio('b.wav'))
    expect(library.list().map(item => item.name)).toEqual(['a', 'b'])
    expect(fs.existsSync(first.path)).toBe(true)
    expect(fs.existsSync(second.path)).toBe(true)
  })

  it('normalizeDisplayName / isSafeLibraryId / isSafeFileName 边界', () => {
    expect(normalizeDisplayName('  hi ')).toBe('hi')
    expect(normalizeDisplayName('')).toBe('')
    expect(normalizeDisplayName('x'.repeat(61))).toBe('')
    expect(isSafeLibraryId('uuid-1234-abcd')).toBe(true)
    expect(isSafeLibraryId('../evil')).toBe(false)
    expect(isSafeLibraryId('')).toBe(false)
    expect(isSafeFileName('bgm-abc.mp3')).toBe(true)
    expect(isSafeFileName('../bgm.mp3')).toBe(false)
    expect(isSafeFileName('dir/file.mp3')).toBe(false)
  })
})