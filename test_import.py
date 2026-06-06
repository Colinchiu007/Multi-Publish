import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

# 测试所有模块导入
from multi_publish import PlatformType, TaskStatus, PublishResult, PublishTask, PublisherManager, CredentialCrypto, get_crypto
print('[OK] 顶层导入 OK')

from multi_publish.models import PlatformType, TaskStatus, PublishResult, PublishTask, PlatformAccount
print('[OK] models OK')

from multi_publish.crypto import CredentialCrypto, get_crypto
print('[OK] crypto OK')

from multi_publish.core.publisher_manager import PublisherManager
print('[OK] publisher_manager OK')

from multi_publish.core.task_queue import TaskQueue, QueueStats
print('[OK] task_queue OK')

from multi_publish.core.scheduler import PublishScheduler
print('[OK] scheduler OK')

from multi_publish.publishers.base import BasePublisher, PublisherConfig
print('[OK] publishers/base OK')

from multi_publish.publishers.wechat_mp import WeChatPublisher, WeChatPublisherConfig
print('[OK] publishers/wechat_mp OK')

# 测试加密
crypto = get_crypto()
enc = crypto.encrypt('test-secret-123')
dec = crypto.decrypt(enc)
assert dec == 'test-secret-123', '加密解密失败: ' + str(dec)
print('[OK] 加密解密 OK')

# 测试模型
r = PublishResult(success=True, platform='wechat_mp', article_id='test123', url='https://mp.weixin.qq.com/s/xxx', duration=2.5)
print('[OK] PublishResult OK: ' + str(r.success) + ', ' + str(r.article_id))

t = PublishTask(id='task-001', title='测试文章', content='测试内容', platforms=[PlatformType.WECHAT_MP])
assert t.status == TaskStatus.PENDING
print('[OK] PublishTask OK: ' + str(t.id) + ', ' + str(t.status.value))

# 测试发布器管理器
pm = PublisherManager()
pm.register(PlatformType.WECHAT_MP, WeChatPublisher)
platforms = [p.value for p in pm.get_available_platforms()]
print('[OK] PublisherManager OK, 已注册平台: ' + str(platforms))

print()
print('所有模块导入和基础测试通过!')
