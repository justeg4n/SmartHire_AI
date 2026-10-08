/**
 * Public API for the Interview feature module.
 *
 * Default entry point for consuming code:
 *   import { InterviewWorkspace } from '@/components/interview'
 *
 * Individual sub-components and hooks can also be imported directly:
 *   import { LeftPanel, CenterPanel, RightPanel } from '@/components/interview'
 *   import { useAIState, useEmotionAnalysis, useCodeRunner } from '@/components/interview'
 */

// ---------------------------------------------------------------------------
// Page-level orchestrator
// ---------------------------------------------------------------------------
export { InterviewWorkspace } from './InterviewWorkspace'

// ---------------------------------------------------------------------------
// Panel sub-components (independently testable & composable)
// ---------------------------------------------------------------------------
export { PermissionsModal } from './PermissionsModal'
export { LeftPanel } from './LeftPanel'
export { CenterPanel } from './CenterPanel'
export { RightPanel } from './RightPanel'

// ---------------------------------------------------------------------------
// Custom hooks
// ---------------------------------------------------------------------------
export { useAIState } from './hooks/useAIState'
export { useEmotionAnalysis } from './hooks/useEmotionAnalysis'
export { useCodeRunner } from './hooks/useCodeRunner'

// ---------------------------------------------------------------------------
// Static config (useful for Storybook args / test fixtures)
// ---------------------------------------------------------------------------
export {
  LANGUAGE_OPTIONS,
  DEFAULT_CODE_PLACEHOLDER,
  MONACO_OPTIONS,
  ALL_EMOTIONS,
  EMOTION_COLOR,
  EMOTION_BAR_COLOR,
  DEFAULT_TRANSCRIPT,
} from './config'

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------
export type {
  AIState,
  TranscriptMessage,
  LanguageOption,
  CodeRunResult,
  EmotionLabel,
  EmotionSnapshot,
  PermissionsModalProps,
  LeftPanelProps,
  CenterPanelProps,
  RightPanelProps,
  InterviewWorkspaceProps,
} from './types'
