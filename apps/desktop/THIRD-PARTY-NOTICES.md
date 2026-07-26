# 第三方软件声明

## FFmpeg 与 ffprobe

Multi-Publish 将 FFmpeg 和 ffprobe 作为独立命令行程序随桌面安装包分发，并通过子进程调用。桌面应用不链接这些二进制文件。

- npm 包：`ffmpeg-ffprobe-static@6.1.2-rc.1`
- 二进制发布：`b6.1.2-rc.1`
- 二进制发布页：https://github.com/descriptinc/ffmpeg-ffprobe-static/releases/tag/b6.1.2-rc.1
- FFmpeg 上游源码：https://git.ffmpeg.org/ffmpeg.git

该 npm 包的许可证元数据为 GNU GPL 第 3 版或更高版本；每个平台二进制的实际构建参数和适用条款以随包文件为准。安装目录中的 `resources/media-tools/FFMPEG-BUILD.txt` 保存本次打包二进制的真实版本与构建参数，`FFMPEG-LICENSE.txt` 保存二进制发布方提供的许可证说明，`GPL-3.0.txt` 保存 GPLv3 许可证原文，`FFMPEG-WRAPPER-LICENSE.txt` 保存 npm 包装层许可证，`FFMPEG-PACKAGE-README.md` 保存各平台二进制来源与构建说明。

Multi-Publish 未修改随包分发的 FFmpeg/ffprobe 二进制。公开分发安装包时，发布负责人还必须按适用许可证提供对应源代码及构建材料的获取方式；本声明不能替代许可证原文或法律审查。
