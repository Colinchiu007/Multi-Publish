<template>
  <div>
    <h1 style="margin-bottom:16px">设置</h1>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="菜单排序" name="menu-order">
        <el-card shadow="never">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <span>拖拽或点击箭头调整左侧菜单顺序，设置会自动保存。</span>
            <el-button @click="menuStore.reset()">恢复默认排序</el-button>
          </div>
          <el-table :data="visibleItems" row-key="path" style="width:100%">
            <el-table-column label="菜单项" min-width="240">
              <template #default="{ row }">
                <div style="display:flex;align-items:center;gap:10px">
                  <el-icon><component :is="row.icon" /></el-icon>
                  <span>{{ row.label }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="位置" width="120" align="center">
              <template #default="{ $index }">{{ $index + 1 }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }">
                <el-button link type="primary" :disabled="isFirst(row.path)" @click="menuStore.move(row.path, -1)">上移</el-button>
                <el-button link type="primary" :disabled="isLast(row.path)" @click="menuStore.move(row.path, 1)">下移</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMenuStore } from '../../stores/menu'

const activeTab = ref('menu-order')
const menuStore = useMenuStore()

const visibleItems = computed(() => menuStore.orderedItems.filter((item) => !item.adminOnly))

function isFirst(path) {
  const list = visibleItems.value.map((item) => item.path)
  return list.indexOf(path) === 0
}

function isLast(path) {
  const list = visibleItems.value.map((item) => item.path)
  return list.indexOf(path) === list.length - 1
}
</script>
