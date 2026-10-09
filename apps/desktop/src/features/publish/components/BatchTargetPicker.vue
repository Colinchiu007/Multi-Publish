<template>
  <!-- 批量条目「发布目标」：平台勾选 + 各平台账号勾选 + 小红书仅存草稿提示。
       抽成组件的原因：Publish.vue 在「点名还账」清单内（零增长容差），
       这块 30+ 行模板与视图的其它逻辑无耦合。 -->
  <div class="cohere-form-item">
    <label class="cohere-form-label">{{ t('publishPage.publishTarget') }}</label>
    <div class="batch-platform-targets">
      <label v-for="p in platforms" :key="p.id" class="batch-platform-option">
        <input
          type="checkbox"
          :value="p.id"
          :checked="selectedPlatforms.includes(p.id)"
          class="coral-check"
          @change="emit('toggle-platform', p.id)"
        />
        {{ p.label }}
      </label>
      <template v-for="p in platforms" :key="p.id + '-accounts'">
        <div v-if="selectedPlatforms.includes(p.id) && getAccounts(p.id).length > 0" class="batch-account-targets">
          <span class="batch-account-label">{{ p.label }}{{ t('publishPage.accountSuffix') }}</span>
          <label v-for="account in getAccounts(p.id)" :key="account.id" class="batch-account-option">
            <input
              type="checkbox"
              :checked="isAccountSelected(p.id, account.id)"
              @change="emit('toggle-account', p.id, account.id)"
            />
            <span>{{ resolveAccountName(account, p.label) }}</span>
          </label>
        </div>
      </template>
    </div>
    <!-- 小红书仅存草稿（用户硬约束）：批量模式按条目给出，避免整批里混着一条「以为已发布」 -->
    <p v-if="selectedPlatforms.includes('xiaohongshu')" class="no-title-hint" :data-testid="`batch-xhs-draft-only-${index}`">
      {{ t('publishPage.xhsDraftOnlyHint') }}
    </p>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineProps({
  /** 平台目录（含 label） */
  platforms: { type: Array, default: () => [] },
  /** 本条已选平台 id 数组（**就地变异**：与既有 v-model="a.platforms" 同语义，父层持有真源） */
  selectedPlatforms: { type: Array, default: () => [] },
  /** 条目序号（data-testid 用） */
  index: { type: Number, default: 0 },
  /** 平台 → 账号列表 */
  getAccounts: { type: Function, required: true },
  /** (platformId, accountId) → 是否勾选 */
  isAccountSelected: { type: Function, required: true },
  /** (account, platformLabel) → 展示名 */
  resolveAccountName: { type: Function, required: true },
})
const emit = defineEmits(['toggle-platform', 'toggle-account'])
const { t } = useI18n()
</script>
