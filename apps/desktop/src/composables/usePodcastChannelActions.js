/**
 * usePodcastChannelActions.js — 播客页的「表单态 + 提交动作」
 *
 * 为什么从 PodcastChannelView.vue 拆出来（逐文件行数门禁 NEW_OVER_LIMIT）：
 * 视图的职责是**排版与绑定**；「保存前怎么组载荷、失败时把哪一批校验码留在界面上、删除要二次确认」
 * 是可独立测试的页面逻辑。留在 .vue 里时它只能靠 mount 整页才能被覆盖，
 * 而拆出来后可直接对行为断言——模板与样式一行不动，像素基线因此不重取。
 *
 * api 由页面级 composable 提供；本模块不自建第二份状态，也不越过 api 直接碰 IPC 桥（单轨制）。
 */
import { computed, ref } from 'vue'

import { channelPayloadToForm, subCategoriesOf } from './usePodcastChannel'
import { writeClipboard } from '@/utils/clipboard'

export function createPodcastChannelActions (deps) {
  const { api, t, notifySuccess, notifyError } = deps
  const {
    channels,
    activeChannelId,
    migrationStatus,
    migrationConflicts,
    channelListError,
    channelCap,
    channelCount,
    switchingChannel,
    createChannel,
    renameChannel,
    setDefaultChannel,
    resolveMigration,
    switchChannel,
    loadChannels,
    channel,
    savingChannel,
    channelError,
    episodes,
    episodesError,
    savingEpisode,
    feedResult,
    buildingFeed,
    verifyResult,
    verifying,
    endpoints,
    endpointsError,
    channelIssues,
    loadChannel,
    loadEpisodes,
    loadEndpoints,
    saveChannel,
    saveEpisode,
    removeEpisode,
    buildFeed,
    verifyFeed,
    makeEpisodeDraft,
    makeChannelDraft,
    durationText,
    errorText,
    issueText,
  } = api

// 频道目录的本地状态：名字与错误只在这里出现一次，模板不再自造第二份判据
const newChannelName = ref('')
const renameName = ref('')
const pickerError = ref('')

async function onCreateChannel () {
  pickerError.value = ''
  const name = String(newChannelName.value || '').trim()
  if (!name) { pickerError.value = t('podcast.picker.nameRequired'); return }
  const res = await createChannel(name)
  if (res && res.ok === false) { pickerError.value = errorText(res.code); return }
  newChannelName.value = ''
  notifySuccess(t('podcast.picker.created'))
  await loadChannel()
  await loadEpisodes()
}

async function onSetDefault () {
  pickerError.value = ''
  const res = await setDefaultChannel(activeChannelId.value)
  if (res && res.ok === false) { pickerError.value = errorText(res.code); return }
  notifySuccess(t('podcast.picker.defaultSet'))
}

async function onRenameChannel () {
  pickerError.value = ''
  const name = renameName.value.trim()
  if (!name) { pickerError.value = t('podcast.picker.nameRequired'); return }
  const res = await renameChannel(activeChannelId.value, name)
  if (res && res.ok === false) { pickerError.value = errorText(res.code); return }
  notifySuccess(t('podcast.picker.renamed'))
  renameName.value = ''
}

// 处置迁移冲突是**不可逆**动作（一份留、一份丢），成功必须出声：静默收口让用户以为没生效
async function onResolveMigration (direction) {
  pickerError.value = ''
  const res = await resolveMigration(direction)
  if (res && res.ok === false) { pickerError.value = errorText(res.code); return }
  notifySuccess(t('podcast.picker.migrationResolved'))
}

async function onSwitchChannel () {
  pickerError.value = ''
  const res = await switchChannel(activeChannelId.value)
  if (res && res.ok === false) { pickerError.value = t('podcast.picker.switchFailed'); return }
  notifySuccess(t('podcast.picker.switched'))
}

const channelForm = ref(makeChannelDraft())
const editingEpisode = ref(null)
const editingIsNew = ref(true)
const pendingDeleteId = ref('')
const episodeFormError = ref('')
const channelSaveIssues = ref([])
const episodeSaveIssues = ref([])

const availableSubCategories = computed(() => subCategoriesOf(channelForm.value.category))
const nonChannelIssues = computed(() => {
  const all = verifyResult.value && verifyResult.value.issues ? verifyResult.value.issues : []
  return all.filter((it) => !String((it && it.code) || '').startsWith('CHANNEL_'))
})

function applyChannelToForm (loaded) {
  return channelPayloadToForm(loaded)
}

function onCategoryChange () {
  channelForm.value.subCategory = ''
}

async function onSaveChannel () {
  const res = await saveChannel({ ...toFormPayload(channelForm.value) })
  if (res && res.ok) {
    channelSaveIssues.value = []
    notifySuccess(t('podcast.channel.saved'))
  } else {
    // F1 验收：校验失败必须逐项展示引擎 issues（定位到字段），不能只报通用码
    channelSaveIssues.value = Array.isArray(res && res.issues) ? res.issues : []
    notifyError(errorText((res && res.code) || 'PODCAST_IPC_EXCEPTION'))
  }
}

/** 表单 → 频道载荷：空串的可选项不进载荷；显式枚举按合同键名透传 */
function toFormPayload (form) {
  const payload = { ...form }
  if (!payload.subtitle) delete payload.subtitle
  if (!payload.link) delete payload.link
  if (!payload.coverSize) delete payload.coverSize
  if (payload.explicit === '') delete payload.explicit
  return payload
}

function startNewEpisode () {
  editingEpisode.value = makeEpisodeDraft()
  editingIsNew.value = true
  episodeFormError.value = ''
  episodeSaveIssues.value = []
}

function startEditEpisode (ep) {
  editingEpisode.value = { ...ep, explicit: ep.explicit || '' }
  editingIsNew.value = false
  episodeFormError.value = ''
  episodeSaveIssues.value = []
}

function closeEpisodeForm () {
  editingEpisode.value = null
  episodeFormError.value = ''
}

async function onSaveEpisode () {
  const draft = editingEpisode.value
  if (!draft) return
  const payload = { ...draft }
  if (payload.explicit === '') delete payload.explicit
  if (!payload.localFilePath) delete payload.localFilePath
  if (!payload.audioUrl) delete payload.audioUrl
  if (payload.sizeBytes === '' || payload.sizeBytes == null) delete payload.sizeBytes
  const res = await saveEpisode(payload)
  if (res && res.ok) {
    episodeSaveIssues.value = []
    notifySuccess(t('podcast.episodes.saved'))
    closeEpisodeForm()
  } else {
    // F1 验收：单集校验失败逐项展示引擎 issues，通用码只进 toast
    episodeSaveIssues.value = Array.isArray(res && res.issues) ? res.issues : []
    episodeFormError.value = errorText((res && res.code) || 'PODCAST_IPC_EXCEPTION')
    notifyError(episodeFormError.value)
  }
}

async function confirmDeleteEpisode (id) {
  pendingDeleteId.value = ''
  const res = await removeEpisode(id)
  if (res && res.ok) notifySuccess(t('podcast.episodes.deleted'))
  else notifyError(errorText((res && res.code) || 'PODCAST_IPC_EXCEPTION'))
}

async function onBuildFeed () {
  const res = await buildFeed()
  if (res && res.ok) notifySuccess(t('podcast.publish.feedBuiltNotify'))
  else notifyError(errorText((res && res.code) || 'PODCAST_IPC_EXCEPTION'))
}

async function onVerifyFeed () {
  await verifyFeed()
}

async function onCopyFeedPath () {
  const path = feedResult.value && feedResult.value.path ? feedResult.value.path : ''
  if (!path) return
  try {
    await writeClipboard(path)
    notifySuccess(t('podcast.publish.copied'))
  } catch {
    notifyError(t('podcast.publish.copyFailed'))
  }
}

  return {
    newChannelName,
    renameName,
    pickerError,
    onCreateChannel,
    onSetDefault,
    onRenameChannel,
    onResolveMigration,
    onSwitchChannel,
    channelForm,
    editingEpisode,
    editingIsNew,
    pendingDeleteId,
    episodeFormError,
    channelSaveIssues,
    episodeSaveIssues,
    availableSubCategories,
    nonChannelIssues,
    applyChannelToForm,
    onCategoryChange,
    onSaveChannel,
    toFormPayload,
    startNewEpisode,
    startEditEpisode,
    closeEpisodeForm,
    onSaveEpisode,
    confirmDeleteEpisode,
    onBuildFeed,
    onVerifyFeed,
    onCopyFeedPath,
  }
}