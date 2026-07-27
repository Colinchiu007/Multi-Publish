'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function executableName (tool, platform = process.platform) {
  return platform === 'win32' ? tool + '.exe' : tool
}

function existingFile (candidate, existsSync = fs.existsSync) {
  return typeof candidate === 'string' && candidate.length > 0 && existsSync(candidate)
    ? candidate
    : null
}

function loadInstalledPaths () {
  try {
    const bundled = require('ffmpeg-ffprobe-static')
    return {
      ffmpeg: bundled.ffmpegPath || null,
      ffprobe: bundled.ffprobePath || null,
    }
  } catch {
    return {}
  }
}

function defaultCommandAvailable (command) {
  try {
    execFileSync(command, ['-version'], { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function defaultCommonPaths (tool, platform, env) {
  const name = executableName(tool, platform)
  if (platform === 'win32') {
    return [
      path.join('C:\\ffmpeg', 'bin', name),
      path.join(env.PROGRAMFILES || 'C:\\Program Files', 'ffmpeg', 'bin', name),
    ]
  }
  return ['/usr/bin/' + tool, '/usr/local/bin/' + tool, '/opt/homebrew/bin/' + tool]
}

function findMediaTool (tool, options = {}) {
  const env = options.env || process.env
  const platform = options.platform || process.platform
  const existsSync = options.existsSync || fs.existsSync
  const resourcesPath = options.resourcesPath === undefined ? process.resourcesPath : options.resourcesPath
  const envName = tool === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'

  if (typeof resourcesPath === 'string' && resourcesPath) {
    const packaged = existingFile(
      path.join(resourcesPath, 'media-tools', executableName(tool, platform)),
      existsSync,
    )
    if (packaged) return packaged
  }

  if (env.NODE_ENV === 'test' && env.SKIP_NATIVE_MEDIA_TOOL_TESTS === '1') return null

  const installedPaths = options.installedPaths === undefined ? loadInstalledPaths() : options.installedPaths
  const commandAvailable = options.commandAvailable || defaultCommandAvailable
  const commonPaths = options.commonPaths || defaultCommonPaths(tool, platform, env)

  const configured = existingFile(env[envName], existsSync)
  if (configured) return configured

  const targetPath = platform === 'win32' ? path.win32 : path.posix
  if (tool === 'ffprobe' && targetPath.isAbsolute(env.FFMPEG_PATH || '')) {
    const sibling = targetPath.join(
      targetPath.dirname(env.FFMPEG_PATH),
      targetPath.basename(env.FFMPEG_PATH).replace(/ffmpeg/i, 'ffprobe'),
    )
    const configuredSibling = existingFile(sibling, existsSync)
    if (configuredSibling) return configuredSibling
  }

  const installed = existingFile(installedPaths && installedPaths[tool], existsSync)
  if (installed) return installed

  if (commandAvailable(tool)) return tool

  for (const candidate of commonPaths) {
    const found = existingFile(candidate, existsSync)
    if (found) return found
  }
  return null
}

function findFfmpeg (options) {
  return findMediaTool('ffmpeg', options)
}

function findFfprobe (options) {
  return findMediaTool('ffprobe', options)
}

module.exports = {
  executableName,
  findFfmpeg,
  findFfprobe,
  findMediaTool,
}
