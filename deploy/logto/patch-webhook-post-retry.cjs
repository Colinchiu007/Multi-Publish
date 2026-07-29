'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const DEFAULT_BUILD_DIRECTORY = '/etc/logto/packages/core/build'
const EXPECTED_RUNTIME_SHA256 = '77441c2d030d064343cfb22aa61b0e0ed45bff8fb33a1d4ce2beed6a8f1c752c'
const OLD_RETRY_FRAGMENT = 'retry: { limit: retries ?? 3 },'
const NEW_RETRY_FRAGMENT = 'retry: { limit: retries ?? 3, methods: ["post"] },'

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function countOccurrences(content, fragment) {
  return content.split(fragment).length - 1
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

function assertRegularSingleLink(stats, label) {
  if (!stats.isFile() || stats.nlink !== 1n) {
    throw new Error(`${label}必须是唯一链接的普通文件`)
  }
}

function assertPathStillTargets(file, expectedIdentity, phase) {
  const pathIdentity = fs.lstatSync(file, { bigint: true })
  assertRegularSingleLink(pathIdentity, '运行时路径')
  if (!sameFileIdentity(pathIdentity, expectedIdentity)) {
    throw new Error(`运行时文件在补丁${phase}发生变化`)
  }
}

function readFromDescriptor(fileDescriptor) {
  const stats = fs.fstatSync(fileDescriptor)
  const content = Buffer.alloc(stats.size)
  let offset = 0

  while (offset < content.length) {
    const bytesRead = fs.readSync(
      fileDescriptor,
      content,
      offset,
      content.length - offset,
      offset,
    )
    if (bytesRead === 0) {
      throw new Error('运行时文件读取提前结束')
    }
    offset += bytesRead
  }

  return content
}

function writeToDescriptor(fileDescriptor, content) {
  fs.ftruncateSync(fileDescriptor, 0)
  let offset = 0

  while (offset < content.length) {
    const bytesWritten = fs.writeSync(
      fileDescriptor,
      content,
      offset,
      content.length - offset,
      offset,
    )
    if (bytesWritten === 0) {
      throw new Error('运行时文件写入没有进展')
    }
    offset += bytesWritten
  }

  fs.fsyncSync(fileDescriptor)
}

function patchWebhookPostRetry({
  buildDirectory = DEFAULT_BUILD_DIRECTORY,
  runtimeSha256ForTest,
} = {}) {
  const expectedRuntimeSha256 = runtimeSha256ForTest ?? EXPECTED_RUNTIME_SHA256
  const openFlags = fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0)
  const runtimeFiles = fs.readdirSync(buildDirectory)
    .filter((name) => /^main-[A-Za-z0-9_-]+\.js$/.test(name))
    .map((name) => path.join(buildDirectory, name))

  const openedRuntimeFiles = []
  try {
    for (const file of runtimeFiles) {
      const pathIdentity = fs.lstatSync(file, { bigint: true })
      assertRegularSingleLink(pathIdentity, '运行时路径')

      const fileDescriptor = fs.openSync(file, openFlags)
      try {
        const identity = fs.fstatSync(fileDescriptor, { bigint: true })
        assertRegularSingleLink(identity, '运行时目标')
        if (!sameFileIdentity(pathIdentity, identity)) {
          throw new Error('运行时路径在打开期间发生变化')
        }
        openedRuntimeFiles.push({
          file,
          fileDescriptor,
          identity,
          content: readFromDescriptor(fileDescriptor).toString('utf8'),
        })
      } catch (error) {
        fs.closeSync(fileDescriptor)
        throw error
      }
    }
  } catch (error) {
    for (const { fileDescriptor } of openedRuntimeFiles.reverse()) {
      fs.closeSync(fileDescriptor)
    }
    throw error
  }

  const matches = openedRuntimeFiles
    .filter(({ content }) => content.includes(OLD_RETRY_FRAGMENT))

  try {
    if (matches.length !== 1) {
      throw new Error(`必须且只能定位到一个待补丁运行时文件，实际为 ${matches.length}`)
    }

    const [{ file, fileDescriptor, identity, content }] = matches
    const occurrences = countOccurrences(content, OLD_RETRY_FRAGMENT)
    if (occurrences !== 1) {
      throw new Error(`目标片段必须且只能出现一次，实际为 ${occurrences}`)
    }

    const beforeSha256 = sha256(content)
    if (beforeSha256 !== expectedRuntimeSha256) {
      throw new Error(`运行时文件 SHA-256 不匹配：期望 ${expectedRuntimeSha256}，实际 ${beforeSha256}`)
    }

    const patched = content.replace(OLD_RETRY_FRAGMENT, NEW_RETRY_FRAGMENT)
    if (countOccurrences(patched, OLD_RETRY_FRAGMENT) !== 0 ||
        countOccurrences(patched, NEW_RETRY_FRAGMENT) !== 1) {
      throw new Error('补丁后置条件校验失败')
    }

    assertPathStillTargets(file, identity, '提交前')
    const currentContent = readFromDescriptor(fileDescriptor).toString('utf8')
    if (currentContent !== content) {
      throw new Error('运行时文件内容在补丁提交前发生变化')
    }

    const originalBytes = Buffer.from(content)
    const patchedBytes = Buffer.from(patched)
    try {
      writeToDescriptor(fileDescriptor, patchedBytes)

      const written = readFromDescriptor(fileDescriptor).toString('utf8')
      if (written !== patched || countOccurrences(written, NEW_RETRY_FRAGMENT) !== 1) {
        throw new Error('补丁提交后读回不一致')
      }

      assertPathStillTargets(file, identity, '提交期间')

      return {
        file,
        beforeSha256,
        afterSha256: sha256(written),
      }
    } catch (patchError) {
      try {
        writeToDescriptor(fileDescriptor, originalBytes)
      } catch (restoreError) {
        patchError.message += `；恢复原运行时文件也失败：${restoreError.message}`
      }
      throw patchError
    }
  } finally {
    for (const { fileDescriptor } of openedRuntimeFiles) {
      fs.closeSync(fileDescriptor)
    }
  }
}

if (require.main === module) {
  try {
    const result = patchWebhookPostRetry()
    console.log(JSON.stringify({
      file: result.file,
      beforeSha256: result.beforeSha256,
      afterSha256: result.afterSha256,
    }))
  } catch (error) {
    console.error(`Logto Webhook POST 重试补丁失败：${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  DEFAULT_BUILD_DIRECTORY,
  EXPECTED_RUNTIME_SHA256,
  OLD_RETRY_FRAGMENT,
  NEW_RETRY_FRAGMENT,
  patchWebhookPostRetry,
}
