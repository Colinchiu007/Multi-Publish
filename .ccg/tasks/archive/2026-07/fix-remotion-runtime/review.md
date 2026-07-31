# Remotion 运行时闭包审查

`stage-remotion-runtime.js` 递归复制 Composer 的运行时依赖，并对缺失的可选平台包 fail-open、对必需依赖 fail-closed。打包后的资源解析已验证 `@remotion/cli`、`remotion` 和 Windows compositor 存在；渲染入口不再依赖宿主机 `npx`。

验证: `render-engine`、`before-pack` 和 runtime staging 定点测试通过；真实打包应用可以启动。外部 Antigravity/Claude 后端在本机不可用，未生成可采信的双模型审查输出。
