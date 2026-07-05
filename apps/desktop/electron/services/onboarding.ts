/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 onboarding.js (JS 版) 替代。
 */

export interface OnboardingStep { id: string; title: string; completed: boolean }

const steps: OnboardingStep[] = [
  { id: "welcome", title: "娆㈣繋", completed: false },
  { id: "add-account", title: "娣诲姞璐﹀彿", completed: false },
  { id: "first-publish", title: "棣栨鍙戝竷", completed: false },
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