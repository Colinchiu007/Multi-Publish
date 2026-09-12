function createServicesApi(ipcRenderer) {
  return {
    servicesGetStatus: () => ipcRenderer.invoke('services:get-status'),
  }
}

module.exports = { createServicesApi }
