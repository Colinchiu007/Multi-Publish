// @ts-check
/**
 * useFilmAutoRefs — 「自动」模式的参考图管理（人物/场景），从 FilmAutoPanel.vue 抽出，仅搬迁不改语义。
 *
 * 复用既有 `film-engineering:upload-reference`（受控媒体根 + 引用计数回收）：
 * 渲染端只负责选文件与展示，落盘与生命周期由服务端管；这里不碰任何业务推断。
 *
 * 依赖经 ctx 注入（feApi/t/form），与面板共用同一份状态；拆分动因见 .github/scripts/check-max-lines.js。
 */
import { ref, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { MAX_AUTO_REFS } from './auto-constants'

export function useFilmAutoRefs (ctx) {
  const { feApi, t, form, errorText, fail, unwrap } = ctx || {}
  /** @type {import('vue').Ref<Array<{name:string,path:string}>>} */
const characterRefs = ref([])
/** @type {import('vue').Ref<string[]>} */
const sceneRefs = ref([])
const uploadingKind = ref('')
  let fileInput = null

  // ── 参考图（复用 upload-reference：受控根 + 引用计数）────────────────────

function pickRefFile (kind) {
  uploadingKind.value = kind
  if (typeof document === 'undefined') return
  if (!fileInput) {
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/png,image/jpeg,image/webp'
    fileInput.style.display = 'none'
    if (document.body) document.body.appendChild(fileInput)
  }
  fileInput.onchange = () => {
    const file = fileInput.files && fileInput.files[0]
    fileInput.value = ''
    if (file) void uploadRefFile(kind, file)
  }
  fileInput.click()
}

/** 供测试与拖拽入口复用的上传路径（file 为浏览器 File 或 {name, dataUrl}） */
async function uploadRefFile (kind, file) {
  const api = feApi()
  if (!api) return fail(t('filmEngineering.auto.noDesktop'))
  const limit = kind === 'character' ? characterRefs.value.length : sceneRefs.value.length
  if (limit >= MAX_AUTO_REFS) return fail(t('filmEngineering.auto.refsFull', { max: MAX_AUTO_REFS }))
  try {
    const dataUrl = file.dataUrl || await readAsDataUrl(file)
    uploadingKind.value = kind
    const data = unwrap(await api.uploadReference({ dataUrl, kind }))
    const stored = data && (data.path || data.filePath)
    if (!stored) throw new Error(t('filmEngineering.auto.uploadNoPath'))
    if (kind === 'character') {
      const base = String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 20)
      characterRefs.value = characterRefs.value.concat([{ name: base || t('filmEngineering.auto.defaultCharName'), path: stored }])
    } else {
      sceneRefs.value = sceneRefs.value.concat([stored])
    }
    errorText.value = ''
  } catch (e) {
    fail((e && e.message) || String(e))
  } finally {
    uploadingKind.value = ''
  }
}

function readAsDataUrl (file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') return reject(new Error('FileReader unavailable'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function removeCharRef (index) {
  characterRefs.value = characterRefs.value.filter((_r, i) => i !== index)
}
function removeSceneRef (index) {
  sceneRefs.value = sceneRefs.value.filter((_p, i) => i !== index)
}

  // 注入的 <input type="file"> 由本模块负责回收（fileInput 归本模块所有；
  // 原先这行写在面板的 onBeforeUnmount 里，拆分后必须跟着变量走，否则元素泄漏在 DOM）
  onBeforeUnmount(() => {
    if (fileInput && fileInput.parentNode) fileInput.parentNode.removeChild(fileInput)
    fileInput = null
  })

  return {
    characterRefs, sceneRefs, uploadingKind,
    pickRefFile, uploadRefFile, readAsDataUrl, removeCharRef, removeSceneRef,
  }
}
