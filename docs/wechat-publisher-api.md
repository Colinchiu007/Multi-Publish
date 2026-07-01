# wechat-publisher API 文档

> 模块路径：`team/projects/PROJECT-003-multi-publish/src/wechat_publisher.py`  
> 供 PROJECT-001（热文采集改写）、PROJECT-002（MoneyPrinterTurbo SaaS）、PROJECT-003（多平台一键发布）共用

---

## 环境变量

| 变量名 | 说明 | 获取方式 |
|---------|------|----------|
| `WECHAT_APPID` | 微信公众号 AppID | 微信公众平台 → 设置 → 开发者ID |
| `WECHAT_APPSECRET` | 微信公众号 AppSecret | 同上（谨慎保管） |

---

## 快速开始

### 安装依赖

```bash
pip install httpx
```

### 最小示例

```python
from wechat_publisher import WechatPublisher, Article

publisher = WechatPublisher(
    appid="your_appid",
    secret="your_secret",
)

article = Article(
    title="热文标题",
    content="<h1>正文标题</h1><p>正文内容...</p>",
    thumb_media_id="MEDIA_ID",  # 先调用 upload_image() 获取
    author="QClaw",
    digest="这是文章摘要",
    content_source_url="https://example.com/original",
)

result = publisher.publish(article, wait_publish=False)
print(result.publish_id)   # 发布任务 ID
print(result.article_url)   # 需调用 get_publish_status() 获取
```

---

## 类：WechatPublisher

### 初始化

```python
publisher = WechatPublisher(
    appid: str = "",       # 可选，默认读环境变量
    secret: str = "",      # 可选，默认读环境变量
    timeout: int = 30,    # 请求超时（秒）
)
```

### 方法列表

#### `publish(article, wait_publish=False) -> PublishResult`

完整发布流程：**创建草稿 → 发布 → （可选）等待完成**

| 参数 | 类型 | 说明 |
|------|------|------|
| `article` | `Article` | 图文对象 |
| `wait_publish` | `bool` | 是否等待发布完成（最长 60 秒） |

返回 `PublishResult`：
```python
result.success        # bool
result.publish_id   # str | None（发布任务 ID）
result.article_url   # str | None（文章 URL，发布成功后有值）
result.errcode       # int | None
result.errmsg        # str | None
```

---

#### `add_draft(article) -> dict`

仅创建草稿（不发布）

```python
result = publisher.add_draft(article)
print(result["media_id"])  # 草稿 media_id
```

---

#### `upload_image(image_path) -> str`

上传封面图，获取 `thumb_media_id`

```python
thumb_media_id = publisher.upload_image("./cover.jpg")
```

**要求**：
- 格式：JPG/PNG
- 尺寸：推荐 900×500 像素
- 大小：≤10MB

---

#### `upload_image_for_content(image_path) -> str`

上传正文图片，返回 URL（用于插入 HTML 正文）

```python
img_url = publisher.upload_image_for_content("./content-img.png")
# 在 HTML 中使用：<img src="IMG_URL">
```

---

#### `get_publish_status(publish_id) -> dict`

获取发布状态

```python
status = publisher.get_publish_status("publish_id_xxx")
print(status["publish_status"])  # 0=成功，其他=失败
print(status["article_url"])     # 文章 URL（成功后有值）
print(status["fail_idx"])       # 失败的文章索引列表
```

---

## 类：Article（数据模型）

```python
@dataclass
class Article:
    title: str               # 标题（必填）
    content: str             # HTML 正文（必填）
    thumb_media_id: str      # 封面图 media_id（必填，先调 upload_image）
    author: str = ""        # 作者
    digest: str = ""        # 摘要（为空则取正文前 54 字）
    content_source_url: str = ""   # 原文链接
    need_open_comment: int = 0   # 是否打开评论（0/1）
    only_fans_can_comment: int = 0  # 仅粉丝可评论（0/1）
```

---

## 异常

| 异常类 | 说明 |
|--------|------|
| `WechatError` | 通用异常（errcode, errmsg） |
| `WechatAuthError` | 认证失败（AppID/AppSecret 错误） |
| `WechatPublishError` | 发布失败 |

**示例**：
```python
from wechat_publisher import WechatPublisher, WechatAuthError

try:
    publisher = WechatPublisher(appid="wrong_id", secret="wrong_secret")
    result = publisher.publish(article)
except WechatAuthError as e:
    print(f"认证失败：{e}")  # [40001] invalid credential
```

---

## PROJECT-001 集成示例

### 方式一：使用封装函数（推荐）

```python
# content-aggregator/tools/wechat_publish.py
from tools.wechat_publish import publish_article

result = publish_article(
    title="AI 改写后的热文标题",
    content_html="<h1>标题</h1><p>正文...</p>",
    cover_image_path="./cover.jpg",
    author="QClaw",
    digest="本文由 AI 自动改写",
    source_url="https://example.com/original",
)

if result["success"]:
    print(f"✅ 发布成功！publish_id={result['publish_id']}")
else:
    print(f"❌ 发布失败：[{result['errcode']}] {result['errmsg']}")
```

### 方式二：命令行调用

```bash
python content-aggregator/tools/wechat_publish.py \
    --title "热文标题" \
    --html ./output.html \
    --cover ./cover.jpg \
    --author "QClaw" \
    --wait
```

---

## PROJECT-002 集成示例（未来）

```python
# MoneyPrinterTurbo 生成视频后，发布视频封面+简介到微信公众号
from wechat_publisher import WechatPublisher, Article

publisher = WechatPublisher()

# 上传视频封面图
thumb_media_id = publisher.upload_image("./video_cover.jpg")

# 构建文章（视频简介 + 跳转链接）
article = Article(
    title="新视频发布：《AI 自动生成短视频》",
    content=f"<p>{video_description}</p><p><a href='{bilibili_url}'>观看视频</a></p>",
    thumb_media_id=thumb_media_id,
    author="QClaw",
)

result = publisher.publish(article)
print(result.publish_id)
```

---

## 微信公众号 API 官方文档

- 获取 access_token：https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Get_access_token.html
- 上传图文素材：https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html
- 草稿箱接口：https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html
- 发布接口：https://developers.weixin.qq.com/doc/offiaccount/Publish/Publish.html

---

## 常见问题

### Q1：access_token 多久过期？
A：7200 秒（2 小时），模块自动缓存并在过期前 60 秒刷新。

### Q2：发布后多久能看见文章？
A：通常 3-10 秒，建议使用 `wait_publish=True` 或轮询 `get_publish_status()`。

### Q3：每天能发布多少篇？
A：微信公众号**免费发布**无次数限制（群发有限制，每日 1 次）。

### Q4：如何获取 AppID 和 AppSecret？
A：登录 [微信公众平台](https://mp.weixin.qq.com/) → 设置与开发 → 基本配置 → 开发者ID(AppID) / 开发者密码(AppSecret)。

---

**最后更新**：2026-06-02  
**维护人**：QClaw CTO
