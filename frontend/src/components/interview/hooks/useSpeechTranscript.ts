import { useState, useCallback, useEffect, useRef } from 'react'
import type { TranscriptMessage } from '../types'

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

interface UseSpeechTranscriptReturn {
  transcript: TranscriptMessage[]
  isListening: boolean
  addAIMessage: (text: string) => void
  stopListening: () => void
  clearTranscript: () => void
}

/** Check browser support once */
const getSR = (): (new () => SpeechRecognition) | null =>
  window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null

export function useSpeechTranscript(stream: MediaStream | null): UseSpeechTranscriptReturn {
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([
    {
      id: '1',
      sender: 'ai',
      text: "Hello! I'm your SmartHire AI interviewer. Let's start with a coding problem.",
    },
  ])
  const [isListening, setIsListening] = useState(false)

  const recogRef = useRef<SpeechRecognition | null>(null)
  const activeRef = useRef(false)

  const addMessage = useCallback((sender: 'user' | 'ai', text: string) => {
    setTranscript((p) => [...p, { id: uid(), sender, text }])
  }, [])

  const addAIMessage = useCallback((text: string) => addMessage('ai', text), [addMessage])
  const clearTranscript = useCallback(() => setTranscript([]), [])

  const stop = useCallback(() => {
    activeRef.current = false
    recogRef.current?.abort()
    recogRef.current = null
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    const SR = getSR()
    if (!SR) {
      console.warn('[Speech] Web Speech API not supported in this browser')
      return
    }
    if (!stream) {
      console.warn('[Speech] No media stream available yet')
      return
    }
    if (activeRef.current) return

    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US' // ✅ English

    r.onstart = () => {
      console.info('[Speech] Started listening (en-US)')
      setIsListening(true)
    }

    r.onresult = ({ results, resultIndex }: SpeechRecognitionEvent) => {
      for (let i = resultIndex; i < results.length; i++) {
        const text = results[i][0].transcript.trim()
        console.debug('[Speech] result:', results[i].isFinal ? 'FINAL' : 'interim', text)
        if (results[i].isFinal && text) addMessage('user', text)
      }
    }

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      const error = event.error
      console.warn('[Speech] error:', error)
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        stop()
        return
      }
      // other errors: let onend handle restart
    }

    r.onend = () => {
      console.info('[Speech] onend — activeRef:', activeRef.current)
      if (activeRef.current) {
        try {
          r.start()
        } catch (e) {
          console.warn('[Speech] restart failed:', e)
        }
      } else {
        setIsListening(false)
      }
    }

    recogRef.current = r
    activeRef.current = true
    try {
      r.start()
    } catch (e) {
      console.error('[Speech] initial start failed:', e)
      activeRef.current = false
    }
  }, [stream, addMessage, stop])

  useEffect(() => {
    if (stream) start()
    return stop
  }, [stream, start, stop])

  return { transcript, isListening, addAIMessage, stopListening: stop, clearTranscript }
}
