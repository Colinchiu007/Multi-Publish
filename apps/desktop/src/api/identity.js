function getApi() {
  return typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null
}

export async function identityGetState() {
  const api = getApi()
  return api && typeof api.identityGetState === 'function'
    ? api.identityGetState()
    : { code: -1, message: 'IDENTITY_API_UNAVAILABLE' }
}

export async function identitySignIn() {
  const api = getApi()
  return api && typeof api.identitySignIn === 'function'
    ? api.identitySignIn()
    : { code: -1, message: 'IDENTITY_API_UNAVAILABLE' }
}

export async function identitySwitchAccount() {
  const api = getApi()
  return api && typeof api.identitySwitchAccount === 'function'
    ? api.identitySwitchAccount()
    : { code: -1, message: 'IDENTITY_API_UNAVAILABLE' }
}

export async function identitySignOut() {
  const api = getApi()
  return api && typeof api.identitySignOut === 'function'
    ? api.identitySignOut()
    : { code: -1, message: 'IDENTITY_API_UNAVAILABLE' }
}

export function onIdentityStateChanged(callback) {
  const api = getApi()
  if (!api || typeof api.onIdentityStateChanged !== 'function') return () => {}
  return api.onIdentityStateChanged(callback)
}
