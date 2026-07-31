// @vitest-environment node
const fs = require('fs')
const path = require('path')
const { collectRuntimePackages, packageDependencies, resolvePackageJson, runtimeDependencyEntries } = require('../../scripts/stage-remotion-runtime')

describe('stage-remotion-runtime', () => {
  it('collects runtime, optional, and required peer dependencies without duplication', () => {
    const manifests = {
      '/composer/package.json': {
        dependencies: { remotion: '^4', '@remotion/cli': '^4' },
        optionalDependencies: { optional: '^1' },
      },
      '/modules/remotion/package.json': { dependencies: { shared: '^1' } },
      '/modules/cli/package.json': { peerDependencies: { shared: '^1', react: '^18' } },
      '/modules/optional/package.json': {},
      '/modules/shared/package.json': {},
      '/modules/react/package.json': {},
    }
    const readFileSync = vi.spyOn(fs, 'readFileSync').mockImplementation((file) => JSON.stringify(manifests[file]))
    const resolvePackage = (name) => ({
      remotion: '/modules/remotion/package.json',
      '@remotion/cli': '/modules/cli/package.json',
      optional: '/modules/optional/package.json',
      shared: '/modules/shared/package.json',
      react: '/modules/react/package.json',
    })[name]

    try {
      expect(collectRuntimePackages('/composer/package.json', resolvePackage).map((record) => record.name).sort())
        .toEqual(['@remotion/cli', 'optional', 'react', 'remotion', 'shared'])
    } finally {
      readFileSync.mockRestore()
    }
  })

  it('merges only runtime dependency sections', () => {
    expect(packageDependencies({
      dependencies: { one: '1' },
      optionalDependencies: { two: '1' },
      peerDependencies: { three: '1' },
      devDependencies: { ignored: '1' },
    }).sort()).toEqual(['one', 'three', 'two'])
  })

  it('resolves a package manifest even when package exports hide package.json', () => {
    const packageJson = resolvePackageJson('d3-geo', path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'remotion-composer'))
    expect(packageJson.replace(/\\/g, '/')).toMatch(/node_modules\/d3-geo\/package\.json$/)
  })

  it('skips an unavailable platform-specific optional dependency', () => {
    const manifests = {
      '/composer/package.json': { optionalDependencies: { linuxOnly: '1' } },
    }
    const readFileSync = vi.spyOn(fs, 'readFileSync').mockImplementation((file) => JSON.stringify(manifests[file]))
    const missingOptional = Object.assign(new Error('missing'), { code: 'MODULE_NOT_FOUND' })
    try {
      expect(collectRuntimePackages('/composer/package.json', () => { throw missingOptional })).toEqual([])
    } finally {
      readFileSync.mockRestore()
    }
  })

  it('marks optional package variants while preserving required dependencies', () => {
    expect(runtimeDependencyEntries({
      dependencies: { required: '1' },
      optionalDependencies: { optional: '1' },
      peerDependencies: { peerOptional: '1' },
      peerDependenciesMeta: { peerOptional: { optional: true } },
    })).toEqual([
      { name: 'required', optional: false },
      { name: 'peerOptional', optional: true },
      { name: 'optional', optional: true },
    ])
  })
})
