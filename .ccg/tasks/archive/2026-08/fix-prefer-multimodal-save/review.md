# 审查结果：fix-prefer-multimodal-save

## 根因（QM-5 第一性原因）
- 引入 commit：`5c17c2b14`（2026-08-08 多模态优先开关前端 UI）。
- **主因（加载路径契约错误）**：`storeGetSetting`（`apps/desktop/src/api/publisher.js:227-233`）会把 IPC 信封解包为裸值（成功返回 `result.data`，失败返回 `null`）。`loadMultimodalPreference` 却按 IPC 信封形状消费 `res?.code === 0 ? res.data !== false : true`——保存成功的 `false` 被误判为「未配置」，回退默认 `true`。**即使保存成功，再次进入页面仍显示勾选。**
- **次因（保存路径静默失败）**：`saveMultimodalPreference` 乐观更新 UI 但不检查 `storeSetSetting` 返回码；未登录（`store:set-setting` 返回 `AUTH_ERROR`）或 IPC 不可用（`invoke` 返回 `undefined`）时失败被吞掉，UI 立即翻转造成「已保存」假象。

## 逃逸分析
- 单元测试 `useModelProviderCrud.test.js` 用 **IPC 信封形状**（`{code:0,data:false}`）mock `storeGetSetting`，与真实解包契约不符，歪打正着「通过」，掩盖加载 bug——mock 契约失真（测试质量不足）。
- 保存失败路径（非 0 code / undefined / 异常）无测试覆盖——场景缺失。
- 主进程 `store.test.js` 只覆盖 `theme` 键成功路径，未覆盖未登录 `AUTH_ERROR` 契约——审查盲区。

## 修复
1. `loadMultimodalPreference`：消费解包裸值 `res !== false`（`false`→关闭；`null`/`true`/`undefined`→默认开启；catch→默认开启）。
2. `saveMultimodalPreference`：检查 `res?.code === 0`；失败（非 0/undefined/异常）→ 回滚 UI 为保存前值 + `formatUserError` 透出原因（catch 用通用 fallback 文案）。

## 回归测试（54 passed）
- 加载：裸值 `false`→关闭；`null`→默认开启；抛异常→默认开启（修正 mock 契约为真实形状）。
- 保存：成功持久化 `false`；非 0 code→回滚+原因提示；IPC undefined→回滚+提示；抛异常→回滚+提示。

## 双模型审查（降级记录）
- antigravity：地区不可用（Eligibility check failed），降级。
- Claude：首轮发现 Critical 2 项（加载路径契约 bug + 测试 mock 契约失真）与 Warning 2 项（失败原因透出、缺 undefined 用例），Info 1 项（竞态快照）。Critical/Warning 已全部修复并补测试；Info（快速连续切换竞态）经评估保持 `previous` 快照回滚（单次点击场景下 save 请求毫秒级返回，风险可忽略，避免额外 IPC 依赖）。
