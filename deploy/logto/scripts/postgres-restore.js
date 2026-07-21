#!/usr/bin/env node
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { parseDatabaseUrl } = require('./postgres-backup')

const PRIVATE_FILE_MODE = 0o600

function createError(code) {
  return Object.assign(new Error(code), { code })
}

function openRegularFile(file, errorCode) {
  let descriptor
  try {
    const linkStat = fs.lstatSync(file)
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) throw createError(errorCode)
    const noFollow = fs.constants.O_NOFOLLOW || 0
    try {
      descriptor = fs.openSync(file, fs.constants.O_RDONLY | noFollow)
    } catch (error) {
      if (noFollow && ['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(error && error.code)) descriptor = fs.openSync(file, fs.constants.O_RDONLY)
      else throw error
    }
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.dev !== linkStat.dev || stat.ino !== linkStat.ino) throw createError(errorCode)
    return { descriptor, stat }
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    if (error && error.code === errorCode) throw error
    throw createError(errorCode)
  }
}

function hashDescriptor(descriptor) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  let position = 0
  while (true) {
    const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, position)
    if (bytes === 0) break
    hash.update(buffer.subarray(0, bytes))
    position += bytes
  }
  return { bytes: position, sha256: hash.digest('hex') }
}

function verifyManifest(manifestPath, outputDirectory) {
  try {
    try {
      fs.lstatSync(path.join(path.resolve(outputDirectory), '.backup.lock'))
      return { valid: false, errors: ['BACKUP_IN_PROGRESS'] }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') return { valid: false, errors: ['BACKUP_IN_PROGRESS'] }
    }
    const manifestFile = openRegularFile(manifestPath, 'MANIFEST_NOT_REGULAR')
    let manifestBytes
    try { manifestBytes = fs.readFileSync(manifestFile.descriptor) } finally { fs.closeSync(manifestFile.descriptor) }
    const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex')
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    if (manifest.version !== 1 || !Array.isArray(manifest.databases)) return { valid: false, errors: ['MANIFEST_INVALID'] }
    const errors = []
    const names = manifest.databases.map((entry) => entry && entry.name).sort()
    if (manifest.databases.length !== 2 || names[0] !== 'business' || names[1] !== 'logto') {
      return { valid: false, errors: ['MANIFEST_DATABASE_SET_INVALID'], manifest }
    }
    if (!manifest.consistency || manifest.consistency.mode !== 'quiesced' || manifest.consistency.writesPaused !== true) {
      return { valid: false, errors: ['MANIFEST_CONSISTENCY_UNCONFIRMED'], manifest }
    }
    for (const entry of manifest.databases) {
      if (!entry || !['logto', 'business'].includes(entry.name) || typeof entry.file !== 'string' || entry.file !== `${entry.name}.dump` || path.basename(entry.file) !== entry.file || !Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) {
        errors.push('MANIFEST_FILE_INVALID')
        continue
      }
      const file = path.join(path.resolve(outputDirectory), entry.file)
      if (!fs.existsSync(file)) { errors.push('BACKUP_FILE_MISSING'); continue }
      let backupFile
      try {
        backupFile = openRegularFile(file, 'BACKUP_FILE_NOT_REGULAR')
        const digest = hashDescriptor(backupFile.descriptor)
        const finalStat = fs.fstatSync(backupFile.descriptor)
        if (digest.bytes !== entry.bytes || finalStat.size !== entry.bytes || digest.sha256 !== entry.sha256) errors.push('BACKUP_CHECKSUM_MISMATCH')
      } catch (error) {
        errors.push(error && error.code ? error.code : 'BACKUP_FILE_NOT_REGULAR')
      } finally {
        if (backupFile) {
          try { fs.closeSync(backupFile.descriptor) } catch {}
        }
      }
    }
    return { valid: errors.length === 0, errors, manifest, manifestSha256 }
  } catch {
    return { valid: false, errors: ['MANIFEST_INVALID'] }
  }
}

function restoreArgs(target) {
  return [
    '--exit-on-error', '--single-transaction', '--no-owner',
    '--host', target.host, '--port', target.port,
    '--username', target.user, '--dbname', target.database,
  ]
}

const TARGET_EMPTY_QUERY = "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) THEN 'not_empty' ELSE 'empty' END;"

function databaseEnv(target) {
  const env = { ...process.env }
  if (target.password) env.PGPASSWORD = target.password
  else delete env.PGPASSWORD
  return env
}

function psqlArgs(target) {
  return [
    '--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
    '--command', TARGET_EMPTY_QUERY,
    '--host', target.host, '--port', target.port,
    '--username', target.user, '--dbname', target.database,
  ]
}

function openVerifiedDump(entry, outputDirectory) {
  const file = path.join(path.resolve(outputDirectory), entry.file)
  const backupFile = openRegularFile(file, 'BACKUP_FILE_NOT_REGULAR')
  try {
    const digest = hashDescriptor(backupFile.descriptor)
    const finalStat = fs.fstatSync(backupFile.descriptor)
    if (digest.bytes !== entry.bytes || finalStat.size !== entry.bytes || digest.sha256 !== entry.sha256) throw createError('BACKUP_CHECKSUM_MISMATCH')
    return backupFile.descriptor
  } catch (error) {
    try { fs.closeSync(backupFile.descriptor) } catch {}
    throw error
  }
}

function isSameOrChildPath(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function validateStatePath(value, outputDirectory) {
  if (typeof value !== 'string' || value.trim() === '') return { valid: false, code: 'RESTORE_STATE_FILE_REQUIRED' }
  const stateFile = path.resolve(value)
  try {
    const backupDirectory = fs.realpathSync(path.resolve(outputDirectory))
    const stateDirectory = fs.realpathSync(path.dirname(stateFile))
    const resolvedStateFile = path.join(stateDirectory, path.basename(stateFile))
    if (isSameOrChildPath(backupDirectory, resolvedStateFile)) return { valid: false, code: 'RESTORE_STATE_PATH_INVALID' }
    return { valid: true, stateFile: resolvedStateFile }
  } catch {
    return { valid: false, code: 'RESTORE_STATE_DIRECTORY_INVALID' }
  }
}

function writePrivateJson(file, value, flag = 'wx') {
  let descriptor
  let identity
  let failure
  try {
    descriptor = fs.openSync(file, flag, PRIVATE_FILE_MODE)
    const stat = fs.fstatSync(descriptor)
    identity = { device: stat.dev, inode: stat.ino }
    fs.fchmodSync(descriptor, PRIVATE_FILE_MODE)
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    fs.fsyncSync(descriptor)
  } catch (error) {
    failure = error
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
  if (failure) {
    if (identity) {
      try { unlinkOwnedFile(file, identity) } catch {}
    }
    throw failure
  }
  return identity
}

function syncDirectory(directory) {
  if (process.platform === 'win32') return
  const descriptor = fs.openSync(directory, 'r')
  try {
    fs.fsyncSync(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
}

function publishJsonAtomically(file, value, syncDirectoryFn = syncDirectory) {
  const temporaryFile = `${file}.${process.pid}.${crypto.randomUUID()}.partial`
  let temporaryIdentity
  let publishedIdentity
  try {
    temporaryIdentity = writePrivateJson(temporaryFile, value)
    try {
      fs.linkSync(temporaryFile, file)
      const published = fileIdentity(file)
      if (published.device !== temporaryIdentity.device || published.inode !== temporaryIdentity.inode) throw createError('RESTORE_STATE_WRITE_FAILED')
      publishedIdentity = published
    } catch (error) {
      if (!error || !['EPERM', 'ENOTSUP', 'EXDEV', 'EOPNOTSUPP'].includes(error.code)) throw error
      fs.copyFileSync(temporaryFile, file, fs.constants.COPYFILE_EXCL)
      publishedIdentity = fileIdentity(file)
    }
    syncDirectoryFn(path.dirname(file))
    return publishedIdentity
  } catch (error) {
    if (publishedIdentity) {
      try { unlinkOwnedFile(file, publishedIdentity) } catch {}
      try { syncDirectoryFn(path.dirname(file)) } catch {}
    }
    throw error
  } finally {
    if (temporaryIdentity) {
      try { unlinkOwnedFile(temporaryFile, temporaryIdentity) } catch {}
    }
  }
}

function fileIdentity(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink()) throw createError('RESTORE_STATE_LOCK_LOST')
  return { device: stat.dev, inode: stat.ino }
}

function unlinkOwnedFile(file, identity) {
  const current = fileIdentity(file)
  if (current.device !== identity.device || current.inode !== identity.inode) throw createError('RESTORE_STATE_LOCK_LOST')
  fs.unlinkSync(file)
}

function verifyCompletedState(stateFile, outputDirectory, verification) {
  const statePath = validateStatePath(stateFile, outputDirectory)
  if (!statePath.valid) return { valid: false, code: statePath.code }
  const completeFile = statePath.stateFile
  if ([`${completeFile}.in-progress`, `${completeFile}.failed`].some((file) => fs.existsSync(file))) {
    return { valid: false, code: 'RESTORE_STATE_CONFLICT' }
  }
  try {
    const stateHandle = openRegularFile(completeFile, 'RESTORE_STATE_INVALID')
    let state
    try { state = JSON.parse(fs.readFileSync(stateHandle.descriptor, 'utf8')) } finally { fs.closeSync(stateHandle.descriptor) }
    const restored = Array.isArray(state.restoredDatabases) ? [...state.restoredDatabases].sort() : []
    const targets = state.targetDatabases
    if (
      state.version !== 1 ||
      state.status !== 'complete' ||
      state.manifestSha256 !== verification.manifestSha256 ||
      restored.length !== 2 || restored[0] !== 'business' || restored[1] !== 'logto' ||
      !targets || typeof targets.logto !== 'string' || targets.logto === '' ||
      typeof targets.business !== 'string' || targets.business === '' || targets.logto === targets.business
    ) {
      return { valid: false, code: 'RESTORE_STATE_INVALID' }
    }
    return { valid: true, state }
  } catch (error) {
    return { valid: false, code: error && error.code ? error.code : 'RESTORE_STATE_INVALID' }
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const valueAfter = (name) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    verifyOnly: argv.includes('--verify-only'),
    verifyState: argv.includes('--verify-state'),
    manifestPath: valueAfter('--manifest'),
    outputDirectory: valueAfter('--output-directory'),
    confirmLogtoDatabase: valueAfter('--confirm-logto-database'),
    confirmBusinessDatabase: valueAfter('--confirm-business-database'),
    stateFile: valueAfter('--state-file'),
  }
}

async function main(options = {}) {
  const manifestPath = path.resolve(options.manifestPath || process.env.BACKUP_MANIFEST || '')
  const outputDirectory = path.resolve(options.outputDirectory || path.dirname(manifestPath))
  const verification = verifyManifest(manifestPath, outputDirectory)
  if (!verification.valid) {
    console.error(verification.errors[0] || 'BACKUP_INVALID')
    return 1
  }
  if (options.verifyOnly === true && options.verifyState === true) {
    console.error('RESTORE_VERIFY_MODES_CONFLICT')
    return 2
  }
  if (options.verifyState === true) {
    const stateVerification = verifyCompletedState(options.stateFile, outputDirectory, verification)
    if (!stateVerification.valid) {
      console.error(stateVerification.code)
      return 1
    }
    return 0
  }
  if (options.verifyOnly === true) return 0
  if (typeof options.confirmLogtoDatabase !== 'string' || typeof options.confirmBusinessDatabase !== 'string') {
    console.error('RESTORE_DATABASE_CONFIRMATION_REQUIRED')
    return 2
  }
  let targets
  try {
    targets = {
      logto: parseDatabaseUrl(options.logtoUrl || process.env.LOGTO_DATABASE_URL),
      business: parseDatabaseUrl(options.businessUrl || process.env.BUSINESS_DATABASE_URL),
    }
  } catch (error) {
    console.error(error && error.code ? error.code : 'RESTORE_DATABASE_URL_INVALID')
    return 1
  }
  if (targets.logto.database !== options.confirmLogtoDatabase || targets.business.database !== options.confirmBusinessDatabase) {
    console.error('RESTORE_DATABASE_CONFIRMATION_MISMATCH')
    return 2
  }
  if (`${targets.logto.host}:${targets.logto.port}/${targets.logto.database}` === `${targets.business.host}:${targets.business.port}/${targets.business.database}`) {
    console.error('RESTORE_DATABASE_TARGETS_MUST_DIFFER')
    return 2
  }
  const statePath = validateStatePath(options.stateFile, outputDirectory)
  if (!statePath.valid) {
    console.error(statePath.code)
    return 2
  }
  const stateFile = statePath.stateFile
  const inProgressFile = `${stateFile}.in-progress`
  const failedFile = `${stateFile}.failed`
  if ([stateFile, inProgressFile, failedFile].some((file) => fs.existsSync(file))) {
    console.error('RESTORE_STATE_CONFLICT')
    return 2
  }

  const now = () => (typeof options.now === 'function' ? options.now() : new Date().toISOString())
  const syncStateDirectory = typeof options.syncDirectory === 'function' ? options.syncDirectory : syncDirectory
  const restoredDatabases = []
  const baseState = {
    version: 1,
    manifestSha256: verification.manifestSha256,
    targetDatabases: {
      logto: targets.logto.database,
      business: targets.business.database,
    },
    restoredDatabases,
    startedAt: now(),
  }
  let inProgressIdentity
  try {
    inProgressIdentity = writePrivateJson(inProgressFile, { ...baseState, status: 'in-progress', updatedAt: now() })
    syncStateDirectory(path.dirname(inProgressFile))
  } catch (error) {
    if (inProgressIdentity) {
      try { unlinkOwnedFile(inProgressFile, inProgressIdentity) } catch {}
      try { syncStateDirectory(path.dirname(inProgressFile)) } catch {}
    }
    console.error(error && error.code === 'EEXIST' ? 'RESTORE_STATE_CONFLICT' : 'RESTORE_STATE_WRITE_FAILED')
    return error && error.code === 'EEXIST' ? 2 : 1
  }

  const failRestore = (errorCode) => {
    try {
      publishJsonAtomically(failedFile, {
        ...baseState,
        status: 'failed',
        restoredDatabases: [...restoredDatabases],
        errorCode,
        failedAt: now(),
      }, syncStateDirectory)
      unlinkOwnedFile(inProgressFile, inProgressIdentity)
      syncStateDirectory(path.dirname(inProgressFile))
    } catch {
      console.error('RESTORE_STATE_WRITE_FAILED')
      return 1
    }
    console.error(errorCode)
    return 1
  }

  const spawn = options.spawn || spawnSync
  const entries = ['logto', 'business'].map((name) => verification.manifest.databases.find((entry) => entry.name === name))

  for (const entry of entries) {
    const target = targets[entry.name]
    let result
    try {
      result = spawn('psql', psqlArgs(target), {
        shell: false,
        env: databaseEnv(target),
        windowsHide: true,
        encoding: 'utf8',
      })
    } catch {
      return failRestore('RESTORE_TARGET_CHECK_FAILED')
    }
    if (!result || result.error || result.signal || result.status !== 0) return failRestore('RESTORE_TARGET_CHECK_FAILED')
    const output = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : String(result.stdout || '')
    if (output.trim() !== 'empty') return failRestore('RESTORE_TARGET_NOT_EMPTY')
  }

  for (const entry of entries) {
    const target = targets[entry.name]
    if (!target) return failRestore('RESTORE_TARGET_INVALID')
    let dumpDescriptor
    let result
    try {
      dumpDescriptor = openVerifiedDump(entry, outputDirectory)
      result = spawn('pg_restore', restoreArgs(target), {
        shell: false,
        env: databaseEnv(target),
        windowsHide: true,
        stdio: [dumpDescriptor, 'pipe', 'pipe'],
      })
    } catch {
      return failRestore('PG_RESTORE_FAILED')
    } finally {
      if (dumpDescriptor !== undefined) {
        try { fs.closeSync(dumpDescriptor) } catch {}
      }
    }
    if (!result || result.error || result.signal || result.status !== 0) return failRestore('PG_RESTORE_FAILED')
    restoredDatabases.push(entry.name)
  }

  let completionPublished = false
  let completionIdentity
  try {
    completionIdentity = publishJsonAtomically(stateFile, {
      ...baseState,
      status: 'complete',
      restoredDatabases: [...restoredDatabases],
      completedAt: now(),
    }, syncStateDirectory)
    completionPublished = true
    unlinkOwnedFile(inProgressFile, inProgressIdentity)
    syncStateDirectory(path.dirname(inProgressFile))
  } catch {
    try { if (completionPublished && fs.existsSync(stateFile)) unlinkOwnedFile(stateFile, completionIdentity) } catch {}
    return failRestore('RESTORE_STATE_WRITE_FAILED')
  }
  return 0
}

if (require.main === module) {
  main(parseArgs()).then((code) => { process.exitCode = code })
}

module.exports = { main, parseArgs, restoreArgs, verifyCompletedState, verifyManifest }
