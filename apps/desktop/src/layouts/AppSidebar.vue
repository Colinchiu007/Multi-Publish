<template>
  <!-- 左侧平台侧栏 -->
  <aside class="cohere-sidebar">
    <div class="cohere-sidebar-header">
      <span>平台账号</span>
      <button class="sidebar-add-btn" @click="$router.push('/accounts')">+</button>
    </div>
    <div class="cohere-sidebar-search">
      <input type="text" placeholder="搜索平台..." v-model="platformSearch" />
    </div>
    <div class="cohere-sidebar-list">
      <div
        v-for="p in filteredPlatforms"
        :key="p"
        class="cohere-platform-item"
        :class="{ active: activePlatform === p }"
        @click="activePlatform = p"
      >
        <div class="platform-icon"><PlatformIcon :platform="p" size="sm" /></div>
        <div style="flex:1;min-width:0">
          <div class="platform-name">{{ platformMeta[p].label }}</div>
          <div class="platform-account">
            <template v-if="getAccountsForPlatform(p).length > 1">
              <select
                class="account-switcher"
                :value="(getDefaultAccount(p) || {}).id || ''"
                @click.stop
                @change.stop="switchAccount(p, $event.target.value)"
              >
                <option v-for="a in getAccountsForPlatform(p)" :key="a.id" :value="a.id">
                  {{ a.name || a.id?.slice(0,8) }}
                </option>
              </select>
            </template>
            <template v-else>
              {{ getAccountText(p) }}
            </template>
          </div>
        </div>
        <span class="platform-status" :class="getStatusClass(p)"></span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import PlatformIcon from '@/components/PlatformIcon.vue'
import { onMounted } from 'vue'
import { usePlatformAccounts, platformMeta } from '@/composables/usePlatformAccounts'

const {
  platformSearch,
  activePlatform,
  filteredPlatforms,
  loadAccounts,
  switchAccount,
  getDefaultAccount,
  getAccountText,
  getStatusClass,
  getAccountsForPlatform,
} = usePlatformAccounts()

onMounted(() => {
  loadAccounts()
})
</script>

<style>
/* 侧栏账号切换器 */
.account-switcher {
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--text-muted));
  font-size: 11px;
  width: 100%;
  cursor: pointer;
  outline: none;
  padding: 0;
  appearance: auto;
}
</style>
