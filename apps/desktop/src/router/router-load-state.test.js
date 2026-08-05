import { beforeEach, describe, expect, it } from 'vitest'
import { clearRouteLoadError, routeLoadError, setRouteLoadError } from './index'

describe('router load error state', () => {
  beforeEach(() => {
    clearRouteLoadError()
  })

  it('keeps initial dynamic import failures available to App before mount', () => {
    setRouteLoadError(new Error('Failed to fetch dynamically imported module'), { fullPath: '/create' })

    expect(routeLoadError.value).toMatchObject({
      title: '页面加载失败',
      path: '/create',
      errorMessage: 'Failed to fetch dynamically imported module',
    })
    expect(routeLoadError.value.details).toContain('/create')
  })

  it('clears the shared state for a retry', () => {
    setRouteLoadError(new Error('chunk failed'), { fullPath: '/create' })
    const failedPath = routeLoadError.value.path
    clearRouteLoadError()

    expect(routeLoadError.value).toBeNull()
    expect(failedPath).toBe('/create')
  })
})
