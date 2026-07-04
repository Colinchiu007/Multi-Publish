export interface FlutterSkillResult { success: boolean; output?: string; error?: string }

let _flutterSkill: { execute: (skill: string, params: Record<string, unknown>) => Promise<FlutterSkillResult> } | null = null;

export function init(skill: typeof _flutterSkill): void { _flutterSkill = skill; }

export async function execute(skill: string, params: Record<string, unknown> = {}): Promise<FlutterSkillResult> {
  if (!_flutterSkill) throw new Error("Flutter skill not initialized");
  return _flutterSkill.execute(skill, params);
}