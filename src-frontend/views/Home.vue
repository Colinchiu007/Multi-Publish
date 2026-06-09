<template>
  <div style="text-align: center; padding: 60px 20px">
    <h1 style="font-size: 28px; margin-bottom: 12px">📢 Multi-Publish</h1>
    <p style="color: #666; font-size: 16px; margin-bottom: 30px">多平台内容一键发布工具</p>
    <el-row :gutter="20" justify="center">
      <el-col :span="8">
        <el-card shadow="hover">
          <h3>🤖 RPA 自动化</h3>
          <p style="color: #999; font-size: 13px">Playwright 驱动浏览器<br/>模拟人工操作发布</p>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <h3>🔐 Cookie 持久化</h3>
          <p style="color: #999; font-size: 13px">加密保存登录态<br/>无需重复扫码</p>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <h3>🚀 一键多平台</h3>
          <p style="color: #999; font-size: 13px">同时发布到微信、知乎、微博等</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>