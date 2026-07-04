export interface OnboardingStep { id: string; title: string; completed: boolean }

const steps: OnboardingStep[] = [
  { id: "welcome", title: "欢迎", completed: false },
  { id: "add-account", title: "添加账号", completed: false },
  { id: "first-publish", title: "首次发布", completed: false },
];

export function getSteps(): OnboardingStep[] { return [...steps]; }

export function completeStep(id: string): void {
  const step = steps.find(s => s.id === id);
  if (step) step.completed = true;
}

export function getProgress(): number {
  const total = steps.length;
  const done = steps.filter(s => s.completed).length;
  return total > 0 ? Math.round((done / total) * 100) : 100;
}

export function isComplete(): boolean { return steps.every(s => s.completed); }

export function reset(): void { steps.forEach(s => { s.completed = false; }); }