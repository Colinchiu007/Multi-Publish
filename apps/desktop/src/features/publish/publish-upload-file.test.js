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

const { normalizeUploadFile, resolveUploadFilePath } = await import('./publish-upload-file')

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
