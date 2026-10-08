import { useState, useCallback, useEffect, useRef } from 'react'

const SESSION_KEY = 'smarthire_media_granted'

// Định nghĩa ngoài component — không tạo lại mỗi render
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: 'user',
}
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  sampleRate: 44100,
}

function stopVideoTracks(stream: MediaStream) {
  stream.getVideoTracks().forEach((t) => {
    t.onended = null
    try {
      t.stop()
    } catch {
      /* ignore */
    }
  })
}

export interface UseMediaDevicesReturn {
  stream: MediaStream | null
  isMicMuted: boolean
  isCameraOff: boolean
  permissionsGranted: boolean
  error: string | null
  requestPermissions: () => Promise<MediaStream>
  toggleMic: () => void
  toggleCamera: () => Promise<void>
  stopAll: () => void
}

export function useMediaDevices(): UseMediaDevicesReturn {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [permissionsGranted, setGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const isRestartingRef = useRef(false)
  const isCameraOffRef = useRef(false)
  // Lưu onended handler 1 lần — tái sử dụng cho mọi track mới
  const onEndedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    isCameraOffRef.current = isCameraOff
  }, [isCameraOff])

  // ── coreRestart: deps rỗng, chỉ đọc refs ─────────────────────────────────
  const coreRestart = useCallback(async () => {
    if (!streamRef.current || isRestartingRef.current) return
    isRestartingRef.current = true
    try {
      stopVideoTracks(streamRef.current)

      const ns = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS })
      const nt = ns.getVideoTracks()[0]

      if (!streamRef.current) {
        nt.stop()
        return
      }

      if (onEndedRef.current) nt.onended = onEndedRef.current

      streamRef.current.getVideoTracks().forEach((t) => streamRef.current!.removeTrack(t))
      streamRef.current.addTrack(nt)

      // Tạo stream object mới → stream.id đổi → <video key={id}> re-mount
      const updated = new MediaStream([...streamRef.current.getAudioTracks(), nt])
      streamRef.current = updated
      setStream(updated)
      setIsCameraOff(false)
      setError(null)
    } catch {
      setIsCameraOff(true)
      setError('Camera unavailable. Please re-enable your camera.')
    } finally {
      isRestartingRef.current = false
    }
  }, []) // ← deps rỗng, không re-create

  // ── Tạo onended handler 1 lần duy nhất ───────────────────────────────────
  useEffect(() => {
    onEndedRef.current = () => {
      setIsCameraOff(true)
      setError(null)
      const timer = setTimeout(() => coreRestart(), 500)
      return () => clearTimeout(timer)
    }
  }, [coreRestart])

  const attachOnEnded = useCallback((track: MediaStreamTrack) => {
    if (onEndedRef.current) track.onended = onEndedRef.current
  }, [])

  // ── startStream ───────────────────────────────────────────────────────────
  const startStream = useCallback(async (): Promise<MediaStream> => {
    const s = await navigator.mediaDevices.getUserMedia({
      video: VIDEO_CONSTRAINTS,
      audio: AUDIO_CONSTRAINTS,
    })
    s.getVideoTracks().forEach(attachOnEnded)
    streamRef.current = s
    setStream(s)
    setIsMicMuted(false)
    setIsCameraOff(false)
    setError(null)
    return s
  }, [attachOnEnded])

  // ── requestPermissions ────────────────────────────────────────────────────
  const requestPermissions = useCallback(async (): Promise<MediaStream> => {
    const s = await startStream()
    sessionStorage.setItem(SESSION_KEY, 'true')
    setGranted(true)
    return s
  }, [startStream])

  // ── Auto-start nếu session đã grant ──────────────────────────────────────
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) !== 'true') return
    startStream()
      .then(() => setGranted(true))
      .catch(() => sessionStorage.removeItem(SESSION_KEY))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Lớp 1: devicechange ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const vt = streamRef.current?.getVideoTracks()[0]
      if (vt?.readyState === 'ended') coreRestart()
    }
    navigator.mediaDevices.addEventListener('devicechange', handler)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }, [coreRestart])

  // ── Lớp 2: visibilitychange ───────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return
      const vt = streamRef.current?.getVideoTracks()[0]
      if (vt?.readyState === 'ended') coreRestart()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [coreRestart])

  // ── Lớp 3: Polling 2s safety net ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const vt = streamRef.current?.getVideoTracks()[0]
      if (vt?.readyState === 'ended' && !isRestartingRef.current) {
        setIsCameraOff(true)
        coreRestart()
      }
    }, 2000)
    return () => clearInterval(id)
  }, [coreRestart])

  // ── toggleMic ─────────────────────────────────────────────────────────────
  const toggleMic = useCallback(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled
    })
    setIsMicMuted((p) => !p)
  }, [])

  // ── toggleCamera — thông minh check track state ───────────────────────────
  const toggleCamera = useCallback(async () => {
    const vt = streamRef.current?.getVideoTracks()[0]
    if (isCameraOffRef.current) {
      if (!vt || vt.readyState === 'ended') {
        await coreRestart() // track bị OS kill → restart
      } else {
        vt.enabled = true
        setIsCameraOff(false) // track còn sống → chỉ re-enable
      }
    } else {
      if (vt) vt.enabled = false
      setIsCameraOff(true)
    }
  }, [coreRestart])

  // ── stopAll ────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => {
      t.onended = null
      try {
        t.stop()
      } catch {
        /* ignore */
      }
    })
    streamRef.current = null
    setStream(null)
    setGranted(false)
    setIsMicMuted(false)
    setIsCameraOff(false)
    setError(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [])

  // Cleanup unmount
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => {
        t.onended = null
        try {
          t.stop()
        } catch {
          /* ignore */
        }
      })
    },
    [],
  )

  return {
    stream,
    isMicMuted,
    isCameraOff,
    permissionsGranted,
    error,
    requestPermissions,
    toggleMic,
    toggleCamera,
    stopAll,
  }
}
