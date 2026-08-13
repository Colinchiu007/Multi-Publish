## 1. stdlib → loguru 桥接（R1）

- [x] 1.1 `logging_setup.py` 新增 `InterceptHandler` + `install_stdlib_intercept()`（root/uvicorn/fastapi，propagate=False）
- [x] 1.2 测试：stdlib record 经 InterceptHandler 进入 loguru sink

## 2. stdout/stderr 级别分流（R4）

- [x] 2.1 `setup_logging` stderr sink 提升至 WARNING；新增 stdout INFO sink
- [x] 2.2 测试：INFO 请求日志落 stdout、WARNING 落 stderr（sink 级断言）

## 3. 结构化请求日志 + requestId（R2/R3）

- [x] 3.1 `server.py` 新增 http middleware：method/path/status/duration_ms/request_id + 响应头 `x-request-id` 回显；`_resolve_request_id` 白名单/自生成
- [x] 3.2 关闭 uvicorn 默认 access（`access_log=False` + `uvicorn.access.disabled=True`）
- [x] 3.3 测试：TestClient 请求断言结构化日志字段 + requestId 透传/回显/非法回落

## 5. Claude 审查修复（2 Critical + 2 Warning）

- [x] 5.1 C1：InterceptHandler 深度解析修复（记录 name 指向调用方模块，非 logging/emit）；server 关键词补 "__main__"（生产 python server.py 启动）；补 name 防回归测试
- [x] 5.2 C3：未处理异常（500）路径——中间件 except 输出 status=500 结构化行 + @app.exception_handler(Exception) 回显 x-request-id
- [x] 5.3 W4：stdout sink 加 INFO 上限 filter（WARNING/ERROR 仅 stderr，杜绝 sidecar 双写误标）
- [x] 5.4 测试补强：WARNING 不落 stdout、500 回显/结构化行、name 归属防回归

## 4. 验证与交付

- [x] 4.1 pytest（test_logging_setup + test_request_logging + 相关 server 测试）通过
- [x] 4.2 `openspec validate python-logging-hardening` 通过
- [x] 4.3 提交、推送、PR、合并、三同步归档（含 learnings + 文档门禁同步）

