// @ts-check
/**
 * PromptEval renderer API
 * 工厂函数：createPromptEvalApi(ipcRenderer)
 */
function createPromptEvalApi (ipcRenderer) {
  return {
    promptEvalRun: (request) => ipcRenderer.invoke('prompt-eval:run', request),
    promptEvalList: () => ipcRenderer.invoke('prompt-eval:list'),
    promptEvalGet: (id) => ipcRenderer.invoke('prompt-eval:get', id),
    promptEvalDelete: (id) => ipcRenderer.invoke('prompt-eval:delete', id),
    promptEvalAnalyze: () => ipcRenderer.invoke('prompt-eval:analyze'),
    promptEvalDimensions: () => ipcRenderer.invoke('prompt-eval:dimensions'),
  }
}

module.exports = { createPromptEvalApi }
