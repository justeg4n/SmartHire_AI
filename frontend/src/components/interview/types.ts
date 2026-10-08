/**
 * Interview feature – shared TypeScript types and interfaces.
 *
 * Centralising types here keeps each component file free of type boilerplate
 * and makes it trivial to update a shape in one place.
 */

// ---------------------------------------------------------------------------
// AI Interviewer
// ---------------------------------------------------------------------------

/** Visual/audio state of the AI agent in the left panel. */
export type AIState = 'listening' | 'thinking' | 'speaking'

/** A single message in the live transcript. */
export interface TranscriptMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
}

// ---------------------------------------------------------------------------
// Code Editor
// ---------------------------------------------------------------------------

/** Language option shown in the language selector. */
export interface LanguageOption {
  /** Value used by Monaco editor (`language` prop). */
  value: string
  /** Human-readable label shown in the dropdown. */
  label: string
}

/** Result returned by the code runner (mock or real). */
export interface CodeRunResult {
  output: string
  durationMs: number
}

// ---------------------------------------------------------------------------
// Emotion Analysis
// ---------------------------------------------------------------------------

/** Candidate emotional state labels. */
export type EmotionLabel = 'Focused' | 'Thinking' | 'Neutral' | 'Frustrated' | 'Confident'

/** Snapshot of the emotion analysis engine output. */
export interface EmotionSnapshot {
  label: EmotionLabel
  /** Confidence score 0–100. */
  score: number
}

// ---------------------------------------------------------------------------
// Session Recorder
// ---------------------------------------------------------------------------

export type UploadStatus = 'idle' | 'recording' | 'uploading' | 'done' | 'error'

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface PermissionsModalProps {
  /** Callback sau khi user grant — useMediaDevices tự quản lý stream */
  onPermissionsGranted: () => Promise<void>
}

export interface LeftPanelProps {
  /** AI state driven externally so WebSocket / voice layer can control it. */
  aiState?: AIState
  /** Transcript messages to render. Pass `undefined` to use default seed. */
  transcript?: TranscriptMessage[]
  /** Whether the mic is actively recording user speech. */
  isListening?: boolean
}

export interface CenterPanelProps {
  /** Initial code displayed in the editor. */
  defaultCode?: string
  /** Initial language key (must match a `LanguageOption.value`). */
  defaultLanguage?: string
  onEndInterview?: () => void
}

export interface RightPanelProps {
  /** Live media stream from `getUserMedia`. Null = camera off. */
  mediaStream: MediaStream | null
  isMicMuted: boolean
  isCameraOff: boolean
  onToggleMic: () => void
  onToggleCamera: () => void
}

/**
 * Top-level workspace layout props.
 *
 * Pass `showPermissionsModal={false}` to skip the gate (e.g. in Storybook /
 * testing where you already have a mock stream).
 */
export interface InterviewWorkspaceProps {
  /** Force-skip the permissions modal. Useful for E2E tests. @default false */
  skipPermissions?: boolean
  /** Override default join handler (e.g. route away on session end). */
  onSessionEnd?: () => void
}
