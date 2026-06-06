import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from multi_publish import PublisherManager, PlatformType, PublishTask, PublishResult, TaskStatus
from multi_publish.publishers import WeChatPublisher

pm = PublisherManager()
pm.register(PlatformType.WECHAT_MP, WeChatPublisher)

task = PublishTask(
    id='task-test-001',
    title='Test',
    content='Content',
    platforms=[PlatformType.WECHAT_MP]
)
print('Task created:', task.id, task.status.value)
print('Available platforms:', [p.value for p in pm.get_available_platforms()])
print('All core tests passed!')
