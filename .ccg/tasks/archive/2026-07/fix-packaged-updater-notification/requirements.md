# 打包应用更新检查验收

1. 打包应用缺少本地 `resources/app-update.yml` 时不显示“更新失败”。
2. 仅 `ENOENT` 且目标为 `app-update.yml` 可按更新不可用处理。
3. `EACCES`、签名、下载和安装错误仍必须按真实错误上报。
