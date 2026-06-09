<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="background: #304156">
      <el-menu
        :default-active="currentRoute"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        router
        style="height: 100%; border-right: none"
      >
        <div style="padding: 20px; color: #fff; font-size: 18px; text-align: center; border-bottom: 1px solid #1f2d3d">
          📢 Multi-Publish
        </div>
        <el-menu-item index="/publish">
          <el-icon><Upload /></el-icon>
          <span>一键发布</span>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>统计看板</span>
        </el-menu-item>
        <el-menu-item index="/accounts">
          <el-icon><User /></el-icon>
          <span>账号管理</span>
        </el-menu-item>
        <el-menu-item index="/">
          <el-icon><InfoFilled /></el-icon>
          <span>关于</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main style="background: #f0f2f5; padding: 24px">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Upload, User, InfoFilled, DataAnalysis } from '@element-plus/icons-vue'

const route = useRoute()
const currentRoute = computed(() => route.path)
</script>

<style>
body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
</style>