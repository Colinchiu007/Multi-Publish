# 审查报告：story2video-bgm-library（背景音乐素材库）

- 日期：2026-08-14
- 审查方式：双模型外部审查不可用（antigravity 账户地区限制、claude 超时，与交接记录一致）→ 按机制硬化规则降级为主代理审查
- 审查范围：服务层 / 路径白名单 / IPC / 权限 / preload / 渲染端 / i18n / e2e mock / 测试
- 测试基线：story2video-bgm-library 16/16、paths 34/34（含 electron DI 2 例）、ipc-handlers/story2video 全过、preload 333/333、access-control 47/47、CreateView 174/174、QM-1 打包通过（asar 含新模块 + require 链 + 启动 8s 存活）

## 结论

**APPROVE（无 Critical）**。实现与 OpenSpec spec 合同一致，路径/权限/原子写均遵循既有 QM 合同模式。

## Critical（必须修复）

无。

## Warning（建议处理）

1. `renameWithRetry` / `unlinkWithRetry` 使用 `Atomics.wait` 同步退避（主进程阻塞 150/300ms）——沿用 `copyImportedMedia` 既有模式，且有界（3 次），符合「Windows 原子文件替换重试」QM 合同，接受。
2. `list()` 自愈写索引失败静默吞掉（读取不阻塞）——库目录异常只写时不报错，符合 fail-open 读取策略，接受。
3. IPC `bgm-library-add` 所有失败统一返回 `VALIDATION_ERROR`（沿用 import-media 语义，renderer 按 message 映射细分提示）——行为一致，接受。

## Info

1. `CreateView.vue` 的 `handleS2VBgmFile` 已无模板引用（仅测试使用），为兼容旧测试的薄封装，可后续随测试清理移除。
2. `library.json` 损坏时降级为空库（fail-open），非关键缓存，可接受。
3. e2e ipc-mock 的 add 返回固定 name（e2e-bgm-new），不影响 e2e 断言语义。

## 已验证的安全合同

- 路径：库目录 `userData/story2video-bgm` 加入 `getAllowedMediaRoots()`（story2video-paths.js:43）；`_toPublicItem` 路径恒为库内 canonical 路径；`isSafeFileName` 拒绝 `..`/分隔符；读取侧 `resolveReadableMediaFile` 走 lstat + realpath 双重越界检查。
- 导入：复用 `importUserSelectedMedia`（扩展名 wav/m4a/mp3、≤15MB、lstat 拒绝符号链接、复制 EXCL + 有界重试、目标 isPathWithin）。
- 原子写：临时文件（wx 独占）+ rename 有界重试（EPERM/EACCES/EBUSY），失败清理临时文件——符合 Windows 原子替换合同。
- IPC：4 通道全部 `withSenderCheck` + 参数结构校验（对象/字符串/id 非空/name 类型），服务层二次校验（isSafeLibraryId / normalizeDisplayName 1-60 字符），fail-closed。
- 权限：PUBLIC_CHANNELS 与 preload PUBLIC_METHODS 同步（各 4 项），未登录可用与 import-media 同类。
- 删除：先 lstat 复查符号链接再 unlink（有界重试），文件缺失视为已删除，索引原子更新；删除当前选中项时 renderer 回退 bgmPath。
- i18n：zh/en 903 键对称，`bgm_library_*` 4 键成对；pair 检查 PASS。
