/**
 * segmentit 模块类型声明（最小化）
 * segmentit 无内置 TypeScript 类型声明，此处提供最小类型描述
 */

declare module 'segmentit' {
  export interface SegmentitToken {
    w: string;
  }

  export class Segment {
    useDefault(): void;
    doSegment(text: string): SegmentitToken[];
  }

  export function useDefault(segment: Segment): void;
}
