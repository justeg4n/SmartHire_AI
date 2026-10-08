/**
 * Interview feature – static configuration.
 *
 * Defining data outside components avoids re-creating arrays/objects on every
 * render and makes adding languages, emotions, or copy trivial.
 */

import type { EmotionLabel, LanguageOption } from './types'

// ---------------------------------------------------------------------------
// Code editor
// ---------------------------------------------------------------------------

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: 'javascript', label: 'Node.js 20' },
  { value: 'python', label: 'Python 3.12' },
  { value: 'java', label: 'Java 21' },
  { value: 'typescript', label: 'TypeScript 5' },
  { value: 'go', label: 'Go 1.22' },
]

export const DEFAULT_CODE_PLACEHOLDER = '// Write your solution here\n'

export const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 24,
  padding: { top: 16 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth' as const,
  wordWrap: 'on' as const,
  tabSize: 2,
} as const

// ---------------------------------------------------------------------------
// Emotion analysis
// ---------------------------------------------------------------------------

export const ALL_EMOTIONS: EmotionLabel[] = [
  'Focused',
  'Thinking',
  'Neutral',
  'Frustrated',
  'Confident',
]

/** Tailwind text colour class per emotion label. */
export const EMOTION_COLOR: Record<EmotionLabel, string> = {
  Frustrated: 'text-orange-400',
  Focused: 'text-emerald-400',
  Confident: 'text-emerald-400',
  Thinking: 'text-teal-400',
  Neutral: 'text-zinc-300',
}

/** Tailwind bg colour for the emotion progress bar fill. */
export const EMOTION_BAR_COLOR: Record<EmotionLabel, string> = {
  Frustrated: 'bg-orange-400',
  Focused: 'bg-emerald-500',
  Confident: 'bg-emerald-400',
  Thinking: 'bg-teal-400',
  Neutral: 'bg-zinc-400',
}

// ---------------------------------------------------------------------------
// AI State cycling interval (ms) – used by the mock hook
// ---------------------------------------------------------------------------

export const AI_STATE_INTERVAL_MS = 5000

// ---------------------------------------------------------------------------
// Mock WebSocket / emotion polling interval (ms)
// ---------------------------------------------------------------------------

export const EMOTION_POLL_INTERVAL_MS = 5000

// ---------------------------------------------------------------------------
// Default transcript seed
// ---------------------------------------------------------------------------

export const DEFAULT_TRANSCRIPT = [
  {
    id: '1',
    sender: 'ai' as const,
    text: "Hello! I'm your SmartHire AI interviewer. Let's start with a coding problem. Please read the prompt carefully before typing.",
  },
]
