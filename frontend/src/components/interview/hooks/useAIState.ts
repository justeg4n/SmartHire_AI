/**
 * useAIState
 *
 * Cycles the AI interviewer visual state: listening → thinking → speaking → …
 *
 * Isolating this logic in a hook makes it trivial to:
 *  - Replace the mock with a real WebSocket/WebRTC event
 *  - Pause cycling (e.g. when the candidate is typing)
 *  - Test in isolation without mounting the full panel
 */

import { useEffect, useState } from 'react'
import type { AIState } from '../types'
import { AI_STATE_INTERVAL_MS } from '../config'

const STATE_CYCLE: AIState[] = ['listening', 'thinking', 'speaking']

interface UseAIStateOptions {
  /** Override the cycle interval in milliseconds. Defaults to AI_STATE_INTERVAL_MS. */
  intervalMs?: number
  /** When false the cycling is paused. @default true */
  enabled?: boolean
}

interface UseAIStateReturn {
  aiState: AIState
  /** Imperatively set the state (e.g. from a WebSocket message). */
  setAIState: React.Dispatch<React.SetStateAction<AIState>>
}

export function useAIState({
  intervalMs = AI_STATE_INTERVAL_MS,
  enabled = true,
}: UseAIStateOptions = {}): UseAIStateReturn {
  const [aiState, setAIState] = useState<AIState>('listening')

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      setAIState((prev) => {
        const currentIndex = STATE_CYCLE.indexOf(prev)
        return STATE_CYCLE[(currentIndex + 1) % STATE_CYCLE.length]
      })
    }, intervalMs)

    return () => clearInterval(id)
  }, [intervalMs, enabled])

  return { aiState, setAIState }
}
