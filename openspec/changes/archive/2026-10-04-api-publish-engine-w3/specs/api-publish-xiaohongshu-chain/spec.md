# api-publish-xiaohongshu-chain (delta)

## ADDED Requirements

### Requirement: 小红书链前置取证硬门槛
小红书 API 发布链的实现 MUST 以完整链逐字切片为前置：从完好 bundle 补提上传、发布提交与 `x-s`/`x-t` 生成调用点全段入文档域证据；补提后仍存在无法钉死的字段面或签名生成路径时，本波 MUST 止步（小红书并入后续波次或保持 DOM RPA），MUST NOT 凭记忆或推测实现请求契约。

#### Scenario: 取证缺口过大
- **WHEN** 补提切片后发布提交 body 的关键字段名仍不可确定
- **THEN** 小红书链不实现，platforms.yaml 不翻转，裁决与缺口清单记录入证据文档

### Requirement: 止步裁决记录（2026-09-26，本波定案）
本波 1.2 取证触发上述门槛：`x-s`/`x-t` 生成依赖小红书外包签名服务（运行时禁止远程求签通道，见 `api-publish-chain`「签名 provider 双形态进程内分派」），页面内可抽取性未经 spike 验证，`cp.kuaishou.com` 型 Tier-A 前提不成立 ⇒ 小红书 API 链整体止步：不实现 `publish/platforms/xiaohongshu.js`、不委托 Adapter、platforms.yaml 保持 dom-only。签名页基建已预留 `xiaohongshu.x-s` provider 槽（verified 门禁复用）。重启本链 MUST 以新立 change 完成全链逐字切片 + x-s/x-t 可抽取性 spike 双前置为条件；原规划中「x-s/x-t 经签名页求签」「Adapter 变薄委托与双轨翻转」两条能力**未实现、未验收**，不得折入主规格。

#### Scenario: 未来波次重启
- **WHEN** 后续 change 主张实现小红书 API 链
- **THEN** 必须先补全链切片取证与签名页抽取 spike 并通过拦截法比对，方可恢复该两条能力规格的立项
