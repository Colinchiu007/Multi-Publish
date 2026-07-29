'use strict'

const { buildPreload } = require('./build-preload')
const { stageMediaTools } = require('./stage-media-tools')

const ELECTRON_BUILDER_ARCH_NAMES = Object.freeze(['ia32', 'x64', 'armv7l', 'arm64', 'universal'])

function normalizeBuildArch (arch) {
  if (typeof arch === 'string' && arch) return arch
  if (Number.isInteger(arch) && ELECTRON_BUILDER_ARCH_NAMES[arch]) {
    return ELECTRON_BUILDER_ARCH_NAMES[arch]
  }
  return process.arch
}

module.exports = async function beforePack (context = {}, dependencies = {}) {
  const buildPreloadImpl = dependencies.buildPreload || buildPreload
  const stageMediaToolsImpl = dependencies.stageMediaTools || stageMediaTools
  await buildPreloadImpl()
  stageMediaToolsImpl({
    platform: context.electronPlatformName || process.platform,
    arch: normalizeBuildArch(context.arch),
  })
}

module.exports.normalizeBuildArch = normalizeBuildArch
