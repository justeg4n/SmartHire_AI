import { useState, useCallback, useRef } from 'react'
import type { UploadStatus } from '../types'

interface UseSessionRecorderReturn {
  uploadStatus: UploadStatus
  duration: number
  startRecording: (stream: MediaStream) => void
  stopAndUpload: (
    sessionId: string,
    transcript: { sender: string; text: string }[],
  ) => Promise<void>
}

const MIME =
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(
    (t) => MediaRecorder.isTypeSupported(t),
  ) ?? 'video/webm'

const EXT = MIME.includes('mp4') ? 'mp4' : 'webm'

/** Download a blob as a file to the user's machine */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function useSessionRecorder(): UseSessionRecorderReturn {
  const [uploadStatus, setStatus] = useState<UploadStatus>('idle')
  const [duration, setDuration] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef(0)

  const startRecording = useCallback((stream: MediaStream) => {
    if (recorderRef.current) return

    const rec = new MediaRecorder(stream, {
      mimeType: MIME,
      videoBitsPerSecond: 800_000,
      audioBitsPerSecond: 96_000,
    })

    chunksRef.current = []
    rec.ondataavailable = ({ data }) => {
      if (data.size > 0) chunksRef.current.push(data)
    }
    rec.start(1000)

    recorderRef.current = rec
    startRef.current = Date.now()
    setStatus('recording')
    setDuration(0)

    timerRef.current = setInterval(
      () => setDuration(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    )
  }, [])

  const stopAndUpload = useCallback(
    async (sessionId: string, transcript: { sender: string; text: string }[]) => {
      const rec = recorderRef.current
      if (!rec) return

      if (timerRef.current) clearInterval(timerRef.current)

      await new Promise<void>((res) => {
        rec.onstop = () => res()
        rec.stop()
      })
      recorderRef.current = null
      setStatus('uploading')

      try {
        const blob = new Blob(chunksRef.current, { type: MIME })
        chunksRef.current = []
        const finalDuration = Math.floor((Date.now() - startRef.current) / 1000)

        const apiBase = import.meta.env.VITE_API_GATEWAY_URL

        if (apiBase) {
          // ── Production: real S3 upload ──────────────────────────────────
          const { uploadUrl, s3Key } = await fetch(`${apiBase}/sessions/${sessionId}/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: `${sessionId}.${EXT}`,
              mimeType: MIME,
              sizeBytes: blob.size,
            }),
          }).then((r) => {
            if (!r.ok) throw new Error('presign failed')
            return r.json()
          })

          const up = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': MIME },
            body: blob,
          })
          if (!up.ok) throw new Error('s3 upload failed')

          await fetch(`${apiBase}/sessions/${sessionId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ s3Key, durationSeconds: finalDuration, transcript }),
          })
        } else {
          // ── Dev/Demo: no backend → download file locally ────────────────
          console.info('[SessionRecorder] No VITE_API_GATEWAY_URL — saving recording locally.')
          await new Promise((res) => setTimeout(res, 800)) // simulate upload delay
          downloadBlob(blob, `smarthire-session-${sessionId}.${EXT}`)
        }

        setStatus('done')
      } catch (e) {
        console.error('[SessionRecorder] upload error:', e)
        setStatus('error')
      }
    },
    [],
  )

  return { uploadStatus, duration, startRecording, stopAndUpload }
}
