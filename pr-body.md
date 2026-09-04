## 问题

通过 CDP 自动化测试捕获到「启动流水线」报「当前操作未能完成」的第二类根因：

IPC 调用返回 `{success:false, error:"Story2Video subtitle.size 值无效: medium", errorCode:null}`。

## 根因

1. 字幕字号 SUBTITLE_SIZE_MAP 只注册了 size1-size6 和 sm/md/lg/xl，但 UI 保存的模板可能包含 small/medium/large 等旧值，导致 normalize 抛 Error
2. 该 Error 未设置 .code 属性，pipeline-engine 返回 errorCode=null，IPC handler 透传后 resolveMessageKey 无法匹配，回退到 operation_failed

## 修复

- story2video-text-config.js: SUBTITLE_SIZE_MAP 新增 small→size1 / medium→size3 / large→size5 兼容映射
- pipeline-engine.js: 参数校验失败时 errorCode 兜底为 INVALID_PARAMS
- story2video-notifications.js: 新增 INVALID_PARAMS 键 + resolveMessageKey 映射
- locales zh/en: 新增 invalid_params 文案（成对）

## 验证

- ✅ 73 项通知测试全部通过