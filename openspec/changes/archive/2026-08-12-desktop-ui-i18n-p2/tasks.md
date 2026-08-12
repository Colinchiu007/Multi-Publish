# 实施清单（进度唯一来源）

- [x] zh.js / en.js 新增 home 命名空间（约 30 键，成对）
- [x] Home.vue 模板硬编码中文替换为 t('home.*')
- [x] Home.vue 脚本：greetingText/statusLabel/displayName/formatTime/平台 fallback 接入 i18n
- [x] Home.test.js：mount 安装 i18n 插件 + en 断言 + 时间区域断言
- [x] 测试：Home.test.js + i18n 键完整性测试全绿
- [x] 文档：PROMPT-TEXT-SPEC §8 进度 + CHANGELOG
- [x] 推送 + PR + CI + 合并

