/**
 * Story2Video \u5f15\u64ce\u7c7b\u578b\u5b9a\u4e49
 * \u4ece Story2Video src/types/index.ts \u548c src/types/effects.ts \u63d0\u53d6
 */

// ==================== \u6c34\u5370\u7c7b\u578b ====================

/** \u6c34\u5370\u4f4d\u7f6e */
export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

/** \u6c34\u5370\u914d\u7f6e */
export interface WatermarkConfig {
  /** \u662f\u5426\u542f\u7528 */
  enabled: boolean;
  /** \u6c34\u5370\u6587\u5b57 */
  text: string;
  /** \u6c34\u5370\u4f4d\u7f6e */
  position: WatermarkPosition;
  /** \u5b57\u53f7 (px) */
  fontSize: number;
  /** \u900f\u660e\u5ea6 (0-1) */
  opacity: number;
  /** \u6587\u5b57\u989c\u8272 */
  color: string;
}

// ==================== \u6548\u679c\u7c7b\u578b ====================

/** \u56fe\u7247\u52a8\u6001\u6548\u679c\u7c7b\u578b */
export type ImageEffect =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-pan'
  | 'rotate'
  | 'blur-in'
  | 'none';

/** \u8f6c\u573a\u6548\u679c\u7c7b\u578b */
export type TransitionEffect =
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'none';

/** \u7279\u6548\u5143\u6570\u636e */
export interface EffectMeta {
  id: string;
  label: string;
  description: string;
  /** \u9002\u7528\u4e8e\u54ea\u79cd\u573a\u666f */
  suitable: string[];
  /** CSS \u6216\u6e32\u67d3\u63d0\u793a\uff08\u53ef\u9009\uff09 */
  hint?: string;
}
