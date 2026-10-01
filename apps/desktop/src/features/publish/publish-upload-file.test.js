/**
 * publish-upload-file.test.js — 上传文件 → 路径描述符的单一实现（P2-7 自 Publish.vue 迁出）
 *
 * 迁出属行为保持重构。两条语义必须钉住：
 * ① 优先级：File.path / filePath / file_path（浏览器与旧 Electron 形态）先于 IPC getPathForFile
 *    （Electron 34+ 已移除 File.path，sandbox 里只剩 IPC 这条路，两者缺一即「选了文件但路径为空」）；
 * ② 解析失败返回 null 而非空串——调用方据此出声报错，不得把「解析失败」伪装成「用户清空了封面」。
 */
import { describe, expect, it, vi } from 'vitest'

const { getPathForFile } = vi.hoisted(() => ({ getPathForFile: vi.fn() }))
vi.mock('@/api/electron-bridge', () => ({
  getApi: () => ({ getPathForFile }),
}))

const { normalizeUploadFile, resolveCoverFields, resolveUploadFilePath } = await import('./publish-upload-file')

describe('resolveUploadFilePath', () => {
  it('直接路径优先，命中即不发起 IPC', async () => {
    getPathForFile.mockClear()
    await expect(resolveUploadFilePath({ raw: { path: 'D:/a.png' } })).resolves.toBe('D:/a.png')
    expect(getPathForFile).not.toHaveBeenCalled()
  })

  it.each([['filePath'], ['file_path']])('raw.%s 同样作为直接路径', async (key) => {
    await expect(resolveUploadFilePath({ raw: { [key]: 'D:/b.png' } })).resolves.toBe('D:/b.png')
  })

  it('无直接路径时经 IPC 取路径（Electron sandbox 形态）', async () => {
    getPathForFile.mockReset().mockReturnValue('D:/via-ipc.png')
    const raw = { name: 'x.png' }
    await expect(resolveUploadFilePath({ raw })).resolves.toBe('D:/via-ipc.png')
    expect(getPathForFile).toHaveBeenCalledWith(raw)
  })

  it('IPC 抛错/返回空白一律降级为空串（由调用方报错，本层不抛）', async () => {
    getPathForFile.mockReset().mockImplementation(() => { throw new Error('no path') })
    await expect(resolveUploadFilePath({ raw: { name: 'x.png' } })).resolves.toBe('')
    getPathForFile.mockReset().mockReturnValue('   ')
    await expect(resolveUploadFilePath({ raw: { name: 'x.png' } })).resolves.toBe('')
    getPathForFile.mockReset().mockResolvedValue(undefined)
    await expect(resolveUploadFilePath(null)).resolves.toBe('')
  })
})

describe('normalizeUploadFile', () => {
  it('产出结构化克隆安全的描述符（含 name/type/size）', async () => {
    getPathForFile.mockReset().mockReturnValue('D:/cover.png')
    const descriptor = await normalizeUploadFile({
      raw: { name: 'cover.png', type: 'image/png', size: 1024, lastModified: 1 },
    })
    expect(descriptor).toMatchObject({ path: 'D:/cover.png', name: 'cover.png', type: 'image/png' })
  })

  it('解析不出路径返回 null（不产出 path 为空串的假描述符）', async () => {
    getPathForFile.mockReset().mockReturnValue('')
    await expect(normalizeUploadFile({ raw: { name: 'x.png' } })).resolves.toBeNull()
  })
})

/**
 * resolveCoverFields — 封面三键互斥口径的单一实现（单篇与批量共用）。
 *
 * 主进程取封面是 `cover_url || cover_path`（URL 优先），渲染层算缩略图是
 * `cover_file || cover_path || cover_url`（本地优先）。两层优先级相反即「界面显示刚选的
 * 本地封面、实际发出更早的 URL」，且 DOM RPA 轨会把 URL 塞进 <input type=file>。
 * 因此本实现的合同是：**任何返回值都不得让主进程的取值表达式落到用户没选的那张图上**。
 */
describe('resolveCoverFields', () => {
  // 复刻主进程 publisher-router.buildPublishArticle 的真实取值表达式
  const routerCover = (fields) => fields.cover_url || fields.cover_path || null

  it('本地描述符存在 ⇒ cover_url 让位，主进程取到本地文件', () => {
    const r = resolveCoverFields({
      cover_url: 'https://cdn.example/stale.jpg',
      cover_path: 'D:/covers/picked.png',
      cover_file: { path: 'D:/covers/picked.png', name: 'picked.png' },
    })
    expect(r.cover_url).toBe('')
    expect(r.cover_path).toBe('D:/covers/picked.png')
    expect(routerCover(r)).toBe('D:/covers/picked.png')
  })

  it('只有 URL ⇒ URL 原样保留（不得把既有形状改成「URL 发不出去」）', () => {
    const r = resolveCoverFields({ cover_url: 'https://cdn.example/only.jpg' })
    expect(r.cover_url).toBe('https://cdn.example/only.jpg')
    expect(routerCover(r)).toBe('https://cdn.example/only.jpg')
    // cover_file 镜像 URL 是 normalizePublishFile 的既有形状（迁出前后一致），本实现不改它；
    // 真正的判据是 hasLocalCover 只看**入参**的 cover_file，不看这份派生描述符。
    expect(r.cover_file).toMatchObject({ path: 'https://cdn.example/only.jpg' })
  })

  it('cover_file.path 为空白 ⇒ 不视为本地封面（不得凭空产出空 URL 形状）', () => {
    const r = resolveCoverFields({
      cover_url: 'https://cdn.example/keep.jpg',
      cover_file: { path: '   ' },
    })
    expect(r.cover_url).toBe('https://cdn.example/keep.jpg')
    expect(routerCover(r)).toBe('https://cdn.example/keep.jpg')
  })

  it('无封面 ⇒ 三键皆为空，主进程取值为 null', () => {
    const r = resolveCoverFields({})
    expect(r).toEqual({ cover_url: '', cover_path: '', cover_file: null })
    expect(routerCover(r)).toBeNull()
  })

  it('入参缺席（null/undefined）不得抛错', () => {
    expect(() => resolveCoverFields(null)).not.toThrow()
    expect(resolveCoverFields(undefined).cover_url).toBe('')
  })
})
