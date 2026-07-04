export interface PublishTask { id: string; platform: string; status: "pending" | "running" | "success" | "failed"; title?: string }

const _tasks: PublishTask[] = [];

export function addTask(task: PublishTask): void { _tasks.push(task); }

export function updateTask(id: string, updates: Partial<PublishTask>): void {
  const task = _tasks.find(t => t.id === id);
  if (task) Object.assign(task, updates);
}

export function getTasks(): PublishTask[] { return [..._tasks]; }

export function getActiveCount(): number { return _tasks.filter(t => t.status === "pending" || t.status === "running").length; }

export function clearCompleted(): void {
  for (let i = _tasks.length - 1; i >= 0; i--) {
    if (_tasks[i].status === "success" || _tasks[i].status === "failed") _tasks.splice(i, 1);
  }
}