function getApi() {
  return typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null
}

export async function servicesGetStatus() {
  const api = getApi()
  return api && typeof api.servicesGetStatus === 'function'
    ? api.servicesGetStatus()
    : { code: -1, message: 'SERVICES_API_UNAVAILABLE' }
}
