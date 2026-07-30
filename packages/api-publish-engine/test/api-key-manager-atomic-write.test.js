const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const ApiKeyManager = require('../src/api-key-manager')

function holdExclusiveWindowsFileLock(filePath, holdMs) {
  const script = [
    '& {',
    'param($file, $holdMs)',
    '$handle = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)',
    'try {',
    '[Console]::Out.WriteLine("LOCKED")',
    '[Console]::Out.Flush()',
    '[Threading.Thread]::Sleep([int]$holdMs)',
    '} finally { $handle.Dispose() }',
    '}',
  ].join('\n')
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
    filePath,
    String(holdMs),
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  let locked = false
  let resolveLocked
  let rejectLocked
  const lockedPromise = new Promise((resolve, reject) => {
    resolveLocked = resolve
    rejectLocked = reject
  })
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', error => {
      rejectLocked(error)
      reject(error)
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.stdout.on('data', chunk => {
      if (!locked && chunk.toString().includes('LOCKED')) {
        locked = true
        resolveLocked()
      }
    })
    child.once('exit', code => {
      if (!locked) rejectLocked(new Error(`PowerShell exited before locking the file: ${stderr}`))
      if (code === 0) resolve()
      else reject(new Error(`PowerShell file lock exited with code ${code}: ${stderr}`))
    })
  })

  return lockedPromise.then(() => ({ exitPromise }))
}

test('Windows 短暂文件锁释放后 API Key 原子保存成功', {
  skip: process.platform !== 'win32',
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-api-key-atomic-'))
  const keysPath = path.join(directory, 'api-keys.json')
  let fileLock

  try {
    const manager = new ApiKeyManager(keysPath)
    manager.load()
    manager.createKey('initial-key', ['publish:read'])

    fileLock = await holdExclusiveWindowsFileLock(keysPath, 180)
    const created = manager.createKey('after-lock', ['publish:submit'])
    await fileLock.exitPromise

    assert.equal(created.name, 'after-lock')
    const persisted = JSON.parse(fs.readFileSync(keysPath, 'utf8'))
    assert.deepEqual(persisted.map(entry => entry.name), ['initial-key', 'after-lock'])
    assert.equal(persisted.every(entry => /^[a-f0-9]{64}$/.test(entry.keyHash)), true)
    assert.equal(fs.existsSync(`${keysPath}.tmp`), false)
  } finally {
    if (fileLock) await fileLock.exitPromise.catch(() => {})
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
