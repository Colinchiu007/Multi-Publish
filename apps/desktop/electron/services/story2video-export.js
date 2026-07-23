// @ts-check
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  getAllowedMediaRoots,
  isPathWithin,
  resolveReadableFile,
} = require('./story2video-paths')

const MAX_EXPORT_FILES = 64
const MAX_EXPORT_BYTES = 512 * 1024 * 1024

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[i] = value >>> 0
  }
  return table
})()

function crc32 (data) {
  return (updateCrc32(0xffffffff, data) ^ 0xffffffff) >>> 0
}

function updateCrc32 (crc, data) {
  let value = crc >>> 0
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return value >>> 0
}

function archiveName (value, index) {
  if (typeof value !== 'string' || !value.trim()) return 'video-' + (index + 1) + '.mp4'
  const name = value.trim().replace(/\\/g, '/')
  if (name.startsWith('/') || name.split('/').some(part => part === '..') || name.includes('\0')) {
    throw new Error('归档文件名不允许包含目录穿越')
  }
  const base = path.posix.basename(name)
  if (!base || base !== name || base.length > 160) throw new Error('归档文件名无效')
  return base
}

function writeUInt16 (buffer, offset, value) { buffer.writeUInt16LE(value, offset) }
function writeUInt32 (buffer, offset, value) { buffer.writeUInt32LE(value >>> 0, offset) }

const ZIP_FLAGS = 0x0808 // UTF-8 文件名 + data descriptor

function makeLocalHeader (nameBytes) {
  const header = Buffer.alloc(30 + nameBytes.length)
  writeUInt32(header, 0, 0x04034b50)
  writeUInt16(header, 4, 20)
  writeUInt16(header, 6, ZIP_FLAGS)
  writeUInt16(header, 8, 0)
  writeUInt16(header, 26, nameBytes.length)
  nameBytes.copy(header, 30)
  return header
}

function makeDataDescriptor (checksum, size) {
  const descriptor = Buffer.alloc(16)
  writeUInt32(descriptor, 0, 0x08074b50)
  writeUInt32(descriptor, 4, checksum)
  writeUInt32(descriptor, 8, size)
  writeUInt32(descriptor, 12, size)
  return descriptor
}

function makeCentralHeader (entry) {
  const { nameBytes, checksum, size, offset } = entry
  const header = Buffer.alloc(46 + nameBytes.length)
  writeUInt32(header, 0, 0x02014b50)
  writeUInt16(header, 4, 20)
  writeUInt16(header, 6, 20)
  writeUInt16(header, 8, ZIP_FLAGS)
  writeUInt16(header, 10, 0)
  writeUInt32(header, 16, checksum)
  writeUInt32(header, 20, size)
  writeUInt32(header, 24, size)
  writeUInt16(header, 28, nameBytes.length)
  writeUInt32(header, 42, offset)
  nameBytes.copy(header, 46)
  return header
}

function makeEndRecord (count, centralSize, centralOffset) {
  const record = Buffer.alloc(22)
  writeUInt32(record, 0, 0x06054b50)
  writeUInt16(record, 8, count)
  writeUInt16(record, 10, count)
  writeUInt32(record, 12, centralSize)
  writeUInt32(record, 16, centralOffset)
  return record
}

async function writeAll (handle, data) {
  let written = 0
  while (written < data.length) {
    const result = await handle.write(data, written, data.length - written, null)
    if (!result || result.bytesWritten <= 0) throw new Error('ZIP 写入失败')
    written += result.bytesWritten
  }
}

/** 将本地视频文件以 ZIP STORE 模式安全导出。 */
async function createZipFromFiles (files, destinationPath, options = {}) {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_EXPORT_FILES) {
    throw new Error('导出文件数量必须在 1 到 ' + MAX_EXPORT_FILES + ' 之间')
  }
  if (typeof destinationPath !== 'string' || !path.isAbsolute(destinationPath)) throw new Error('导出目标路径无效')

  const allowedRoots = options.allowedRoots || getAllowedMediaRoots()
  const destination = path.resolve(destinationPath)
  if (!isPathWithin(path.dirname(destination), allowedRoots)) throw new Error('导出目标目录不允许')

  const entries = []
  let totalBytes = 0
  const maxFileBytes = Number.isFinite(Number(options.maxFileBytes))
    ? Number(options.maxFileBytes)
    : MAX_EXPORT_BYTES
  const maxTotalBytes = Number.isFinite(Number(options.maxTotalBytes))
    ? Number(options.maxTotalBytes)
    : MAX_EXPORT_BYTES
  const names = new Set()
  for (let index = 0; index < files.length; index++) {
    const item = files[index]
    const filePath = resolveReadableFile(item && (item.path || item.filePath), {
      allowedRoots,
      maxBytes: maxFileBytes,
    })
    if (!filePath) throw new Error('导出文件路径不允许或文件不可读')
    const stat = await fs.promises.stat(filePath)
    totalBytes += stat.size
    if (totalBytes > maxTotalBytes) {
      throw new Error('导出文件总大小超过上限')
    }
    const name = archiveName(item && item.name, index)
    if (names.has(name)) throw new Error('归档文件名不能重复')
    names.add(name)
    if (path.resolve(filePath) === destination) throw new Error('导出目标不能覆盖源文件')
    entries.push({ name, filePath, size: stat.size })
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = destination + '.tmp-' + process.pid + '-' + Date.now()
  let handle
  try {
    handle = await fs.promises.open(temporary, 'wx')
    const centralEntries = []
    let offset = 0
    for (const entry of entries) {
      const nameBytes = Buffer.from(entry.name, 'utf8')
      const localOffset = offset
      const local = makeLocalHeader(nameBytes)
      await writeAll(handle, local)
      offset += local.length

      let crcState = 0xffffffff
      let streamedSize = 0
      for await (const chunk of fs.createReadStream(entry.filePath, { highWaterMark: 64 * 1024 })) {
        crcState = updateCrc32(crcState, chunk)
        streamedSize += chunk.length
        if (streamedSize > entry.size || streamedSize > maxFileBytes) throw new Error('导出源文件在读取期间发生变化')
        await writeAll(handle, chunk)
        offset += chunk.length
      }
      if (streamedSize !== entry.size) throw new Error('导出源文件在读取期间发生变化')
      const checksum = (crcState ^ 0xffffffff) >>> 0
      const descriptor = makeDataDescriptor(checksum, streamedSize)
      await writeAll(handle, descriptor)
      offset += descriptor.length
      centralEntries.push({ nameBytes, checksum, size: streamedSize, offset: localOffset })
    }

    const centralOffset = offset
    for (const entry of centralEntries) {
      const centralHeader = makeCentralHeader(entry)
      await writeAll(handle, centralHeader)
      offset += centralHeader.length
    }
    const centralSize = offset - centralOffset
    const end = makeEndRecord(centralEntries.length, centralSize, centralOffset)
    await writeAll(handle, end)
    offset += end.length
    await handle.sync()
    await handle.close()
    handle = null
    await fs.promises.rename(temporary, destination)
    return { path: destination, fileCount: entries.length, totalBytes: offset }
  } catch (error) {
    if (handle) {
      try { await handle.close() } catch (_) { /* ignore close error */ }
    }
    try { await fs.promises.unlink(temporary) } catch (_) { /* ignore cleanup error */ }
    throw error
  }
}

function createShareFileUrl (filePath, options = {}) {
  const resolved = resolveReadableFile(filePath, {
    allowedRoots: options.allowedRoots || getAllowedMediaRoots(),
    maxBytes: options.maxBytes || MAX_EXPORT_BYTES,
  })
  if (!resolved) throw new Error('视频文件路径不允许或文件不可读')
  return pathToFileURL(resolved).href
}

module.exports = {
  MAX_EXPORT_FILES,
  MAX_EXPORT_BYTES,
  createZipFromFiles,
  createShareFileUrl,
  archiveName,
  crc32,
}
