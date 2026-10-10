import accountsCloudSyncEn from './accounts-cloud-sync/en'
import identityDiagnosticsEn from './identity-diagnostics/en'
import signerEn from './signer/en'
import tabsEn from './tabs/en'
import commonEn from './common/en'
import loginGateEn from './login-gate/en'
import providerCrudEn from './provider-crud/en'
import publishDraftsEn from './publish-drafts/en'
import navEn from './nav/en'
import tabBarEn from './tab-bar/en'
import memberCenterEn from './member-center/en'
import collectionEn from './collection/en'
import createEn from './create/en'
import story2videoEn from './story2video/en'
import pipelinesEn from './pipelines/en'
import dashboardEn from './dashboard/en'
import promptEvalEn from './prompt-eval/en'
import homeEn from './home/en'
import publishPageEn from './publish-page/en'
import accountsPageEn from './accounts-page/en'
import modelProvidersEn from './model-providers/en'
import stageProgressEn from './stage-progress/en'
import filmEngineeringEn from './film-engineering/en'
import rewritePageEn from './rewrite-page/en'
import viralAnalysisEn from './viral-analysis/en'
import hotTopicsEn from './hot-topics/en'
import automationEn from './automation/en'
import videoCloneEn from './video-clone/en'
import userErrorsEn from './user-errors/en'
import calendarPageEn from './calendar-page/en'
import publishHistoryEn from './publish-history/en'
import publishTypeEn from './publish-type/en'
import videoConfigEn from './video-config/en'
import pipelineSelectorEn from './pipeline-selector/en'
import errorDialogEn from './error-dialog/en'
import rewriteEngineEn from './rewrite-engine/en'
import autoPipelineEn from './auto-pipeline/en'
import commentsEn from './comments/en'
import intelligenceEn from './intelligence/en'
import tagSuggestEn from './tag-suggest/en'
import updateEn from './update/en'
import perfInsightsEn from './perf-insights/en'
import publishDestinationEn from './publish-destination/en'
import emptyStatesEn from './empty-states/en'
import contentCategoriesEn from './content-categories/en'
import copyLibraryEn from './copy-library/en'
import publishEn from './publish/en'
import accountsEn from './accounts/en'
import projectLibraryEn from './project-library/en'
import onboardingEn from './onboarding/en'
import sidebarEn from './sidebar/en'
import settingsEn from './settings/en'
import historyPageEn from './history-page/en'

export default {
  signer: { ...signerEn },
  tabs: { ...tabsEn },
  common: { ...commonEn },
  loginGate: { ...loginGateEn },
  providerCrud: { ...providerCrudEn },
  publishDrafts: { ...publishDraftsEn },
  nav: { ...navEn },
  tabBar: { ...tabBarEn },
  sidebar: { ...sidebarEn },
  copyLibrary: { ...copyLibraryEn },
  publish: { ...publishEn },
  accounts: { ...accountsEn },
  projectLibrary: { ...projectLibraryEn },
  onboarding: { ...onboardingEn },
  settings: { ...settingsEn },
  create: { ...createEn },
  // Runtime progress copy (CreateView formatDuration / elapsed named interpolation; missing keys fixed 2026-08-10)
  story2video: { ...story2videoEn },
  pipelines: { ...pipelinesEn },
  dashboard: { ...dashboardEn },
  promptEval: { ...promptEvalEn },
  home: { ...homeEn },
  publishPage: { ...publishPageEn },
  accountsPage: { ...accountsPageEn },
  calendarPage: { ...calendarPageEn },
  historyPage: { ...historyPageEn },
  publishHistory: { ...publishHistoryEn },
  publishType: { ...publishTypeEn },
  videoClone: { ...videoCloneEn },
  modelProviders: { ...modelProvidersEn },
  // i18n-sync-hardening (2026-08-13): single source for user-facing-error.js copy
  userErrors: { ...userErrorsEn },
  videoConfig: { ...videoConfigEn },
  pipelineSelector: { ...pipelineSelectorEn },
  errorDialog: { ...errorDialogEn },
  stageProgress: { ...stageProgressEn },
  filmEngineering: { ...filmEngineeringEn },

  collection: { ...collectionEn },
  rewriteEngine: { ...rewriteEngineEn },
  autoPipeline: { ...autoPipelineEn },
  comments: { ...commentsEn },
  intelligence: { ...intelligenceEn },

  tagSuggest: { ...tagSuggestEn },

  memberCenter: { ...memberCenterEn },
knowledgeBase: {
    title: 'Knowledge Base',
    empty: {
      viral: {
        title: 'No viral content yet',
        message: 'Collect or add viral content to manage it and run pattern analysis here',
        action: 'Add viral content',
      },
      personal: {
        title: 'No knowledge yet',
        message: 'Add personal knowledge so creation can reuse your own writing style',
        action: 'Add Content',
      },
    },
    tabViral: 'Viral Library',
    tabPattern: 'Pattern Analysis',
    patternSubtitle: 'Viral pattern cards — structured expression patterns extracted by LLM (hook/emotion/narrative/CTA/quotes/title formula)',
    patternFilterAll: 'All statuses',
    patternStatusPending: 'Analyzing',
    patternStatusDone: 'Done',
    patternStatusFailed: 'Failed',
    patternRefresh: 'Refresh',
    patternColId: 'Item',
    patternColStatus: 'Status',
    patternColHook: 'Hook Type',
    patternColCurve: 'Emotion Curve',
    patternColNarrative: 'Narrative',
    patternColCta: 'CTA Style',
    patternColFormula: 'Title Formula',
    patternColAttempts: 'Attempts',
    patternColActions: 'Actions',
    patternDetail: 'Detail',
    patternDetailTitle: 'Pattern Card Detail',
    patternHookAnalysis: 'Hook Analysis',
    patternGoldenQuotes: 'Golden Quotes',
    patternLastError: 'Last Error',
    patternReextract: 'Re-analyze',
    patternReextractQueued: 'Queued for re-analysis',
    patternReextractFailed: 'Re-analysis failed, please retry later',
    patternHook_suspense: 'Suspense',
    patternHook_conflict: 'Conflict',
    patternHook_counterintuitive: 'Counterintuitive',
    patternHook_question: 'Question',
    patternHook_story: 'Story',
    patternHook_data: 'Data',
    patternHook_empathy: 'Empathy',
    patternHook_other: 'Other',
    patternCurve_rise: 'Rising',
    patternCurve_fall: 'Falling',
    patternCurve_rise_fall: 'Rise then Fall',
    patternCurve_fall_rise: 'Fall then Rise',
    patternCurve_wave: 'Wave',
    patternCurve_flat: 'Flat',
    patternNarrative_total_subtotal: 'Total-Sub-Total',
    patternNarrative_problem_solution: 'Problem-Solution',
    patternNarrative_chronological: 'Chronological',
    patternNarrative_contrast: 'Contrast',
    patternNarrative_list: 'List',
    patternNarrative_story_lesson: 'Story+Lesson',
    patternCta_question: 'Question CTA',
    patternCta_challenge: 'Challenge',
    patternCta_resource: 'Resource',
    patternCta_follow: 'Follow',
    patternCta_comment: 'Comment',
    patternCta_none: 'No CTA',
    viralSubtitle: 'Viral content library - collect and manage trending content',
    personalSubtitle: 'Personal knowledge assets - manage IP persona, background, experience, opinions',
    filesSelected: 'Selected {count} files',
    batchImportComingSoon: 'Batch import coming soon',
    exportComingSoon: 'Feishu export coming soon, please configure Feishu API in settings first',
    tabPersonal: 'Personal Knowledge',
    patternQueueBacklog: 'Pattern extraction queued ({n} deferred); analysis is unaffected',
    engagementRecrawled: 'Engagement auto-updated via re-crawl',
    addViral: 'Add Viral',
    addViralManual: 'Add Viral Manually',
    collectByLink: 'Collect via Link',
    addPersonal: 'Add Content',
    batchImport: 'Batch Import',
    exportToFeishu: 'Export to Feishu',
    searchPlaceholder: 'Search...',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this item? This cannot be undone.',
    addSuccess: 'Added to knowledge base',
    updateSuccess: 'Updated',
    deleteSuccess: 'Deleted',
    noFeishuConfig: 'Feishu API is not configured. Please add App ID and App Secret in the Feishu API tab of Settings.',
    colIndex: '#',
    colTitle: 'Title',
    colCover: 'Cover',
    colAuthor: 'Author',
    colLink: 'Link',
    colContent: 'Content',
    colTags: 'Tags',
    colLikes: 'Likes',
    colCollections: 'Collections',
    colComments: 'Comments',
    colRatio: 'L/C Ratio',
    colPublishedAt: 'Published At',
    colPlatform: 'Platform',
    colActions: 'Actions',
    colCategory: 'Category',
    catPersonalIpPersona: 'IP Persona',
    catPersonalBackground: 'Background',
    catPersonalStories: 'Stories',
    catGrowthExperience: 'Growth',
    catEmotionalExperience: 'Emotional',
    catWorkExperience: 'Work',
    catProjectExperience: 'Projects',
    catPersonalOpinions: 'Opinions',
    catFamilyStories: 'Family',
    formTitle: 'Title',
    formContent: 'Content',
    formLink: 'Link',
    formAuthor: 'Author',
    formPlatform: 'Platform',
    formTags: 'Tags',
    formCategory: 'Category',
    contentRequired: 'Content is required',
    categoryRequired: 'Please select a category',
    useViralLibrary: 'Use Viral Library',
    useViralLibraryHint: 'Extract style patterns from viral library',
    usePersonalKnowledge: 'Use Personal Knowledge',
    usePersonalKnowledgeHint: 'Reference personal knowledge materials',
    addToViral: 'Add to Viral Library',
    addedToViral: 'Added to Viral Library',
    feishuApi: 'Feishu API',
    feishuInstructions: 'Instructions',
    feishuShow: 'Show',
    feishuHide: 'Hide',
    feishuTesting: 'Testing...',
    feishuSaving: 'Saving...',
    feishuInstrLine1: '1. Visit open.feishu.cn to create an internal app',
    feishuInstrLine2: '2. Get App ID and App Secret under Credentials & Basic Info',
    feishuInstrLine3: '3. Enable docx:document and drive:drive permissions',
    feishuInstrLine4: '4. Publish the app and get admin approval',
    feishuInstrLine5: '5. Fill in App ID and App Secret above and save',
    feishuAppId: 'App ID',
    feishuAppSecret: 'App Secret',
    feishuTestConnection: 'Test Connection',
    feishuTestSuccess: 'Connection successful',
    feishuTestFailed: 'Connection failed',
    feishuSaveConfig: 'Save Config',
    feishuSaveSuccess: 'Feishu config saved',
    feishuExportConfirm: 'Export all content to Feishu cloud document?',
    feishuExportSuccess: 'Export succeeded',
    batchSuccess: 'Imported {count} files',
    fileTooBig: 'File too large (max 5MB)',
    fileNotSupported: 'Unsupported file format (.txt .md .doc .docx only)',
    loadFailed: 'Failed to load, please retry',
    fileTooLarge: 'File {name} exceeds 5MB limit',
    importResult: 'Import complete: {total} files, {succeeded} succeeded, {failed} failed',
    importFailed: 'File import failed',
    exportTitlePrompt: 'Enter Feishu document title',
    exportTitleDefault: 'Knowledge Base Export',
    exportSuccess: 'Export successful, Feishu doc ID: {docId}, {count} items',
    exportFailed: 'Feishu export failed',
  },

  // Auto update (sidebar "new version" entry + global result notices)
  // Messages needing interpolation are Message Functions: CSP forbids runtime compilation (see src/i18n/index.js)
  update: { ...updateEn },

  perfInsights: { ...perfInsightsEn },

  // ── Rewrite page ──
  rewritePage: { ...rewritePageEn },

  // ── Viral analysis page (viral-rewrite-integration) ──
  viralAnalysis: { ...viralAnalysisEn },

  // ── Publish destination modal ──
  publishDestination: { ...publishDestinationEn },

  // ── Hot topics page ──
  // ── EmptyState centralized copy (migrated from inline hardcode) ──
  emptyStates: { ...emptyStatesEn },

  // ── Unified content categories (2026-10-03): built-in fallback names ──
  contentCategories: { ...contentCategoriesEn },

  hotTopics: { ...hotTopicsEn },

  // ── Automation module (2026-10-03): scheduled / app-start triggered tasks ──
  automation: { ...automationEn },

  // ── App shell (App.vue) global toasts (2026-10-09) ──────────────────
  // App-level listener for scheduler:dispatch-failed: when a scheduled task
  // reaches its time but fails to enqueue, an error toast pops no matter which
  // page the user is on. Previously only the calendar page listened — users who
  // navigated away never learned the task never went out.
  appShell: {
    // Distinct from calendarPage.scheduleDispatchFailed (which shows inside the
    // calendar page and refreshes it); this is the global fallback and does not
    // mention re-scheduling — the user may not be in a scheduling context.
    scheduleDispatchFailed: 'Scheduled publish did not go out: {platform} {reason}. See Publish History for details.',
  },

  podcast: {
    pageTitle: 'Podcast RSS Channel',
    picker: {
      sectionTitle: 'Podcast channels',
      current: 'Current channel',
      empty: 'No channel yet. Create one to get started.',
      namePlaceholder: 'Channel name',
      create: 'New channel',
      setDefault: 'Set as default',
      created: 'Channel created',
      renamed: 'Channel renamed',
      defaultSet: 'Default channel updated',
      switched: 'Channel switched',
      switchFailed: 'Could not switch channel. Please try again.',
      nameRequired: 'Enter a channel name.',
      quotaHint: 'This channel holds {count} of {cap} episodes; delete some before adding more.',
      migrationConflict: 'Channel migration is incomplete: two different local channel configs were found. Choose which to keep.',
      migrationError: 'Channel migration failed midway. Writing is blocked; please retry or contact support.',
      keepExisting: 'Keep current data',
      keepLegacy: 'Keep original data',
      migrationResolved: 'Migration conflict resolved',
    },
    pageSubtitle: 'Podcast inclusion in RSS aggregators (Xiaoyuzhou / Apple / Spotify): configure the channel once → add episodes one by one → build & self-check the feed → submit the feed URL to each directory',
    channel: {
      sectionTitle: 'Channel Settings',
      sectionHint: 'Channel metadata is configured once and embedded into the feed. Validation results are shown by the feed self-check.',
      fieldTitle: 'Channel Title',
      fieldSubtitle: 'Subtitle',
      fieldLink: 'Site URL',
      fieldDescription: 'Channel Description',
      fieldLanguage: 'Language',
      fieldAuthor: 'Author / Host',
      fieldOwnerName: 'Owner Name',
      fieldOwnerEmail: 'Owner Email',
      ownerEmailPrivacy: 'This email is published in the RSS feed (written to itunes:email) and visible to aggregators and subscribers.',
      fieldExplicit: 'Rating',
      fieldEpisodeType: 'Update Order',
      fieldCoverUrl: 'Cover URL',
      fieldCoverSize: 'Cover Size',
      fieldCategory: 'Category',
      fieldSubCategories: 'Subcategories',
      categoryPlaceholder: 'Select a top-level category',
      subCategoriesHint: 'Optional, at most one (aggregators classify by "Top/Sub"); changing the top category clears the selected subcategory',
      subCategoryNone: 'No subcategory',
      fieldAudioSource: 'Audio Source',
      save: 'Save Channel',
      saved: 'Channel saved',
    },
    explicit: {
      yes: 'Explicit (adult content)',
      no: 'Not explicit',
      clean: 'Clean',
    },
    channelFeedType: {
      episodic: 'Episodic (auto-latest order)',
      serial: 'Serial (chronological)',
    },
    audioSource: {
      url: 'External URL (https audio link)',
      oss: 'Managed upload (object storage)',
    },
    episodeType: {
      full: 'Full',
      trailer: 'Trailer',
      bonus: 'Bonus',
    },
    episodes: {
      sectionTitle: 'Episodes',
      empty: 'No episodes yet. Click "Add Episode" to create the first one.',
      add: 'Add Episode',
      addTitle: 'Add Episode',
      editTitle: 'Edit Episode',
      edit: 'Edit',
      delete: 'Delete',
      confirmDelete: 'Delete this episode?',
      deleteYes: 'Confirm',
      deleteNo: 'Cancel',
      save: 'Save Episode',
      saved: 'Episode saved',
      deleted: 'Episode deleted',
      cancel: 'Close',
      fieldTitle: 'Episode Title',
      fieldDescription: 'Episode Description',
      fieldAudioUrl: 'Audio URL (https)',
      fieldLocalFilePath: 'Local Audio File Path',
      fieldDurationSec: 'Duration (sec)',
      fieldSizeBytes: 'Size (bytes)',
      fieldPubDate: 'Publish Date (ISO)',
      fieldExplicit: 'Rating',
      fieldEpisodeType: 'Type',
      fieldGuid: 'GUID',
      explicitInherit: 'Inherit from channel',
      guidHint: 'Unique identifier, must not be empty; auto-generated for new episodes',
    },
    publish: {
      sectionTitle: 'Build & Self-check',
      sectionHint: 'Merges channel settings and episodes into an RSS file under the user data directory; submit the feed URL to directories only after the self-check passes.',
      buildFeed: 'Build Feed',
      verifyFeed: 'Verify Feed',
      feedBuilt: 'Feed built: {count} episode(s)',
      feedBuiltNotify: 'Feed built successfully',
      copyPath: 'Copy File Path',
      copied: 'Path copied',
      copyFailed: 'Copy failed, please copy the path manually',
      verifyPassed: 'Self-check passed: {count} episode(s)',
      verifyFailed: 'Self-check found {count} issue(s)',
    },
    endpoints: {
      sectionTitle: 'Directory Submission Guide',
      sectionHint: 'RSS aggregators have no publish API. Submit your feed URL manually following each directory guide; the first Xiaoyuzhou inclusion needs to wait for its crawl cycle.',
      manualFirstSubmit: 'Manual first submission required',
      submitLink: 'Open submission page',
      docLink: 'Official docs',
      noSubmitUrl: 'No public submission URL; follow the guide steps',
      empty: 'Failed to load the distribution endpoint catalog',
    },
    errors: {
      PODCAST_IPC_UNAVAILABLE: 'Podcast service is unavailable (not signed in, license not activated, or main-process channel not mounted)',
      PODCAST_IPC_EXCEPTION: 'Podcast service call failed, please retry',
      PODCAST_PAYLOAD_NOT_SERIALIZABLE: 'Form data could not be serialized, please check and retry',
      PODCAST_FEED_INVALID: 'Feed validation failed. Fix the issues below first',
      CHANNEL_MISSING: 'Channel configuration is missing',
      CHANNEL_TITLE_REQUIRED: 'Channel title is required',
      CHANNEL_TITLE_TOO_LONG: 'Channel title exceeds the length limit',
      CHANNEL_DESC_REQUIRED: 'Channel description is required',
      CHANNEL_DESC_TOO_LONG: 'Channel description exceeds the length limit',
      CHANNEL_SUBTITLE_TOO_LONG: 'Channel subtitle exceeds the length limit',
      CHANNEL_LANGUAGE_INVALID: 'Language must look like zh-CN / en-US',
      CHANNEL_COVER_REQUIRED: 'Cover URL is required',
      CHANNEL_COVER_NOT_HTTPS: 'Cover must be an absolute https URL',
      CHANNEL_COVER_SIZE_UNKNOWN: 'Cover size (e.g. 3000x3000) is required for validation',
      CHANNEL_COVER_NOT_SQUARE: 'Cover must be square',
      CHANNEL_COVER_SIZE_OUT_OF_RANGE: 'Cover side length is out of the allowed range (1400–3000)',
      CHANNEL_LINK_NOT_HTTPS: 'Site URL must be an absolute https URL',
      CHANNEL_AUTHOR_REQUIRED: 'Author / host name is required',
      CHANNEL_OWNER_EMAIL_INVALID: 'Owner email format is invalid',
      CHANNEL_EXPLICIT_INVALID: 'Channel rating must be yes / no / clean',
      CHANNEL_FEED_TYPE_INVALID: 'Feed type must be episodic / serial',
      CHANNEL_CATEGORY_REQUIRED: 'A top-level category is required',
      CHANNEL_CATEGORY_UNKNOWN: 'Unknown top-level category',
      CHANNEL_SUBCATEGORY_UNKNOWN: 'Unknown subcategory',
      CHANNEL_CATEGORY_TOO_DEEP: 'Category supports at most two levels',
      EPISODE_MISSING: 'Episode data is missing',
      EPISODE_TITLE_REQUIRED: 'Episode title is required',
      EPISODE_TITLE_TOO_LONG: 'Episode title exceeds the length limit',
      EPISODE_DESC_TOO_LONG: 'Episode description exceeds the length limit',
      EPISODE_SUBTITLE_TOO_LONG: 'Episode subtitle exceeds the length limit',
      EPISODE_AUDIO_REQUIRED: 'Audio is missing: provide an https URL or configure hosting',
      EPISODE_AUDIO_NOT_HTTPS: 'Audio must be an absolute https URL',
      EPISODE_HOSTING_NOT_CONFIGURED: 'Only a local file exists; managed upload is not configured, so no public audio URL can be produced',
      EPISODE_DURATION_INVALID: 'Duration must be an integer number of seconds within the allowed range',
      EPISODE_SIZE_INVALID: 'Size in bytes must be a positive integer',
      EPISODE_SIZE_REQUIRED: 'Audio size in bytes (enclosure length) is required',
      EPISODE_EXPLICIT_INVALID: 'Episode rating must be yes / no / clean',
      EPISODE_TYPE_INVALID: 'Episode type must be full / trailer / bonus',
      EPISODE_PUBDATE_INVALID: 'Publish date could not be parsed',
      EPISODE_COVER_NOT_HTTPS: 'Episode cover must be an absolute https URL',
      EPISODE_MIME_INVALID: 'Audio MIME type is not supported',
      EPISODE_GUID_TOO_LONG: 'GUID is too long',
      EPISODE_NUMBER_INVALID: 'Episode number must be a positive integer',
      EPISODE_SEASON_INVALID: 'Season number must be a positive integer',
      EPISODES_EMPTY: 'No episodes yet: the feed requires at least one episode',
      EPISODES_TOO_MANY: 'Episode count exceeds the limit',
      EPISODE_DUPLICATE: 'Duplicate guid or audio URL exists',
      FEED_NO_ITEMS: 'The feed contains no episodes',
      FEED_MISSING_ITUNES_NS: 'The feed is missing the itunes namespace',
      FEED_MISSING_XML_DECL: 'The feed is missing the XML declaration',
      ENCLOSURE_MISSING: 'An episode has no enclosure',
      ENCLOSURE_NOT_HTTPS: 'An enclosure is not an https URL',
      ENCLOSURE_UNREACHABLE: 'Audio URL is unreachable; check the hosting or whether the link expired',
      ENCLOSURE_TYPE_MISMATCH: 'The enclosure does not point to an audio resource',
      ENCLOSURE_LENGTH_MISMATCH: 'Declared byte size does not match the actual length',
      DURATION_MISSING: 'An episode is missing its duration',
      fallback: 'Unknown issue ({code})',
    },
  },

}
