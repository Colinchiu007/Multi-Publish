"""
PROJECT-003 项目说明

多平台一键发布工具

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m uvicorn web.server:app --host 0.0.0.0 --port 8081

# 访问 Web UI
http://localhost:8081
```

## 目录结构

```
PROJECT-003-multi-publish/
├── src/multi_publish/
│   ├── __init__.py           # 顶层导出
│   ├── crypto.py             # 凭证加密
│   ├── models.py             # 数据模型
│   ├── core/
│   │   ├── __init__.py
│   │   ├── publisher_manager.py  # 发布器管理器
│   │   ├── task_queue.py         # 任务队列（待实现）
│   │   └── scheduler.py          # 调度器（待实现）
│   ├── publishers/
│   │   ├── __init__.py
│   │   ├── base.py               # 基础发布器接口
│   │   └ wechat_mp.py            # 微信公众号发布器
│   ├── rpa/                      # RPA 引擎（待实现）
│   └── formatters/               # 格式适配器（待实现）
├── web/
│   ├── server.py                 # FastAPI 服务（待创建）
│   ├── templates/                # Jinja2 模板
│   └── static/                   # 静态文件
├── config/
│   └ config.yaml                 # 配置文件（待创建）
├── tests/                        # 测试
├── PRD.md                        # 产品需求文档
├── requirements.txt
└── README.md
```

## 当前进度

- [x] 项目骨架创建
- [x] PRD 文档
- [x] 数据模型定义
- [x] 基础发布器接口
- [x] 凭证加密模块
- [x] 微信公众号发布器（Phase 1）
- [ ] 任务队列（Phase 1）
- [ ] Web UI（Phase 1）
- [ ] 知乎 RPA 发布器（Phase 2）
- [ ] 微博/抖音发布器（Phase 3）

## 与 PROJECT-001 集成

PROJECT-001 改写完成后，可通过以下方式使用 PROJECT-003：

```python
from multi_publish import PublisherManager, PlatformType, get_crypto

# 初始化
manager = PublisherManager()

# 注册微信公众号发布器
from multi_publish.publishers import WeChatPublisher
manager.register(PlatformType.WECHAT_MP, WeChatPublisher)

# 发布
result = await manager.publish_to_platforms(
    title="文章标题",
    content="文章内容",
    platforms=[PlatformType.WECHAT_MP],
    wechat_mp_config={
        "app_id": "YOUR_APP_ID",
        "app_secret": "YOUR_APP_SECRET",
    }
)
```