<template>
  <UiModal :visible="visible" title="分组管理" size="md" @close="$emit('close')">
    <div class="group-manager">
      <div class="group-create">
        <input
          v-model="newGroupName"
          data-testid="new-group-name"
          type="text"
          placeholder="输入分组名称"
          maxlength="30"
          @keyup.enter="createGroup"
        >
        <button data-testid="create-group" type="button" :disabled="!newGroupName.trim()" @click="createGroup">
          <Plus />创建
        </button>
      </div>

      <div v-if="groups.length === 0" class="empty-groups">暂无自定义分组</div>
      <div v-else class="group-list">
        <section v-for="group in groups" :key="group.id" class="group-section">
          <header>
            <div>
              <h3>{{ group.name }}</h3>
              <span>{{ memberCount(group) }} / {{ eligibleAccounts(group).length }} 个账号</span>
            </div>
            <button type="button" class="delete-group" title="删除分组" aria-label="删除分组" @click="$emit('delete', group.id)">
              <Delete />
            </button>
          </header>
          <div class="member-list">
            <label v-for="account in eligibleAccounts(group)" :key="account.id" class="member-row">
              <input
                :data-testid="`group-${group.id}-account-${account.id}`"
                type="checkbox"
                :checked="(group.accountIds || []).includes(account.id)"
                @change="$emit('toggle-account', group.id, account.id)"
              >
              <span class="member-name">{{ account.account_name || account.name || '未命名账号' }}</span>
              <span class="member-platform">{{ platformLabel(account.platform) }}</span>
            </label>
          </div>
        </section>
      </div>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="$emit('close')">关闭</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import UiButton from '@/components/UiButton.vue'
import UiModal from '@/components/UiModal.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] },
  accounts: { type: Array, default: () => [] },
  platformLabel: { type: Function, default: value => value },
})
const emit = defineEmits(['create', 'delete', 'toggle-account', 'close'])
const newGroupName = ref('')

function eligibleAccounts (group) {
  return props.accounts.filter(account => !group.platformFilter || account.platform === group.platformFilter)
}

function memberCount (group) {
  const ids = new Set(group.accountIds || [])
  return eligibleAccounts(group).filter(account => ids.has(account.id)).length
}

function createGroup () {
  const name = newGroupName.value.trim()
  if (!name) return
  emit('create', name)
  newGroupName.value = ''
}
</script>

<style scoped>
.group-manager { display: flex; flex-direction: column; gap: 14px; }
.group-create { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.group-create input {
  min-height: 36px;
  padding: 7px 10px;
  border: 1px solid var(--border, #dedee5);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.group-create input:focus { border-color: #5048e5; box-shadow: 0 0 0 2px rgba(80, 72, 229, 0.1); }
.group-create button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 0;
  border-radius: 6px;
  background: #5048e5;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.group-create button:disabled { opacity: 0.45; cursor: not-allowed; }
.group-create svg { width: 15px; height: 15px; }
.empty-groups { padding: 32px 0; text-align: center; color: var(--muted, #85858f); font-size: 13px; }
.group-list { display: flex; flex-direction: column; gap: 10px; max-height: 420px; overflow: auto; }
.group-section { border: 1px solid var(--border-light, #e8e8ec); border-radius: 7px; overflow: hidden; }
.group-section header { display: flex; align-items: center; justify-content: space-between; padding: 9px 11px; background: #f8f8fa; }
.group-section h3 { margin: 0; color: #303039; font-size: 13px; line-height: 20px; }
.group-section header span { color: var(--muted, #85858f); font-size: 11px; }
.delete-group { width: 28px; height: 28px; display: grid; place-items: center; border: 0; background: transparent; color: #c43d4d; cursor: pointer; }
.delete-group svg { width: 15px; height: 15px; }
.member-list { display: flex; flex-direction: column; }
.member-row { min-height: 36px; display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 8px; padding: 6px 11px; border-top: 1px solid #efeff2; font-size: 13px; cursor: pointer; }
.member-row input { accent-color: #5048e5; }
.member-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.member-platform { color: var(--muted, #85858f); font-size: 12px; }
</style>
