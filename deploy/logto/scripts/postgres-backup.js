#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const PRIVATE_FILE_MODE = 0o600

function createError(code) {
  return Object.assign(new Error(code), { code })
}

function parseDatabaseUrl(value) {
  let url
  try { url = new URL(String(value || '')) } catch { throw Object.assign(new Error('DATABASE_URL_INVALID'), { code: 'DATABASE_URL_INVALID' }) }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
    throw Object.assign(new Error('DATABASE_URL_INVALID'), { code: 'DATABASE_URL_INVALID' })
  }
  const port = Number(url.port || 5432)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Object.assign(new Error('DATABASE_URL_INVALID'), { code: 'DATABASE_URL_INVALID' })
  let user
  let password
  let database
  try {
    user = decodeURIComponent(url.username || '')
    password = decodeURIComponent(url.password || '')
    database = decodeURIComponent(url.pathname.slice(1))
  } catch {
    throw Object.assign(new Error('DATABASE_URL_INVALID'), { code: 'DATABASE_URL_INVALID' })
  }
  if (!user || !database) throw Object.assign(new Error('DATABASE_URL_INVALID'), { code: 'DATABASE_URL_INVALID' })
  return {
    host: url.hostname,
    port: String(port),
    user,
    password,
    database,
  }
}

function dumpArgs(target) {
  return [
    '--format=custom', '--no-owner',
    '--host', target.host, '--port', target.port,
    '--username', target.user, '--dbname', target.database,
  ]
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function invokeDump(spawn, target, descriptor) {
  const env = { ...process.env }
  if (target.password) env.PGPASSWORD = target.password
  else delete env.PGPASSWORD
  let result
  try {
    result = spawn('pg_dump', dumpArgs(target), {
      shell: false,
      env,
      windowsHide: true,
      stdio: ['ignore', descriptor, 'pipe'],
    })
  } catch {
    throw createError('PG_DUMP_FAILED')
  }
  if (!result || result.error || result.signal || result.status !== 0) throw createError('PG_DUMP_FAILED')
  fs.fchmodSync(descriptor, PRIVATE_FILE_MODE)
  fs.fsyncSync(descriptor)
}

function acquireBackupLock(outputDirectory) {
  const lockFile = path.join(outputDirectory, '.backup.lock')
  const token = crypto.randomUUID()
  let descriptor
  let identity
  try {
    descriptor = fs.openSync(
      lockFile,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL,
      PRIVATE_FILE_MODE,
    )
    const descriptorStat = fs.fstatSync(descriptor)
    const pathStat = fs.lstatSync(lockFile)
    if (
      !descriptorStat.isFile() ||
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.dev !== descriptorStat.dev ||
      pathStat.ino !== descriptorStat.ino
    ) {
      throw createError('BACKUP_LOCK_FAILED')
    }
    identity = { device: descriptorStat.dev, inode: descriptorStat.ino }
    writeDescriptor(descriptor, `${JSON.stringify({ version: 1, status: 'in-progress', pid: process.pid, token })}\n`)
    return { file: lockFile, descriptor, token, device: identity.device, inode: identity.inode }
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor) } catch {}
    if (identity) {
      try {
        const stat = fs.lstatSync(lockFile)
        if (!stat.isSymbolicLink() && stat.dev === identity.device && stat.ino === identity.inode) fs.unlinkSync(lockFile)
      } catch {}
    }
    if (error && error.code === 'EEXIST') throw createError('BACKUP_IN_PROGRESS')
    throw createError('BACKUP_LOCK_FAILED')
  }
}

function assertBackupLock(lock) {
  try {
    const descriptorStat = fs.fstatSync(lock.descriptor)
    const pathStat = fs.lstatSync(lock.file)
    if (
      !descriptorStat.isFile() ||
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      descriptorStat.dev !== lock.device ||
      descriptorStat.ino !== lock.inode ||
      pathStat.dev !== descriptorStat.dev ||
      pathStat.ino !== descriptorStat.ino
    ) {
      throw createError('BACKUP_LOCK_LOST')
    }
  } catch (error) {
    if (error && error.code === 'BACKUP_LOCK_LOST') throw error
    throw createError('BACKUP_LOCK_LOST')
  }
}

function releaseBackupLock(lock) {
  assertBackupLock(lock)
  fs.unlinkSync(lock.file)
  fs.closeSync(lock.descriptor)
  lock.descriptor = undefined
}

function closeBackupLock(lock) {
  if (lock && lock.descriptor !== undefined) {
    try { fs.closeSync(lock.descriptor) } catch {}
    lock.descriptor = undefined
  }
}

function createPrivateFile(createdFiles, file) {
  let descriptor
  try {
    descriptor = fs.openSync(
      file,
      fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL,
      PRIVATE_FILE_MODE,
    )
    const descriptorStat = fs.fstatSync(descriptor)
    const pathStat = fs.lstatSync(file)
    if (
      !descriptorStat.isFile() ||
      !pathStat.isFile() ||
      pathStat.isSymbolicLink() ||
      pathStat.dev !== descriptorStat.dev ||
      pathStat.ino !== descriptorStat.ino
    ) {
      throw createError('BACKUP_OUTPUT_REPLACED')
    }
    createdFiles.set(file, { device: descriptorStat.dev, inode: descriptorStat.ino })
    fs.fchmodSync(descriptor, PRIVATE_FILE_MODE)
    return descriptor
  } catch (error) {
    if (descriptor !== undefined) try { fs.closeSync(descriptor) } catch {}
    if (error && error.code === 'EEXIST') throw createError('BACKUP_OUTPUT_NOT_EMPTY')
    throw createError('BACKUP_OUTPUT_REPLACED')
  }
}

function assertDescriptorOwnsPath(createdFiles, file, descriptor) {
  const expected = createdFiles.get(file)
  const descriptorStat = fs.fstatSync(descriptor)
  const pathStat = fs.lstatSync(file)
  if (
    !expected ||
    !descriptorStat.isFile() ||
    !pathStat.isFile() ||
    pathStat.isSymbolicLink() ||
    descriptorStat.dev !== expected.device ||
    descriptorStat.ino !== expected.inode ||
    pathStat.dev !== descriptorStat.dev ||
    pathStat.ino !== descriptorStat.ino
  ) {
    throw createError('BACKUP_OUTPUT_REPLACED')
  }
  return descriptorStat
}

function hashDescriptor(descriptor) {
  let bytes = 0
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  while (true) {
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, bytes)
    if (bytesRead === 0) break
    hash.update(buffer.subarray(0, bytesRead))
    bytes += bytesRead
  }
  return { bytes, sha256: hash.digest('hex') }
}

function publishFileExclusive(createdFiles, source, descriptor, destination) {
  const descriptorStat = assertDescriptorOwnsPath(createdFiles, source, descriptor)
  try {
    fs.linkSync(source, destination)
  } catch (error) {
    if (error && error.code === 'EEXIST') throw createError('BACKUP_OUTPUT_NOT_EMPTY')
    if (error && ['EPERM', 'ENOTSUP', 'EXDEV', 'EOPNOTSUPP'].includes(error.code)) {
      throw createError('BACKUP_ATOMIC_PUBLISH_UNSUPPORTED')
    }
    throw error
  }
  const destinationStat = fs.lstatSync(destination)
  if (
    destinationStat.isSymbolicLink() ||
    !destinationStat.isFile() ||
    destinationStat.dev !== descriptorStat.dev ||
    destinationStat.ino !== descriptorStat.ino
  ) {
    throw createError('BACKUP_OUTPUT_REPLACED')
  }
  const identity = { device: destinationStat.dev, inode: destinationStat.ino }
  createdFiles.set(destination, identity)
  return identity
}

function assertCreatedFile(createdFiles, file) {
  const expected = createdFiles.get(file)
  if (!expected) throw createError('BACKUP_OUTPUT_REPLACED')
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== expected.device || stat.ino !== expected.inode) {
    throw createError('BACKUP_OUTPUT_REPLACED')
  }
}

function writeDescriptor(descriptor, content) {
  const buffer = Buffer.from(content)
  let written = 0
  while (written < buffer.length) {
    const bytesWritten = fs.writeSync(descriptor, buffer, written, buffer.length - written, written)
    if (bytesWritten <= 0) throw createError('BACKUP_WRITE_FAILED')
    written += bytesWritten
  }
  fs.fchmodSync(descriptor, PRIVATE_FILE_MODE)
  fs.fsyncSync(descriptor)
}

function syncDirectory(directory) {
  if (process.platform === 'win32') return
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY)
  try {
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
}

function prepareOutputDirectory(outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
  const stat = fs.lstatSync(outputDirectory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw createError('BACKUP_DIRECTORY_INVALID')
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw createError('BACKUP_DIRECTORY_PERMISSIONS_UNSAFE')
  }
}

function forgetCreatedFile(createdFiles, file) {
  const expected = createdFiles.get(file)
  if (!expected) return
  const stat = fs.lstatSync(file)
  if (stat.isSymbolicLink() || stat.dev !== expected.device || stat.ino !== expected.inode) throw createError('BACKUP_OUTPUT_REPLACED')
  fs.unlinkSync(file)
  createdFiles.delete(file)
}

function parseArgs(argv = process.argv.slice(2)) {
  return { confirmWritesPaused: argv.includes('--confirm-writes-paused') }
}

async function backupDatabases(options = {}) {
  if (options.consistencyConfirmed !== true) {
    throw Object.assign(new Error('BACKUP_WRITES_NOT_QUIESCED'), { code: 'BACKUP_WRITES_NOT_QUIESCED' })
  }
  const logto = parseDatabaseUrl(options.logtoUrl)
  const business = parseDatabaseUrl(options.businessUrl)
  const outputDirectory = path.resolve(options.outputDirectory || path.resolve(process.cwd(), 'backups'))
  prepareOutputDirectory(outputDirectory)
  const lock = acquireBackupLock(outputDirectory)
  const spawn = options.spawn || spawnSync
  const entries = [
    { name: 'logto', target: logto, file: 'logto.dump' },
    { name: 'business', target: business, file: 'business.dump' },
  ]
  const snapshotToken = crypto.randomUUID()
  const temporaryFiles = entries.map((entry) => path.join(outputDirectory, `.${entry.file}.${snapshotToken}.partial`))
  const finalFiles = entries.map((entry) => path.join(outputDirectory, entry.file))
  const manifestFile = path.join(outputDirectory, 'manifest.json')
  const manifestTemp = path.join(outputDirectory, `.manifest.json.${snapshotToken}.partial`)
  const createdFiles = new Map()
  const sourceDescriptors = []
  let lockReleased = false
  let manifestCommitted = false
  try {
    if (fs.readdirSync(outputDirectory).some((name) => name !== path.basename(lock.file))) {
      throw createError('BACKUP_OUTPUT_NOT_EMPTY')
    }
    for (const [index, entry] of entries.entries()) {
      const file = temporaryFiles[index]
      sourceDescriptors[index] = createPrivateFile(createdFiles, file)
      invokeDump(spawn, entry.target, sourceDescriptors[index])
      assertBackupLock(lock)
      assertDescriptorOwnsPath(createdFiles, file, sourceDescriptors[index])
    }
    const databases = []
    for (const [index] of entries.entries()) {
      assertBackupLock(lock)
      const digest = hashDescriptor(sourceDescriptors[index])
      publishFileExclusive(createdFiles, temporaryFiles[index], sourceDescriptors[index], finalFiles[index])
      databases.push({ name: entries[index].name, file: entries[index].file, bytes: digest.bytes, sha256: digest.sha256 })
      forgetCreatedFile(createdFiles, temporaryFiles[index])
      fs.closeSync(sourceDescriptors[index])
      sourceDescriptors[index] = undefined
    }
    syncDirectory(outputDirectory)
    const manifest = {
      version: 1,
      createdAt: typeof options.now === 'function' ? options.now() : new Date().toISOString(),
      consistency: { mode: 'quiesced', writesPaused: true },
      databases,
    }
    const manifestDescriptor = createPrivateFile(createdFiles, manifestTemp)
    sourceDescriptors.push(manifestDescriptor)
    writeDescriptor(manifestDescriptor, `${JSON.stringify(manifest, null, 2)}\n`)
    assertBackupLock(lock)
    for (const file of finalFiles) assertCreatedFile(createdFiles, file)
    publishFileExclusive(createdFiles, manifestTemp, manifestDescriptor, manifestFile)
    for (const file of [...finalFiles, manifestFile]) assertCreatedFile(createdFiles, file)
    syncDirectory(outputDirectory)
    releaseBackupLock(lock)
    lockReleased = true
    manifestCommitted = true
    try { forgetCreatedFile(createdFiles, manifestTemp) } catch {}
    try { syncDirectory(outputDirectory) } catch {}
    try { fs.closeSync(manifestDescriptor) } catch {}
    sourceDescriptors[sourceDescriptors.length - 1] = undefined
    return { outputDirectory, manifest }
  } catch (error) {
    if (!manifestCommitted) {
      for (const file of createdFiles.keys()) {
        try { forgetCreatedFile(createdFiles, file) } catch {}
      }
    }
    throw error
  } finally {
    for (const descriptor of sourceDescriptors) {
      if (descriptor !== undefined) try { fs.closeSync(descriptor) } catch {}
    }
    if (!lockReleased) {
      try { releaseBackupLock(lock) } catch {}
    }
    closeBackupLock(lock)
  }
}

async function main(options = {}) {
  try {
    await backupDatabases({
      logtoUrl: options.logtoUrl || process.env.LOGTO_DATABASE_URL,
      businessUrl: options.businessUrl || process.env.BUSINESS_DATABASE_URL,
      outputDirectory: options.outputDirectory || process.env.BACKUP_OUTPUT_DIRECTORY,
      consistencyConfirmed: options.confirmWritesPaused === true,
      spawn: options.spawn,
    })
    return 0
  } catch (error) {
    console.error(error && error.code ? error.code : 'BACKUP_FAILED')
    return error && error.code === 'BACKUP_WRITES_NOT_QUIESCED' ? 2 : 1
  }
}

if (require.main === module) main(parseArgs()).then((code) => { process.exitCode = code })

module.exports = { backupDatabases, dumpArgs, main, parseArgs, parseDatabaseUrl, sha256File }
