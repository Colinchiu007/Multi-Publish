/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 flutter-skill-bridge.js (JS 版) 替代。
 */

export interface FlutterSkillResult { success: boolean; output?: string; error?: string }

let _flutterSkill: { execute: (skill: string, params: Record<string, unknown>) => Promise<FlutterSkillResult> } | null = null;

export function init(skill: typeof _flutterSkill): void { _flutterSkill = skill; }

export async function execute(skill: string, params: Record<string, unknown> = {}): Promise<FlutterSkillResult> {
  if (!_flutterSkill) throw new Error("Flutter skill not initialized");
  return _flutterSkill.execute(skill, params);
}