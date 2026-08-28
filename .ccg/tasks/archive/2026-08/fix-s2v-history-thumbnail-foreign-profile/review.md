 # QM-5 Bug 复盘：历史记录已完成任务缩略图误显示未生成 + 打开报错
 
 ## 1. 第一性原因
 
 story2video_projects_v1 项目索引（SQLite settings 表）持久化的是创建时刻的媒体绝对路径。
 当前设备根白名单 = getAllowedMediaRoots([projectsDir])（当前 userData 的 story2video-projects + 导入临时目录）。
 当索引在不同数据目录之间迁移（本次为调试 profile 的 DB 被合并进新 profile，49 条索引全部指向旧 profile 路径），
 索引项目仍被列出且状态为 completed，但所有媒体解析（缩略图 getThumbnail、预览 URL createShareUrl、分段素材、导出 ZIP）都被白名单拒绝：
 
 - getThumbnail 全部候选解析失败 status=missing，前端渲染「未生成」；
 - ResultView resolveLocalUrl(videoPath) 失败，弹「生成已完成，但未找到可预览的视频」。
 
 任务本身全部成功（video.mp4 存在且可播放），状态显示错误，用户误判为失败任务。
 
 ## 2. 逃逸链分析（为什么没拦住）
 
 | 测试层 | 为什么没拦住 |
 |--------|--------------|
 | 单元测试（project-service） | 既有 getThumbnail/IPC 测试都只在当前 projectsDir 内构造 fixture，从不覆盖索引路径在其他根的场景 |
 | 集成/视觉 | 历史页截图测试数据均生成于同一 profile，无跨 profile 迁移夹具 |
 | E2E | 真实 E2E 用独立新 profile 跑流水线，新项目索引与媒体根一致，不触发 |
 | 代码审查 | 审查焦点在路径校验强度（防越权），未覆盖合法索引 + 根迁移的可用性路径 |
 
 ## 3. 系统性漏洞定位
 
 - 测试场景缺失：白名单解析缺少「索引路径不属于当前根但文件真实存在且属于本应用持久化项目」的契约测试。
 - 审查盲区：安全收紧（根白名单）与数据可移植性（profile 迁移/DB 合并）之间的张力无人值守。
 
 ## 4. 修复与回归保护
 
 - getProjectMediaRoot/resolveProjectMedia：仅当目录含 project.json、manifest.projectId 与目录名一致、
   清单明确引用该文件时才把该目录作为该项目的只读媒体根（防伪造 manifest 越权读）。
 - getThumbnail 候选解析失败时回退到项目清单目录；_ensureVideoThumbnail 先补齐当前项目目录
   （跨 profile 项目当前目录可能不存在，ffmpeg 输出无目录可写）。
 - IPC validateFilePath 增加项目清单回退；create-share-url/get-thumbnail/copy-path/show-in-folder/save-as/export-zip 统一受益。
 - 回归测试：服务 4 例（放行/伪造拒绝/图片出图/视频首帧+目录补齐）+ IPC 5 例（放行/全路径拒绝/缩略图/导出成功/导出拒绝）。
 
 ## 5. 预防措施
 
 - 测试模板/审查清单补充条目：任何根白名单相关修改必须覆盖「合法项目但根外」的正反用例；
 - 沉淀 learnings：profile 间合并 DB 会带入项目索引，缩略图/预览接口依赖的白名单解析必须提供项目清单目录回退。
 
 ## 验证证据
 
 - 单测：story2video-project-service.test.js 116 passed；story2video.test.js 35 passed。
 - 真机（重启后 CDP）：4 个样本项目缩略图 status=ready（image/video-frame 两类都覆盖）；
   点击已完成卡片进入 /create/result 结果页，无报错弹窗，video 元素 readyState=4（可完整播放）。


## 2. 逃逸链（完整）

| 层 | 为什么没拦住 |
|----|-------------|
| 单元测试（project-service） | 既有 getThumbnail/IPC 测试全部只在当前 projectsDir 内构造 fixture，从不覆盖「索引路径在其他根」的场景 |
| IPC 层测试 | validateFilePath 只测默认根放行/外部路径拒绝，无「默认根外但项目清单目录内」的用例 |
| 集成/真机 | 历史页验证数据均生成于同一 profile，无跨 profile（profile 合并/迁移）夹具 |
| 视觉回归/审查 | 缩略图「未生成」被当作真实失败状态展示，未反向推断「任务成功但媒体解析失败」 |

## 3. 系统性漏洞定位

- 测试场景缺失：媒体白名单与持久化索引的根集合可能漂移（profile 迁移），没有任何契约测试覆盖「索引合法、根集合不含该路径」的降级路径；
- 语义混淆：`resolveReadableFile` 白名单拒绝与「文件不存在」在 UI 上不可区分，导致误报为未生成。

## 5. 预防措施

- 新增契约测试模板：`getAvailable*`/缩略图/预览类功能必须覆盖「默认根外 + 受信项目清单目录」与「伪造清单拒绝」两条路径（已固化到 service/IPC 测试）；
- 本项目已落地：跨 profile 项目媒体根的只读回退必须具备与默认根相同的 canonical 包含校验（lstat 拒符号链接 + realpath + 大小上限），后续复用此模式时不得用字符串前缀比较代替。

## 双模型审查结论

### 第一轮（针对 e64a5cd69）——Claude（session 0ebceaeb-92d4-43c1-ba34-ec354b5460a6）

- Critical：0；Warning：3；Info：5。
- W1 export-zip 用「清单引用任一文件」整体解锁项目根后可导出目录内未引用文件（与声明的安全约束不符）；
- W2 `projectFileReferencePaths` 漏收 `videoMeta.sceneVideoPath/altSceneVideoPath`（AI 场景视频段缩略图回退失效）；
- W3 `getProjectMediaRoot` 字符串相等比较在 NTFS 大小写不敏感下会误拒 realpath 规范化后的请求；
- Info：默认根文件重复解析 project.json（I1）、拒绝原因未记录（I2）、mkdir 时序（I3）、相对引用解析（I4）、父链符号链接（I5，安全网已兜底）。

### 修复提交 feee387e8 处置

- W1：export-zip 逐文件独立校验（默认根或 resolveProjectMedia），任一不通过即 VALIDATION_ERROR，createZipFromFiles 只接收 canonical validatedFiles，项目根仅对默认根之外的文件收集；
- W2：引用收集补 sceneVideoPath/altSceneVideoPath（仅读放行，不动 cleanup 语义）；
- W3：仅 win32 大小写不敏感比较（POSIX 保持精确匹配）；
- I1：projectMediaRootsFor 默认根短路；I3：mkdir 移到 ffmpeg 可用性检查之后。
- 回归测试：服务 +2（sceneVideoPath 首帧、win32 大小写容差）、IPC +1（同目录未引用文件导出被拒）+ 正例 mock 修正。

### 第二轮（针对 feee387e8）——Claude（session d6dbca0b-e6d2-4176-8fd9-09176870c375）

- Critical：0；Warning：0 → **PASS**（W1/W2/W3 全部关闭，无新绕过）。
- 遗留 Info（非阻塞）：I1 短路基于原始 getAllowedMediaRoots（默认接线即生产接线，匹配）；export 路径对每个外来文件重复读一次 manifest（可忽略）；mkdir 无「ffmpeg 不可用不建目录」专项测试（既有行为，非本次引入）。

### 第二轮（针对 feee387e8）——opencode（待回填）
### 第二轮（针对 feee387e8）——opencode（本机前端不可用，降级记录）

- 尝试 3 次：① 20:24 运行读了错误工作树 diff（审成 baijiahao 脏改动）；② 重派时不可读 D:/tmp（权限自动拒绝 external_directory）；③ diff 放入 repo 内（node_modules/.cache）后启动即退出（opencode exit status 4294967295）。
- 依《机制硬化》阶段降级：以 Claude 两轮审查（均 PASS）+ 主代理逐行复核 + 单测全绿作为评估依据。

### CI Gate 4 失败与第二轮回退修复（2026-08-28 晚）

- 现象：PR 推送后 QG Gate 4（Workspace unit tests）/Desktop Shards×2/Coverage 全失败——story2video.test.js 新增的 3 个跨 profile 用例（create-share-url/get-thumbnail/export-zip 回退放行）在 CI 返回 code:-1。
- 第一性原因：GitHub Windows runner 的 os.tmpdir() 解析为 8.3 短名路径（C:\Users\RUNNER~1\AppData\Local\Temp），而 IPC 校验链 resolveReadableFile 返回 realpathSync.native 长名（C:\Users\runneradmin\...）；getProjectMediaRoot 用「字面串相等」比对 manifest 引用（持久化为短名）与请求路径（已归一为长名）→ 误判为未引用→ 回退拒绝。本地无 8.3 短名目录，故首轮本地全绿、CI 才暴露（逃逸链：跨环境路径拼写差异没有回归夹具）。
- 修复：getProjectMediaRoot 对「清单引用」与「请求路径」两侧各自 realpathSync.native 归一（失败保留原串、fail-closed）后再比较（win32 保留大小写不敏感）；安全边界不变（manifest.projectId===目录名 + 清单显式引用 + resolveReadableFile canonical 包含校验）。
- 回归保护：服务新增「联接通路别名/8.3 短名 canonical 比较」用例（junction 别名持久化在 manifest、请求用真实路径：放行；反向请求走联接目录：目录名与 projectId 不同形→ 拒绝）；三个跨 profile IPC 用例从手工 mock 改为真实 Story2VideoProjectService 实例，直接覆盖「短名引用 vs canonical 请求」的 CI 场景。本地复测：服务 119 + IPC 36 全绿。
- 预防措施：跨 profile 媒体放行类合同必须覆盖「同一文件不同路径拼写（短名/联接/大小写）」正反用例；IPC 测试不得用手工 mock 掩盖 canonical 路径二次校验（mock 的原始串等值判断在 CI 短名环境下必然失效）。

## 远程状态

- PR: https://github.com/Colinchiu007/Multi-Publish/pull/1209 （open，待合并）
- 分支：codex/fix-s2v-history-thumbnail-foreign-profile（基于 origin/main 干净 cherry-pick，7 提交：eec9e04cb 根修复 / 830d02f4f QM-5 复盘 / 5a2c57ee4 审查修复 / 4d0a464d7 归档 / a2ae03e0b CHANGELOG / 413e3287c CI 短名修复 / 97c434c46 CHANGELOG 补充）
