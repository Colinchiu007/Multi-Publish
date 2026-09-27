# Tasks: declare-platform-session-markers

## 1. 取证

- [x] 1.1 建立可复跑的匿名基线探针（同版本 electron.exe + UA 净化 + 隔离分区 + 只出名字不出值）
- [x] 1.2 跑通 douyin / bilibili / xiaohongshu / zhihu 四家基线，并用「公认匿名 Cookie 是否出现」自证页面确实渲染
- [x] 1.3 只读采集四家登录视图分区（`node:sqlite` readOnly，SELECT 不含值列；`expires_utc`/`creation_utc` 需 `CAST(... AS TEXT)`）
- [x] 1.4 生成 A−B 差集并按键语义筛选，得到三家标记集；知乎判定为「Cookie 侧无可钉凭证」
- [x] 1.5 夹具程序化生成（`gen-fixtures.js` 直接读探测 JSON 与分区），杜绝手抄

## 2. 实现

- [x] 2.1 `PLATFORM_SESSION_COOKIE_MARKERS` 声明 douyin / bilibili / xiaohongshu，注释写清取证手法与落选理由
- [x] 2.2 泛化 `SESSION_MARKER_SHAPE` 并补两类断言（形态可拒负控 + 形态放过的实测墓碑）
- [x] 2.3 shared-utils 新增并导出 `sessionCookieNames`，四处门禁统一使用
- [x] 2.4 `auth-view-manager` 新增 `logDeclaredMarkerMiss`（已声明却被拒 ⇒ 留名字现场）
- [x] 2.5 `account-manager` / `auth-view-manager` 的 reject 日志接上共用名字投影（有测试锁）
- [ ] 2.5b `qrcode-login` / `credential-saver` 的 reject 日志已补 `names=`，但**尚无可执行锁**。
      实测仅覆盖 `credential-saver`：它经 vite SSR 管道 `require('../logger')`，绕过测试的
      `__registerMock('./logger')` 注册表，spy 与具名 mock 都抓不到（只在 vitest stdout 看到一次真日志）。
      `qrcode-login` 侧**未做同样实验**，是否同因待测；需要另找注入缝或显式 mock 路径。

## 3. 回归与反证

- [x] 3.1 `platform-definitions.test.js` 新增取证契约 describe（A−B 逐字钉住 / 匿名判未登录 / 登录视图判已登录 / 标记 ∈A∉B 交叉核对）
- [x] 3.2 `sessionCookieNames` 单测（去重、上界 40、非数组安全、值不外泄）
- [x] 3.3 修正被收紧波及的既有断言：douyin 不再作为「未声明」代表（`hasPlatformSessionCookie`/`Markers` 两处改锚）；webview-manager 批量保存夹具补 douyin 会话 Cookie
- [x] 3.3b 复核 `auth-view-manager.test.js`：改锚后该套件实测 40 passed，无其它用例以 xiaohongshu/douyin 作「未声明」样本
- [x] 3.4 变异反证（4 条全部实测变红并字节还原）：把三家标记清空 ⇒ 取证契约必须红；把 `sessionCookieNames` 改成恒返回 `[]` ⇒ 单测必须红；把 `logDeclaredMarkerMiss` 调用删掉 ⇒ auth-view-manager 用例必须红
- [x] 3.5 全量 `apps/desktop` electron 测试（7808 passed / 1 failed，唯一红为既有 `EPERM symlink`，已在未含本改动的 main 上复现）
- [~] 3.5b QM-1：打包成功 + 解包后 require 产物内 `platform-definitions.js` 实测判定正确；**未做**启动 8 秒捕 stderr
      （**未复验**：项目记忆中记有「并发实例在后端端口 8299 互相踩踏、launcher 误报 OK」，本轮未重测；
      为避免为补一条记录而冒打断他人在跑应用的风险，选择留待下次打包一并补做）

## 4. 收口

- [x] 4.1 AGENTS.md「平台登录成功判定合同」补：标记取证三条件、基线自证、知乎 Cookie 不适用、泛化必须带负控
- [x] 4.2 CHANGELOG / learnings 置顶条目
- [x] 4.3 QM-6 双模型外部评审记录
- [ ] 4.4 PR + CI 绿 + 合并后核对 main

## 5. 遗留（不在本 change 内完成）

- 三平台正向证据的真机复核：下次真实登录时用 reject/success 日志的 `names=` 核对标记集是否过窄
- 知乎 localStorage 侧会话标记取证（须 CDP 实时，禁止离线抠 leveldb 键名）
- instagram / facebook / youtube 各需一次真实登录
