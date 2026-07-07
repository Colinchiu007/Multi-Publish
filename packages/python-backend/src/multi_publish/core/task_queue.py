"""
任务队列

异步发布任务的管理、排队、执行。
"""

import asyncio
from collections import OrderedDict
from dataclasses import dataclass

from multi_publish.core.publisher_manager import PublisherManager
from multi_publish.models import PublishTask, TaskStatus


@dataclass
class QueueStats:
    """队列统计"""

    total: int = 0
    pending: int = 0
    running: int = 0
    success: int = 0
    failed: int = 0
    cancelled: int = 0


class TaskQueue:
    """
    发布任务队列

    功能：
    1. 任务入队/出队
    2. 任务状态追踪
    3. 并发控制（限制同时运行的任务数）
    4. 任务取消
    """

    def __init__(
        self,
        publisher_manager: PublisherManager,
        max_concurrent: int = 3,
    ):
        self.publisher_manager = publisher_manager
        self.max_concurrent = max_concurrent

        # 任务存储：task_id -> PublishTask
        self._tasks: OrderedDict[str, PublishTask] = OrderedDict()

        # 运行中的任务：task_id -> asyncio.Task
        self._running_tasks: dict[str, asyncio.Task] = {}

        # 任务队列（等待执行的任务ID列表）
        self._queue: list[str] = []

        # 控制
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._running = False
        self._worker_task: asyncio.Task | None = None

    # ========== 任务管理 ==========

    def add_task(self, task: PublishTask) -> str:
        """
        添加任务到队列

        Returns:
            任务 ID
        """
        self._tasks[task.id] = task
        self._queue.append(task.id)
        return task.id

    def get_task(self, task_id: str) -> PublishTask | None:
        """获取任务"""
        return self._tasks.get(task_id)

    def remove_task(self, task_id: str) -> PublishTask | None:
        """移除任务"""
        task = self._tasks.pop(task_id, None)
        if task_id in self._queue:
            self._queue.remove(task_id)
        return task

    def list_tasks(
        self,
        status: TaskStatus | None = None,
        limit: int = 50,
    ) -> list[PublishTask]:
        """列出任务，可选按状态过滤"""
        tasks = list(self._tasks.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        return tasks[:limit]

    # ========== 队列执行 ==========

    async def start(self):
        """启动队列消费者"""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self):
        """停止队列消费者"""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None

    async def _worker_loop(self):
        """
        队列消费者循环

        从队列中取出任务，按并发限制执行。
        """
        while self._running:
            async with self._lock:
                if not self._queue:
                    # 队列为空，等待
                    await asyncio.sleep(1)
                    continue

                # 检查是否有空闲槽位
                running_count = len(self._running_tasks)
                if running_count >= self.max_concurrent:
                    await asyncio.sleep(0.5)
                    continue

                # 取出下一个任务
                task_id = self._queue.pop(0)
                task = self._tasks.get(task_id)
                if not task:
                    continue

                # 检查是否已过期/取消
                if task.is_finished():
                    continue

                # 启动任务执行
                task.status = TaskStatus.RUNNING
                coro = self._execute_task(task)
                self._running_tasks[task_id] = asyncio.create_task(coro)

    async def _execute_task(self, task: PublishTask):
        """
        执行单个发布任务

        流程：遍历各平台 → 调用发布器 → 记录结果
        """
        try:
            async with self._semaphore:
                for platform in task.platforms:
                    if task.status == TaskStatus.CANCELLED:
                        break

                    try:
                        publisher = await self.publisher_manager.ensure_initialized(
                            platform,
                            task.metadata.get(f"{platform.value}_config", {}),
                        )

                        # 发布
                        result = await publisher.publish(
                            task.title,
                            task.content,
                            **task.metadata,
                        )

                        task.results[platform] = result

                        # 如果所有平台都失败了，标记任务失败
                        if not result.success and len(task.results) == len(task.platforms):
                            task.status = TaskStatus.FAILED

                    except Exception as e:
                        from multi_publish.models import PublishResult

                        task.results[platform] = PublishResult(
                            success=False,
                            platform=platform.value,
                            error=str(e),
                        )

                # 完成判断
                if task.status != TaskStatus.CANCELLED:
                    all_success = all(r.success for r in task.results.values())
                    task.status = TaskStatus.SUCCESS if all_success else TaskStatus.FAILED

        except asyncio.CancelledError:
            task.status = TaskStatus.CANCELLED
            raise
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.results = {
                p: type("ErrorResult", (), {"success": False, "platform": p.value, "error": str(e)})()
                for p in task.platforms
            }
        finally:
            # 清理运行任务引用
            if task.id in self._running_tasks:
                del self._running_tasks[task.id]

    # ========== 任务控制 ==========

    async def cancel_task(self, task_id: str) -> bool:
        """
        取消任务

        Returns:
            True 如果成功取消，False 如果任务不存在或已执行完毕
        """
        task = self._tasks.get(task_id)
        if not task or task.is_finished():
            return False

        task.status = TaskStatus.CANCELLED

        # 如果正在运行，尝试取消 asyncio.Task
        if task_id in self._running_tasks:
            self._running_tasks[task_id].cancel()

        # 如果在队列中等待，移除
        if task_id in self._queue:
            self._queue.remove(task_id)

        return True

    async def retry_task(self, task_id: str) -> bool:
        """
        重试失败的任务

        Returns:
            True 如果成功重新入队
        """
        task = self._tasks.get(task_id)
        if not task or task.status != TaskStatus.FAILED:
            return False

        if task.retry_count >= task.max_retries:
            return False

        task.retry_count += 1
        task.status = TaskStatus.PENDING
        task.results = {}
        self._queue.insert(0, task_id)  # 优先执行
        return True

    # ========== 统计 ==========

    def get_stats(self) -> QueueStats:
        """获取队列统计"""
        stats = QueueStats()
        stats.total = len(self._tasks)
        for task in self._tasks.values():
            match task.status:
                case TaskStatus.PENDING | TaskStatus.QUEUED:
                    stats.pending += 1
                case TaskStatus.RUNNING:
                    stats.running += 1
                case TaskStatus.SUCCESS:
                    stats.success += 1
                case TaskStatus.FAILED:
                    stats.failed += 1
                case TaskStatus.CANCELLED:
                    stats.cancelled += 1
        return stats

    def to_dict(self) -> dict:
        """序列化为字典（用于 API 响应）"""
        return {
            "tasks": [t.to_dict() for t in self.list_tasks()],
            "stats": {
                "total": self.get_stats().total,
                "pending": self.get_stats().pending,
                "running": self.get_stats().running,
                "success": self.get_stats().success,
                "failed": self.get_stats().failed,
                "cancelled": self.get_stats().cancelled,
            },
            "running_count": len(self._running_tasks),
            "queue_count": len(self._queue),
        }
