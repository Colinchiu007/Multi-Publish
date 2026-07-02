"""
发布调度器

支持定时发布、周期性发布。
"""

import asyncio
from datetime import datetime, timedelta
from typing import Callable

from multi_publish.core.task_queue import TaskQueue
from multi_publish.models import PublishTask, TaskStatus


class PublishScheduler:
    """
    发布调度器

    功能：
    1. 一次性定时发布（at 时间执行）
    2. 周期性发布（cron 表达式或间隔）
    3. 调度任务管理（添加/删除/暂停/恢复）
    """

    def __init__(self, task_queue: TaskQueue):
        self.task_queue = task_queue
        self._schedules: dict[str, dict] = {}  # schedule_id -> schedule info
        self._running = False
        self._worker_task: asyncio.Task | None = None
        self._schedule_counter = 0

    # ========== 调度管理 ==========

    def add_schedule(
        self,
        task: PublishTask,
        scheduled_at: datetime,
        schedule_id: str | None = None,
    ) -> str:
        """
        添加一次性定时任务

        Args:
            task: 发布任务
            scheduled_at: 计划执行时间
            schedule_id: 调度ID（自动生成如果为空）

        Returns:
            调度ID
        """
        if schedule_id is None:
            self._schedule_counter += 1
            schedule_id = f"sched-{self._schedule_counter:04d}"

        task.scheduled_at = scheduled_at
        task.status = TaskStatus.QUEUED

        self._schedules[schedule_id] = {
            "task": task,
            "type": "once",
            "scheduled_at": scheduled_at,
            "created_at": datetime.now(),
            "executed_at": None,
        }

        return schedule_id

    def add_interval_schedule(
        self,
        task: PublishTask,
        interval_seconds: int,
        start_after_seconds: int = 0,
        max_runs: int | None = None,
        schedule_id: str | None = None,
    ) -> str:
        """
        添加周期性调度任务

        Args:
            task: 发布任务（每次执行会复制一份）
            interval_seconds: 执行间隔（秒）
            start_after_seconds: 首次执行延迟（秒）
            max_runs: 最大执行次数（None 表示无限）
            schedule_id: 调度ID

        Returns:
            调度ID
        """
        if schedule_id is None:
            self._schedule_counter += 1
            schedule_id = f"sched-{self._schedule_counter:04d}"

        from copy import deepcopy

        self._schedules[schedule_id] = {
            "task_template": task,
            "type": "interval",
            "interval_seconds": interval_seconds,
            "start_after_seconds": start_after_seconds,
            "max_runs": max_runs,
            "run_count": 0,
            "created_at": datetime.now(),
            "last_run_at": None,
            "next_run_at": datetime.now() + timedelta(seconds=start_after_seconds),
        }

        return schedule_id

    def remove_schedule(self, schedule_id: str) -> bool:
        """删除调度任务"""
        if schedule_id in self._schedules:
            del self._schedules[schedule_id]
            return True
        return False

    def pause_schedule(self, schedule_id: str) -> bool:
        """暂停调度"""
        if schedule_id in self._schedules:
            self._schedules[schedule_id]["paused"] = True
            return True
        return False

    def resume_schedule(self, schedule_id: str) -> bool:
        """恢复调度"""
        if schedule_id in self._schedules:
            self._schedules[schedule_id]["paused"] = False
            return True
        return False

    def list_schedules(self) -> list[dict]:
        """列出所有调度"""
        result = []
        for sid, info in self._schedules.items():
            entry = {
                "id": sid,
                "type": info["type"],
                "paused": info.get("paused", False),
                "created_at": info["created_at"].isoformat(),
            }
            if info["type"] == "once":
                entry["scheduled_at"] = info["scheduled_at"].isoformat()
                entry["executed"] = info["executed_at"] is not None
            elif info["type"] == "interval":
                entry["interval_seconds"] = info["interval_seconds"]
                entry["run_count"] = info["run_count"]
                entry["max_runs"] = info["max_runs"]
                entry["next_run_at"] = info["next_run_at"].isoformat()
            result.append(entry)
        return result

    # ========== 调度执行 ==========

    async def start(self):
        """启动调度器"""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self):
        """停止调度器"""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None

    async def _worker_loop(self):
        """调度器主循环"""
        while self._running:
            now = datetime.now()

            # 遍历所有调度
            to_remove = []

            for sid, info in self._schedules.items():
                if info.get("paused", False):
                    continue

                if info["type"] == "once":
                    # 一次性任务
                    if info["executed_at"] is not None:
                        to_remove.append(sid)
                        continue

                    if now >= info["scheduled_at"]:
                        await self._execute_once_task(sid, info)
                        info["executed_at"] = now

                elif info["type"] == "interval":
                    # 周期性任务
                    if now >= info["next_run_at"]:
                        # 检查最大执行次数
                        if info["max_runs"] and info["run_count"] >= info["max_runs"]:
                            to_remove.append(sid)
                            continue

                        from copy import deepcopy
                        task = deepcopy(info["task_template"])
                        task.id = f"{sid}-{info['run_count']}"
                        self.task_queue.add_task(task)

                        info["run_count"] += 1
                        info["last_run_at"] = now
                        info["next_run_at"] = now + timedelta(seconds=info["interval_seconds"])

            # 清理已完成的调度
            for sid in to_remove:
                del self._schedules[sid]

            await asyncio.sleep(5)  # 每 5 秒检查一次

    async def _execute_once_task(self, schedule_id: str, info: dict):
        """执行一次性调度任务"""
        task = info["task"]
        self.task_queue.add_task(task)

    # ========== 便捷方法 ==========

    async def publish_at(
        self,
        title: str,
        content: str,
        platforms: list,
        scheduled_at: datetime,
        **metadata,
    ) -> str:
        """
        便捷方法：定时发布

        Returns:
            调度ID
        """
        from multi_publish.models import PlatformType, PublishTask

        task = PublishTask(
            id=f"task-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            title=title,
            content=content,
            platforms=platforms,
            metadata=metadata,
        )
        return self.add_schedule(task, scheduled_at)

    async def publish_repeatedly(
        self,
        title: str,
        content: str,
        platforms: list,
        interval_seconds: int,
        start_after_seconds: int = 0,
        max_runs: int | None = None,
    ) -> str:
        """
        便捷方法：周期性发布

        Returns:
            调度ID
        """
        from multi_publish.models import PlatformType, PublishTask

        task = PublishTask(
            id=f"task-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            title=title,
            content=content,
            platforms=platforms,
        )
        return self.add_interval_schedule(
            task, interval_seconds, start_after_seconds, max_runs
        )
