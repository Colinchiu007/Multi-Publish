const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const test = require('node:test')

function tempDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-backup-')) }

function writeDump(options, content) {
  assert(Array.isArray(options.stdio))
  assert(Number.isInteger(options.stdio[1]))
  const buffer = Buffer.from(content)
  assert.strictEqual(fs.writeSync(options.stdio[1], buffer, 0, buffer.length, 0), buffer.length)
}

function dumpDatabase(args) { return args[args.indexOf('--dbname') + 1] }

function findTemporaryDump(directory, name) {
  const file = fs.readdirSync(directory).find((entry) => entry.startsWith(`.${name}.dump.`) && entry.endsWith('.partial'))
  assert(file, `缺少 ${name} 临时 dump`)
  return path.join(directory, file)
}

test('生产备份与恢复校验', async (t) => {
  const backup = require(path.resolve(__dirname, '../../../deploy/logto/scripts/postgres-backup'))
  const restore = require(path.resolve(__dirname, '../../../deploy/logto/scripts/postgres-restore'))

  await t.test('双库备份必须显式确认写入已暂停', async () => {
    const directory = tempDirectory()
    let dumpCalled = false
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:secret@db.example.com/logto',
      businessUrl: 'postgresql://app:secret2@db.example.com/multi_publish',
      outputDirectory: directory,
      spawn: () => { dumpCalled = true; return { status: 0 } },
    }), (error) => error && error.code === 'BACKUP_WRITES_NOT_QUIESCED')
    assert.strictEqual(dumpCalled, false)
    assert.deepStrictEqual(backup.parseArgs(['--confirm-writes-paused']), { confirmWritesPaused: true })
  })

  await t.test('分别 dump Logto 与业务库并生成不含密码的 manifest', async () => {
    const directory = tempDirectory()
    const commands = []
    const spawn = (command, args, options) => {
      commands.push({ command, args, options })
      writeDump(options, `dump:${dumpDatabase(args)}`)
      return { status: 0 }
    }
    const result = await backup.backupDatabases({
      logtoUrl: 'postgresql://logto:secret@db.example.com/logto',
      businessUrl: 'postgresql://app:secret2@db.example.com/multi_publish',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn,
      now: () => '2026-07-21T00:00:00.000Z',
    })

    assert.strictEqual(result.manifest.databases.length, 2)
    assert.deepStrictEqual(result.manifest.consistency, { mode: 'quiesced', writesPaused: true })
    assert.strictEqual(JSON.stringify(result.manifest).includes('secret'), false)
    assert.deepStrictEqual(commands.map((entry) => entry.command), ['pg_dump', 'pg_dump'])
    assert(commands.every((entry) => entry.options.shell === false))
    assert(commands.every((entry) => !entry.args.includes('--file')))
    assert(commands.every((entry) => Number.isInteger(entry.options.stdio[1])))
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), true)
    assert.strictEqual(fs.existsSync(path.join(directory, '.backup.lock')), false)
    assert.deepStrictEqual(fs.readdirSync(directory).sort(), ['business.dump', 'logto.dump', 'manifest.json'])
    for (const entry of result.manifest.databases) {
      const file = path.join(directory, entry.file)
      const expected = `dump:${entry.name === 'logto' ? 'logto' : 'multi_publish'}`
      assert.strictEqual(fs.readFileSync(file, 'utf8'), expected)
      assert.strictEqual(entry.bytes, Buffer.byteLength(expected))
      assert.strictEqual(entry.sha256, crypto.createHash('sha256').update(expected).digest('hex'))
    }
    if (process.platform !== 'win32') {
      for (const name of ['logto.dump', 'business.dump', 'manifest.json']) {
        assert.strictEqual(fs.statSync(path.join(directory, name)).mode & 0o077, 0)
      }
    }
  })

  await t.test('三个备份工件均在锁持有期间通过硬链接原子发布', async () => {
    const directory = tempDirectory()
    const originalLink = fs.linkSync
    const published = []
    try {
      fs.linkSync = (source, destination) => {
        assert.strictEqual(fs.existsSync(path.join(directory, '.backup.lock')), true)
        originalLink(source, destination)
        const sourceStat = fs.lstatSync(source)
        const destinationStat = fs.lstatSync(destination)
        assert.strictEqual(destinationStat.dev, sourceStat.dev)
        assert.strictEqual(destinationStat.ino, sourceStat.ino)
        published.push(path.basename(destination))
      }
      await backup.backupDatabases({
        logtoUrl: 'postgresql://logto:secret@db.example.com/logto',
        businessUrl: 'postgresql://app:secret2@db.example.com/multi_publish',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          return { status: 0 }
        },
      })
    } finally {
      fs.linkSync = originalLink
    }

    assert.deepStrictEqual(published, ['logto.dump', 'business.dump', 'manifest.json'])
    assert.strictEqual(fs.existsSync(path.join(directory, '.backup.lock')), false)

    const lockFile = path.join(directory, '.backup.lock')
    fs.writeFileSync(lockFile, '未完成备份')
    assert.deepStrictEqual(
      restore.verifyManifest(path.join(directory, 'manifest.json'), directory).errors,
      ['BACKUP_IN_PROGRESS'],
    )
    fs.unlinkSync(lockFile)
  })

  await t.test('manifest 校验发现篡改，恢复未确认时拒绝执行', async () => {
    const directory = tempDirectory()
    const file = path.join(directory, 'business.dump')
    fs.writeFileSync(file, 'original')
    const manifest = {
      version: 1,
      databases: [{ name: 'business', file: 'business.dump', sha256: 'wrong', bytes: 8 }],
    }
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    const verification = restore.verifyManifest(manifestPath, directory)
    assert.strictEqual(verification.valid, false)
    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto_restore',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business_restore',
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: () => { throw new Error('不应 restore') },
    }), 1)
  })

  await t.test('manifest 必须且只能包含唯一的 Logto 与业务备份', () => {
    const directory = tempDirectory()
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, databases: [] }))
    assert.deepStrictEqual(restore.verifyManifest(manifestPath, directory).errors, ['MANIFEST_DATABASE_SET_INVALID'])

    fs.writeFileSync(path.join(directory, 'logto.dump'), 'dump')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      databases: [
        { name: 'logto', file: 'logto.dump', sha256: backup.sha256File(path.join(directory, 'logto.dump')), bytes: 4 },
        { name: 'logto', file: 'logto.dump', sha256: backup.sha256File(path.join(directory, 'logto.dump')), bytes: 4 },
      ],
    }))
    assert.deepStrictEqual(restore.verifyManifest(manifestPath, directory).errors, ['MANIFEST_DATABASE_SET_INVALID'])

    fs.writeFileSync(path.join(directory, 'business.dump'), 'dump')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
        bytes: 4,
      })),
    }))
    assert.deepStrictEqual(restore.verifyManifest(manifestPath, directory).errors, ['MANIFEST_CONSISTENCY_UNCONFIRMED'])
  })

  await t.test('dump 失败不发布 manifest，也不保留临时文件或覆盖旧备份', async () => {
    const directory = tempDirectory()
    const spawn = (command, args, options) => {
      writeDump(options, 'partial')
      return { status: 1 }
    }
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn,
    }), (error) => error.code === 'PG_DUMP_FAILED')
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
    assert.deepStrictEqual(fs.readdirSync(directory), [])

    fs.writeFileSync(path.join(directory, 'logto.dump'), 'existing')
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn: () => { throw new Error('不应覆盖') },
    }), (error) => error.code === 'BACKUP_OUTPUT_NOT_EMPTY')

    const missingToolDirectory = tempDirectory()
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: missingToolDirectory,
      consistencyConfirmed: true,
      spawn: () => { throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) },
    }), (error) => error && error.code === 'PG_DUMP_FAILED')
    assert.deepStrictEqual(fs.readdirSync(missingToolDirectory), [])
  })

  await t.test('备份使用独占锁并拒绝并发写入同一输出目录', async () => {
    const directory = tempDirectory()
    fs.writeFileSync(path.join(directory, '.backup.lock'), '已有备份进程')
    let dumpCalled = false

    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn: () => { dumpCalled = true; return { status: 0 } },
    }), (error) => error && error.code === 'BACKUP_IN_PROGRESS')
    assert.strictEqual(dumpCalled, false)
  })

  await t.test('备份在发布前拒绝被外部普通文件替换的临时 dump', async () => {
    const directory = tempDirectory()
    const outsideFile = path.join(tempDirectory(), 'outside.dump')
    fs.writeFileSync(outsideFile, '外部文件')
    const originalLink = fs.linkSync
    let finalPublishAttempted = false

    try {
      fs.linkSync = (source, destination) => {
        if (destination === path.join(directory, 'logto.dump')) finalPublishAttempted = true
        return originalLink(source, destination)
      }

      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          const database = dumpDatabase(args)
          const output = findTemporaryDump(directory, database === 'logto' ? 'logto' : 'business')
          if (database === 'logto') {
            fs.unlinkSync(output)
            originalLink(outsideFile, output)
          }
          writeDump(options, '本次备份')
          return { status: 0 }
        },
      }), (error) => error && error.code === 'BACKUP_OUTPUT_REPLACED')
    } finally {
      fs.linkSync = originalLink
    }

    assert.strictEqual(finalPublishAttempted, false)
    assert.strictEqual(fs.readFileSync(outsideFile, 'utf8'), '外部文件')
    assert.strictEqual(fs.existsSync(path.join(directory, 'logto.dump')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
  })

  await t.test('备份在发布前拒绝被符号链接替换的临时 dump', { skip: process.platform === 'win32' }, async () => {
    const directory = tempDirectory()
    const outsideFile = path.join(tempDirectory(), 'outside.dump')
    fs.writeFileSync(outsideFile, '外部文件')

    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn: (command, args, options) => {
        if (dumpDatabase(args) === 'logto') {
          const output = findTemporaryDump(directory, 'logto')
          fs.unlinkSync(output)
          fs.symlinkSync(outsideFile, output)
        }
        writeDump(options, '本次备份')
        return { status: 0 }
      },
    }), (error) => error && error.code === 'BACKUP_OUTPUT_REPLACED')

    assert.strictEqual(fs.readFileSync(outsideFile, 'utf8'), '外部文件')
    assert.strictEqual(fs.existsSync(path.join(directory, 'logto.dump')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
  })

  await t.test('源描述符打开后路径被替换时不尝试发布外部文件', async () => {
    const directory = tempDirectory()
    const outsideFile = path.join(tempDirectory(), 'outside.dump')
    fs.writeFileSync(outsideFile, '外部文件')
    const originalLink = fs.linkSync
    let finalPublishAttempted = false

    try {
      fs.linkSync = (source, destination) => {
        if (destination === path.join(directory, 'logto.dump')) finalPublishAttempted = true
        return originalLink(source, destination)
      }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          if (dumpDatabase(args) === 'business') {
            const logtoPartial = findTemporaryDump(directory, 'logto')
            fs.unlinkSync(logtoPartial)
            originalLink(outsideFile, logtoPartial)
          }
          return { status: 0 }
        },
      }), (error) => error && error.code === 'BACKUP_OUTPUT_REPLACED')
    } finally {
      fs.linkSync = originalLink
    }

    assert.strictEqual(finalPublishAttempted, false)
    assert.strictEqual(fs.readFileSync(outsideFile, 'utf8'), '外部文件')
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
  })

  await t.test('备份发布阶段不覆盖并发出现的外部文件', async () => {
    const directory = tempDirectory()
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn: (command, args, options) => {
        writeDump(options, '本次备份')
        if (dumpDatabase(args) === 'business') {
          fs.writeFileSync(path.join(directory, 'logto.dump'), '外部文件')
        }
        return { status: 0 }
      },
    }), (error) => error && error.code === 'BACKUP_OUTPUT_NOT_EMPTY')

    assert.strictEqual(fs.readFileSync(path.join(directory, 'logto.dump'), 'utf8'), '外部文件')
    assert.strictEqual(fs.existsSync(path.join(directory, 'business.dump')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, '.backup.lock')), false)
  })

  await t.test('备份锁被替换后中止且不删除外部锁', async () => {
    const directory = tempDirectory()
    const lockFile = path.join(directory, '.backup.lock')
    await assert.rejects(backup.backupDatabases({
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
      outputDirectory: directory,
      consistencyConfirmed: true,
      spawn: (command, args, options) => {
        writeDump(options, '本次备份')
        if (dumpDatabase(args) === 'business') {
          fs.unlinkSync(lockFile)
          fs.writeFileSync(lockFile, '外部锁')
        }
        return { status: 0 }
      },
    }), (error) => error && error.code === 'BACKUP_LOCK_LOST')

    assert.strictEqual(fs.readFileSync(lockFile, 'utf8'), '外部锁')
    assert.deepStrictEqual(fs.readdirSync(directory), ['.backup.lock'])
  })

  await t.test('备份失败清理不删除发布后被替换的外部文件', async () => {
    const directory = tempDirectory()
    const originalLink = fs.linkSync
    try {
      fs.linkSync = (source, destination) => {
        originalLink(source, destination)
        if (destination === path.join(directory, 'logto.dump')) {
          fs.unlinkSync(destination)
          fs.writeFileSync(destination, '外部替换文件')
        }
      }

      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, '本次备份')
          return { status: 0 }
        },
      }), (error) => error && error.code === 'BACKUP_OUTPUT_REPLACED')
    } finally {
      fs.linkSync = originalLink
    }

    assert.strictEqual(fs.readFileSync(path.join(directory, 'logto.dump'), 'utf8'), '外部替换文件')
    assert.strictEqual(fs.existsSync(path.join(directory, 'business.dump')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, 'manifest.json')), false)
    assert.strictEqual(fs.existsSync(path.join(directory, '.backup.lock')), false)
  })

  await t.test('摘要读取中断时不遗留备份半成品', async () => {
    const directory = tempDirectory()
    const originalRead = fs.readSync
    let readCalls = 0
    try {
      fs.readSync = (...args) => {
        readCalls += 1
        throw Object.assign(new Error('模拟读取中断'), { code: 'EIO' })
      }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, '本次备份')
          return { status: 0 }
        },
      }), (error) => error && error.code === 'EIO')
    } finally {
      fs.readSync = originalRead
    }
    assert.strictEqual(readCalls, 1)
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  await t.test('文件系统不支持硬链接时拒绝非原子发布', async () => {
    const directory = tempDirectory()
    const originalLink = fs.linkSync
    try {
      fs.linkSync = () => { throw Object.assign(new Error('不支持硬链接'), { code: 'EXDEV' }) }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          return { status: 0 }
        },
      }), (error) => error && error.code === 'BACKUP_ATOMIC_PUBLISH_UNSUPPORTED')
    } finally {
      fs.linkSync = originalLink
    }
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  await t.test('dump fsync 失败时不发布任何备份文件', async () => {
    const directory = tempDirectory()
    const originalFsync = fs.fsyncSync
    let fsyncCalls = 0
    try {
      fs.fsyncSync = () => {
        fsyncCalls += 1
        if (fsyncCalls > 1) throw Object.assign(new Error('模拟 fsync 失败'), { code: 'EIO' })
      }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          return { status: 0 }
        },
      }), (error) => error && error.code === 'EIO')
    } finally {
      fs.fsyncSync = originalFsync
    }
    assert.strictEqual(fsyncCalls, 2)
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  await t.test('manifest fsync 失败时回滚已发布的 dump', async () => {
    const directory = tempDirectory()
    const originalOpen = fs.openSync
    const originalFsync = fs.fsyncSync
    let manifestDescriptor
    try {
      fs.openSync = (file, ...args) => {
        const descriptor = originalOpen(file, ...args)
        if (typeof file === 'string' && path.basename(file).startsWith('.manifest.json.')) manifestDescriptor = descriptor
        return descriptor
      }
      fs.fsyncSync = (descriptor) => {
        if (descriptor === manifestDescriptor) throw Object.assign(new Error('模拟 manifest fsync 失败'), { code: 'EIO' })
        return originalFsync(descriptor)
      }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          return { status: 0 }
        },
      }), (error) => error && error.code === 'EIO')
    } finally {
      fs.openSync = originalOpen
      fs.fsyncSync = originalFsync
    }
    assert(Number.isInteger(manifestDescriptor))
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  await t.test('manifest 发布后的目录 fsync 失败时回滚整个快照', { skip: process.platform === 'win32' }, async () => {
    const directory = tempDirectory()
    const originalOpen = fs.openSync
    const originalFsync = fs.fsyncSync
    const directoryDescriptors = new Set()
    let directorySyncs = 0
    try {
      fs.openSync = (file, ...args) => {
        const descriptor = originalOpen(file, ...args)
        if (file === directory) directoryDescriptors.add(descriptor)
        return descriptor
      }
      fs.fsyncSync = (descriptor) => {
        if (directoryDescriptors.has(descriptor)) {
          directorySyncs += 1
          if (directorySyncs === 2) throw Object.assign(new Error('模拟目录 fsync 失败'), { code: 'EIO' })
        }
        return originalFsync(descriptor)
      }
      await assert.rejects(backup.backupDatabases({
        logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto',
        businessUrl: 'postgresql://app:strongpassword@db.example.com/business',
        outputDirectory: directory,
        consistencyConfirmed: true,
        spawn: (command, args, options) => {
          writeDump(options, `dump:${dumpDatabase(args)}`)
          return { status: 0 }
        },
      }), (error) => error && error.code === 'EIO')
    } finally {
      fs.openSync = originalOpen
      fs.fsyncSync = originalFsync
    }
    assert.strictEqual(directorySyncs, 2)
    assert.deepStrictEqual(fs.readdirSync(directory), [])
  })

  await t.test('恢复要求逐库名称确认且只恢复校验通过的两个目标', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifest = {
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    const calls = []
    const stateDirectory = tempDirectory()
    const stateFile = path.join(stateDirectory, 'restore-state.json')
    const stateDirectorySyncs = []
    let initialProgress
    const common = {
      manifestPath,
      outputDirectory: directory,
      stateFile,
      logtoUrl: 'postgresql://logto_operator:strongpassword@db.example.com/logto_restore',
      businessUrl: 'postgresql://business_operator:strongpassword@db.example.com/business_restore',
      syncDirectory: (directory) => { stateDirectorySyncs.push(directory) },
      spawn: (...args) => {
        if (args[0] === 'psql') return { status: 0, stdout: 'empty\n' }
        calls.push(args)
        const progress = JSON.parse(fs.readFileSync(`${stateFile}.in-progress`, 'utf8'))
        if (initialProgress === undefined) initialProgress = progress
        else assert.deepStrictEqual(progress, initialProgress)
        return { status: 0 }
      },
    }

    assert.strictEqual(await restore.main({ ...common, confirmLogtoDatabase: 'wrong', confirmBusinessDatabase: 'business_restore' }), 2)
    assert.strictEqual(calls.length, 0)
    assert.strictEqual(fs.existsSync(stateFile), false)
    assert.strictEqual(await restore.main({ ...common, stateFile: undefined, confirmLogtoDatabase: 'logto_restore', confirmBusinessDatabase: 'business_restore' }), 2)
    assert.strictEqual(await restore.main({ ...common, confirmLogtoDatabase: 'logto_restore', confirmBusinessDatabase: 'business_restore' }), 0)
    assert.deepStrictEqual(calls.map((entry) => entry[0]), ['pg_restore', 'pg_restore'])
    assert(calls.every((entry) => entry[1].includes('--exit-on-error')))
    assert(calls.every((entry) => entry[1].includes('--single-transaction')))
    assert(calls.every((entry) => Number.isInteger(entry[2].stdio[0])))
    assert(calls.every((entry) => !entry[1].some((value) => String(value).endsWith('.dump'))))
    const completed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    assert.strictEqual(completed.version, 1)
    assert.strictEqual(completed.status, 'complete')
    assert.deepStrictEqual(completed.restoredDatabases, ['logto', 'business'])
    assert.deepStrictEqual(completed.targetDatabases, { logto: 'logto_restore', business: 'business_restore' })
    assert.strictEqual(completed.manifestSha256, backup.sha256File(manifestPath))
    assert.strictEqual(JSON.stringify(completed).includes('strongpassword'), false)
    assert.strictEqual(JSON.stringify(completed).includes('db.example.com'), false)
    assert.strictEqual(fs.existsSync(`${stateFile}.in-progress`), false)
    assert.strictEqual(fs.existsSync(`${stateFile}.failed`), false)
    assert.deepStrictEqual(stateDirectorySyncs, [stateDirectory, stateDirectory, stateDirectory])
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(stateFile).mode & 0o077, 0)

    const callsBeforeRetry = calls.length
    assert.strictEqual(await restore.main({ ...common, confirmLogtoDatabase: 'logto_restore', confirmBusinessDatabase: 'business_restore' }), 2)
    assert.strictEqual(calls.length, callsBeforeRetry)

    const failedStateFile = path.join(tempDirectory(), 'restore-state.json')
    let restoreCount = 0
    assert.strictEqual(await restore.main({
      ...common,
      stateFile: failedStateFile,
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: (command) => command === 'psql'
        ? { status: 0, stdout: 'empty\n' }
        : { status: ++restoreCount === 1 ? 0 : 1 },
    }), 1)
    assert.strictEqual(fs.existsSync(failedStateFile), false)
    assert.strictEqual(fs.existsSync(`${failedStateFile}.in-progress`), false)
    const failure = JSON.parse(fs.readFileSync(`${failedStateFile}.failed`, 'utf8'))
    assert.strictEqual(failure.status, 'failed')
    assert.deepStrictEqual(failure.restoredDatabases, ['logto'])
    assert.strictEqual(failure.errorCode, 'PG_RESTORE_FAILED')
    assert.strictEqual(JSON.stringify(failure).includes('strongpassword'), false)
    assert.strictEqual(JSON.stringify(failure).includes('db.example.com'), false)
    assert.deepStrictEqual(stateDirectorySyncs, [
      stateDirectory, stateDirectory, stateDirectory,
      path.dirname(failedStateFile), path.dirname(failedStateFile), path.dirname(failedStateFile),
    ])
  })

  await t.test('恢复状态必须位于备份目录之外且已有状态不可覆盖', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }))
    let restoreCalled = false
    const common = {
      manifestPath,
      outputDirectory: directory,
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto_restore',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business_restore',
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: () => { restoreCalled = true; return { status: 0 } },
    }

    assert.strictEqual(await restore.main({ ...common, stateFile: path.join(directory, 'restore-state.json') }), 2)
    assert.strictEqual(restoreCalled, false)

    for (const suffix of ['', '.in-progress', '.failed']) {
      const stateFile = path.join(tempDirectory(), 'restore-state.json')
      fs.writeFileSync(`${stateFile}${suffix}`, '已有状态')
      assert.strictEqual(await restore.main({ ...common, stateFile }), 2)
      assert.strictEqual(restoreCalled, false)
    }
  })

  await t.test('恢复前验证两个目标为空且凭据只进入子进程环境', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }))
    const stateFile = path.join(tempDirectory(), 'restore-state.json')
    const commands = []
    const code = await restore.main({
      manifestPath,
      outputDirectory: directory,
      stateFile,
      logtoUrl: 'postgresql://logto_operator:logto-password@db.example.com/logto_restore',
      businessUrl: 'postgresql://business_operator:business-password@db.example.com/business_restore',
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: (command, args, options) => {
        commands.push({ command, args, options })
        const database = args[args.indexOf('--dbname') + 1]
        return { status: 0, stdout: database === 'business_restore' ? 'not_empty\n' : 'empty\n' }
      },
    })

    assert.strictEqual(code, 1)
    assert.deepStrictEqual(commands.map((entry) => entry.command), ['psql', 'psql'])
    assert(commands.every((entry) => entry.options.shell === false))
    assert(commands.every((entry) => !entry.args.join(' ').includes('password')))
    assert.deepStrictEqual(commands.map((entry) => entry.options.env.PGPASSWORD), ['logto-password', 'business-password'])
    const failed = JSON.parse(fs.readFileSync(`${stateFile}.failed`, 'utf8'))
    assert.strictEqual(failed.errorCode, 'RESTORE_TARGET_NOT_EMPTY')
    assert.deepStrictEqual(failed.restoredDatabases, [])

    let sameTargetSpawned = false
    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      stateFile: path.join(tempDirectory(), 'restore-state.json'),
      logtoUrl: 'postgresql://logto_operator:password@db.example.com/same_restore',
      businessUrl: 'postgresql://business_operator:password@db.example.com/same_restore',
      confirmLogtoDatabase: 'same_restore',
      confirmBusinessDatabase: 'same_restore',
      spawn: () => { sameTargetSpawned = true; return { status: 0 } },
    }), 2)
    assert.strictEqual(sameTargetSpawned, false)
  })

  await t.test('恢复完成状态发布竞态不删除外部状态文件', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }))
    const stateFile = path.join(tempDirectory(), 'restore-state.json')
    let restoreCount = 0

    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      stateFile,
      logtoUrl: 'postgresql://logto:strongpassword@db.example.com/logto_restore',
      businessUrl: 'postgresql://app:strongpassword@db.example.com/business_restore',
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: (command) => {
        if (command === 'psql') return { status: 0, stdout: 'empty\n' }
        restoreCount += 1
        if (restoreCount === 2) fs.writeFileSync(stateFile, '外部状态')
        return { status: 0 }
      },
    }), 1)
    assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), '外部状态')
    assert.strictEqual(JSON.parse(fs.readFileSync(`${stateFile}.failed`, 'utf8')).errorCode, 'RESTORE_STATE_WRITE_FAILED')
  })

  await t.test('恢复状态链接成功后被替换时不删除外部文件', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }))
    const stateFile = path.join(tempDirectory(), 'restore-state.json')
    const originalLink = fs.linkSync
    try {
      fs.linkSync = (source, destination) => {
        originalLink(source, destination)
        if (destination === stateFile) {
          fs.unlinkSync(destination)
          fs.writeFileSync(destination, '外部状态')
        }
      }
      assert.strictEqual(await restore.main({
        manifestPath,
        outputDirectory: directory,
        stateFile,
        logtoUrl: 'postgresql://logto:password@db.example.com/logto_restore',
        businessUrl: 'postgresql://business:password@db.example.com/business_restore',
        confirmLogtoDatabase: 'logto_restore',
        confirmBusinessDatabase: 'business_restore',
        spawn: (command) => command === 'psql' ? { status: 0, stdout: 'empty\n' } : { status: 0 },
      }), 1)
    } finally {
      fs.linkSync = originalLink
    }
    assert.strictEqual(fs.readFileSync(stateFile, 'utf8'), '外部状态')
    assert.strictEqual(JSON.parse(fs.readFileSync(`${stateFile}.failed`, 'utf8')).errorCode, 'RESTORE_STATE_WRITE_FAILED')
  })

  await t.test('恢复从校验后的文件描述符读取，路径被替换也不改变输入', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    const manifest = {
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    const stateFile = path.join(tempDirectory(), 'restore-state.json')
    let restoreCount = 0
    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      stateFile,
      logtoUrl: 'postgresql://logto:password@db.example.com/logto_restore',
      businessUrl: 'postgresql://business:password@db.example.com/business_restore',
      confirmLogtoDatabase: 'logto_restore',
      confirmBusinessDatabase: 'business_restore',
      spawn: (command, args, options) => {
        if (command === 'psql') return { status: 0, stdout: 'empty\n' }
        restoreCount += 1
        const name = restoreCount === 1 ? 'logto' : 'business'
        const dumpFile = path.join(directory, `${name}.dump`)
        fs.unlinkSync(dumpFile)
        fs.writeFileSync(dumpFile, '已替换')
        assert.strictEqual(fs.readFileSync(options.stdio[0], 'utf8'), `dump:${name}`)
        return { status: 0 }
      },
    }), 0)

  })

  await t.test('manifest 校验拒绝符号链接备份', { skip: process.platform === 'win32' }, () => {
    const linkedDirectory = tempDirectory()
    const outsideFile = path.join(tempDirectory(), 'outside.dump')
    fs.writeFileSync(outsideFile, 'outside')
    fs.symlinkSync(outsideFile, path.join(linkedDirectory, 'logto.dump'))
    fs.writeFileSync(path.join(linkedDirectory, 'business.dump'), 'dump:business')
    fs.writeFileSync(path.join(linkedDirectory, 'manifest.json'), JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: [
        { name: 'logto', file: 'logto.dump', bytes: 7, sha256: backup.sha256File(outsideFile) },
        { name: 'business', file: 'business.dump', bytes: 13, sha256: backup.sha256File(path.join(linkedDirectory, 'business.dump')) },
      ],
    }))
    assert.strictEqual(restore.verifyManifest(path.join(linkedDirectory, 'manifest.json'), linkedDirectory).valid, false)
  })

  await t.test('切换自动化只接受与 manifest 匹配的完整恢复状态', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }))
    const stateDirectory = tempDirectory()
    const stateFile = path.join(stateDirectory, 'restore-state.json')
    const completeState = {
      version: 1,
      status: 'complete',
      manifestSha256: backup.sha256File(manifestPath),
      targetDatabases: { logto: 'isolated_logto', business: 'isolated_business' },
      restoredDatabases: ['logto', 'business'],
      startedAt: '2026-07-21T00:00:00.000Z',
      completedAt: '2026-07-21T00:01:00.000Z',
    }
    fs.writeFileSync(stateFile, JSON.stringify(completeState))

    assert.strictEqual(await restore.main({ manifestPath, outputDirectory: directory, stateFile, verifyState: true }), 0)
    const script = path.resolve(__dirname, '../../../deploy/logto/scripts/postgres-restore.js')
    const cli = spawnSync(process.execPath, [
      script,
      '--verify-state',
      '--manifest', manifestPath,
      '--output-directory', directory,
      '--state-file', stateFile,
    ], { encoding: 'utf8', env: { ...process.env, LOGTO_DATABASE_URL: '', BUSINESS_DATABASE_URL: '' } })
    assert.strictEqual(cli.status, 0, cli.stderr)

    fs.writeFileSync(`${stateFile}.in-progress`, '{}')
    assert.strictEqual(await restore.main({ manifestPath, outputDirectory: directory, stateFile, verifyState: true }), 1)
    fs.unlinkSync(`${stateFile}.in-progress`)

    for (const invalid of [
      { ...completeState, status: 'failed' },
      { ...completeState, manifestSha256: '0'.repeat(64) },
      { ...completeState, restoredDatabases: ['logto'] },
      { ...completeState, targetDatabases: { logto: 'same', business: 'same' } },
    ]) {
      fs.writeFileSync(stateFile, JSON.stringify(invalid))
      assert.strictEqual(await restore.main({ manifestPath, outputDirectory: directory, stateFile, verifyState: true }), 1)
    }
    assert.strictEqual(await restore.main({ manifestPath, outputDirectory: directory, stateFile, verifyState: true, verifyOnly: true }), 2)
  })

  await t.test('verify-only 只校验 manifest，不要求数据库确认也不调用 pg_restore', async () => {
    const directory = tempDirectory()
    for (const name of ['logto', 'business']) fs.writeFileSync(path.join(directory, `${name}.dump`), `dump:${name}`)
    const manifest = {
      version: 1,
      consistency: { mode: 'quiesced', writesPaused: true },
      databases: ['logto', 'business'].map((name) => ({
        name,
        file: `${name}.dump`,
        bytes: fs.statSync(path.join(directory, `${name}.dump`)).size,
        sha256: backup.sha256File(path.join(directory, `${name}.dump`)),
      })),
    }
    const manifestPath = path.join(directory, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))

    assert.deepStrictEqual(restore.parseArgs([
      '--verify-only',
      '--manifest', manifestPath,
      '--output-directory', directory,
    ]), {
      verifyOnly: true,
      verifyState: false,
      manifestPath,
      outputDirectory: directory,
      confirmLogtoDatabase: undefined,
      confirmBusinessDatabase: undefined,
      stateFile: undefined,
    })
    assert.strictEqual(restore.parseArgs(['--state-file', 'D:\\restore-state.json']).stateFile, 'D:\\restore-state.json')
    assert.strictEqual(restore.parseArgs(['--verify-state']).verifyState, true)

    let restoreCalled = false
    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      verifyOnly: true,
      spawn: () => { restoreCalled = true; return { status: 0 } },
    }), 0)
    assert.strictEqual(restoreCalled, false)

    const script = path.resolve(__dirname, '../../../deploy/logto/scripts/postgres-restore.js')
    const cli = spawnSync(process.execPath, [
      script,
      '--verify-only',
      '--manifest', manifestPath,
      '--output-directory', directory,
    ], { encoding: 'utf8', env: { ...process.env, LOGTO_DATABASE_URL: '', BUSINESS_DATABASE_URL: '' } })
    assert.strictEqual(cli.status, 0, cli.stderr)

    fs.writeFileSync(path.join(directory, 'business.dump'), 'tampered')
    assert.strictEqual(await restore.main({
      manifestPath,
      outputDirectory: directory,
      verifyOnly: true,
    }), 1)
  })
})
