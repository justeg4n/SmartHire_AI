/**
 * useEmotionAnalysis
 *
 * Provides a mock real-time emotion snapshot and connection status.
 *
 * Swap the `setInterval` body for a real WebSocket listener when the
 * backend emotion engine is ready — the hook's public API stays identical.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ALL_EMOTIONS, EMOTION_POLL_INTERVAL_MS } from '../config'
import type { EmotionLabel, EmotionSnapshot } from '../types'

interface UseEmotionAnalysisOptions {
  /** Override poll interval in milliseconds. */
  intervalMs?: number
  /** When false the polling is paused. @default true */
  enabled?: boolean
}

interface UseEmotionAnalysisReturn {
  snapshot: EmotionSnapshot
  isConnected: boolean
}

function randomEmotion(): EmotionLabel {
  return ALL_EMOTIONS[Math.floor(Math.random() * ALL_EMOTIONS.length)]
}

function randomScore(): number {
  return Math.floor(Math.random() * 40) + 60
}

export function useEmotionAnalysis({
  intervalMs = EMOTION_POLL_INTERVAL_MS,
  enabled = true,
}: UseEmotionAnalysisOptions = {}): UseEmotionAnalysisReturn {
  const [snapshot, setSnapshot] = useState<EmotionSnapshot>({
    label: 'Neutral',
    score: 65,
  })
  const [isConnected, setIsConnected] = useState(true)

  const simulateDisconnect = useCallback(() => {
    if (Math.random() > 0.95) {
      setIsConnected(false)
      toast.error('WebSocket Disconnected', {
        description: 'Attempting to reconnect…',
      })

      const reconnectId = window.setTimeout(() => {
        setIsConnected(true)
        toast.success('Connection Restored')
      }, 3000)

      return () => clearTimeout(reconnectId)
    }
    return undefined
  }, [])

  useEffect(() => {
    if (!enabled) return

    const id = setInterval(() => {
      setSnapshot({ label: randomEmotion(), score: randomScore() })
      simulateDisconnect()
    }, intervalMs)

    return () => clearInterval(id)
  }, [intervalMs, enabled, simulateDisconnect])

  return { snapshot, isConnected }
}
