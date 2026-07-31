# 后端开发指南

## 适用范围

- Node/Electron 主进程
- API 层
- 本地服务、桥接层、任务编排逻辑

## 规则

- 鉴权、路径守卫、外部服务调用都必须 fail closed
- 错误信息要区分用户错误、环境错误和系统错误
- 生产路径不能依赖开发环境变量绕过打包状态
- 如果改动触及 API 契约、身份、存储或打包逻辑，先补回归测试，再改实现

## 参考入口

- `AGENTS.md`
- `.quality-rhythm/SKILL.md`
- `packages/`
- `apps/desktop/electron/`
