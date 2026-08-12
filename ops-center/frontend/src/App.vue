<template>
  <el-container class="app-container">
    <el-aside v-if="authStore.isLoggedIn" width="220px" class="app-sidebar">
      <div class="logo">
        <el-icon :size="24"><Setting /></el-icon>
        <span>OpsCenter</span>
      </div>
      <el-menu
        :default-active="route.path"
        router
        background-color="#001529"
        text-color="#ffffffb3"
        active-text-color="#fff"
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/feature-flags">
          <el-icon><Switch /></el-icon>
          <span>功能开关</span>
        </el-menu-item>
<el-menu-item index="/scene-context-rules">
<el-icon><Setting /></el-icon>
<span>场景上下文规则</span>
</el-menu-item>
        <el-menu-item index="/runtime-flags">
          <el-icon><SwitchButton /></el-icon>
          <span>桌面端功能开关</span>
        </el-menu-item>
        <el-menu-item index="/secrets">
          <el-icon><Key /></el-icon>
          <span>Key 管理</span>
        </el-menu-item>
        <el-menu-item index="/platforms">
          <el-icon><Connection /></el-icon>
          <span>平台凭证</span>
        </el-menu-item>
        <el-menu-item index="/usage">
          <el-icon><DataLine /></el-icon>
          <span>模型用量</span>
        </el-menu-item>
        <el-menu-item index="/diagnostics">
          <el-icon><DataAnalysis /></el-icon>
          <span>创作诊断</span>
        </el-menu-item>
        <el-menu-item index="/publish-dashboard">
          <el-icon><TrendCharts /></el-icon>
          <span>发布数据</span>
        </el-menu-item>
        <el-menu-item index="/system-health">
          <el-icon><Monitor /></el-icon>
          <span>系统健康</span>
        </el-menu-item>
        <el-menu-item index="/licenses">
          <el-icon><Tickets /></el-icon>
          <span>许可证管理</span>
        </el-menu-item>
        <el-menu-item index="/redemption-codes">
          <el-icon><Postcard /></el-icon>
          <span>兑换码</span>
        </el-menu-item>
        <el-menu-item index="/announcements">
          <el-icon><Bell /></el-icon>
          <span>运营公告</span>
        </el-menu-item>
        <el-menu-item index="/update-policy">
          <el-icon><Refresh /></el-icon>
          <span>版本发布策略</span>
        </el-menu-item>
        <el-menu-item index="/content-policy">
          <el-icon><Lock /></el-icon>
          <span>内容安全策略</span>
        </el-menu-item>
        <el-menu-item index="/model-presets">
          <el-icon><Cpu /></el-icon>
          <span>预设模型</span>
        </el-menu-item>
        <el-menu-item index="/rate-limit-verifier">
          <el-icon><Timer /></el-icon>
          <span>限流验证</span>
        </el-menu-item>
        <el-menu-item index="/platform-defs">
          <el-icon><Grid /></el-icon>
          <span>平台元数据</span>
        </el-menu-item>
        <el-menu-item index="/content-templates">
          <el-icon><Document /></el-icon>
          <span>内容模板库</span>
        </el-menu-item>
        <el-menu-item index="/keyword-watchlist">
          <el-icon><Search /></el-icon>
          <span>关键词监测</span>
        </el-menu-item>
        <el-menu-item index="/pipeline-deps">
          <el-icon><Connection /></el-icon>
          <span>流水线依赖</span>
        </el-menu-item>
        <el-menu-item index="/parameters">
          <el-icon><Operation /></el-icon>
          <span>项目参数</span>
        </el-menu-item>
        <el-menu-item index="/snapshots">
          <el-icon><Camera /></el-icon>
          <span>配置快照</span>
        </el-menu-item>
        <el-menu-item index="/env">
          <el-icon><Monitor /></el-icon>
          <span>环境变量</span>
        </el-menu-item>
        <el-menu-item index="/projects">
          <el-icon><FolderOpened /></el-icon>
          <span>项目配置</span>
        </el-menu-item>
        <el-menu-item index="/audit-log">
          <el-icon><Document /></el-icon>
          <span>审计日志</span>
        </el-menu-item>
        <el-menu-item index="/prompt-eval-workbench">
          <el-icon><MagicStick /></el-icon>
          <span>提示词评测</span>
        </el-menu-item>
        <el-menu-item v-if="authStore.role === 'admin'" index="/model-keys">
          <el-icon><Key /></el-icon>
          <span>模型密钥</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <span>{{ authStore.username }}</span>
        <el-button text @click="logout">退出</el-button>
      </div>
    </el-aside>
    <el-main>
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const authStore = useAuthStore()

function logout() {
  authStore.logout()
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.app-container { height: 100vh; overflow: hidden; }
.app-sidebar {
  background: #001529;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.app-sidebar .el-menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 24px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.sidebar-footer {
  margin-top: auto;
  padding: 16px 24px;
  color: #ffffffb3;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #ffffff1a;
}
.sidebar-footer .el-button { color: #ffffffb3; }
.el-menu { border-right: none !important; }
.el-main {
  height: 100%;
  overflow-y: auto;
}
</style>
